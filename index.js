require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, Partials } = require("discord.js");

const releases = require("./announcer/releases");
const aiConfig = require("./ai/config");
const { Store } = require("./ai/store");
const { OpenRouterClient } = require("./ai/openrouter");
const { ChatHandler } = require("./ai/chat");

// Two Discord applications, one process. PrismBot owns the release
// announcements (and every message already posted, so its token must stay the
// original application's); PrismAI is a separate application with its own
// token so the two identities are distinct in the member list.
const announcerToken = process.env.ANNOUNCER_TOKEN;
if (!announcerToken) throw new Error("ANNOUNCER_TOKEN is not set");

const announcerCfg = {
    channelId: process.env.DISCORD_CHANNEL_ID,
    githubSecret: process.env.GITHUB_WEBHOOK_SECRET,
};

// Guilds is enough to post and to receive button interactions — the announcer
// never reads message content.
const announcer = new Client({ intents: [GatewayIntentBits.Guilds] });
announcer.once("ready", () => console.log(`Announcer logged in as ${announcer.user.tag}`));
announcer.on("interactionCreate", releases.handleLanguageButton);

const aiCfg = aiConfig.load();
const aiToken = process.env.AI_TOKEN;
// The AI side needs its own token plus OpenRouter and Postgres; without them
// the process still runs, but only announces releases.
const aiEnabled = Boolean(aiToken && aiCfg.openRouterKey && aiCfg.databaseUrl);

let ai = null;
let db = null;
if (aiEnabled) {
    db = new Store(aiCfg.databaseUrl);
    const chat = new ChatHandler(aiCfg, new OpenRouterClient(aiCfg.openRouterKey, aiCfg.openRouterModel), db);
    ai = new Client({
        // Chat needs the privileged MESSAGE CONTENT intent (enable it in the
        // Discord developer portal on the PrismAI application, not PrismBot's).
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.MessageContent,
        ],
        partials: [Partials.Channel], // needed to receive DMs
    });
    ai.once("ready", () => console.log(`PrismAI logged in as ${ai.user.tag}`));
    ai.on("messageCreate", (message) => {
        chat.handle(ai, message).catch(err => console.error("chat error:", err));
    });
} else {
    console.warn("AI chat disabled: set AI_TOKEN, OPENROUTER_API_KEY and DATABASE_URL to enable it");
}

const app = express();
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

// Health endpoint — point an uptime pinger here to keep Render's free tier
// from spinning the service (and both Discord connections) down.
app.get("/", (req, res) => res.send("PrismBot is up"));
app.post("/webhook", releases.webhookHandler(announcer, announcerCfg));

const PORT = process.env.PORT || 3000;

async function main() {
    // Bind the port before anything slow (DB init, Discord login) — Render
    // kills deploys whose port never opens, and it forwards traffic to the
    // port in the PORT env var.
    await new Promise((resolve, reject) => {
        app.listen(PORT, () => {
            console.log(`Webhook server listening on port ${PORT}`);
            resolve();
        }).on("error", reject);
    });
    if (db) await db.init();
    await announcer.login(announcerToken);
    if (ai) await ai.login(aiToken);
}

async function shutdown() {
    console.log("shutting down.");
    await announcer.destroy().catch(() => {});
    if (ai) await ai.destroy().catch(() => {});
    if (db) await db.close().catch(() => {});
    process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch(err => {
    console.error("startup failed:", err);
    process.exit(1);
});
