const { MessageFlags } = require("discord.js");

// AI chat: responds when the bot is @-mentioned or someone replies to one of
// its messages. Assembles per-user memory (short-term turns + long-term
// summary from Postgres) around each request and periodically re-summarizes.
class ChatHandler {
    constructor(cfg, ai, db) {
        this.cfg = cfg;
        this.ai = ai;
        this.db = db;
    }

    async handle(client, message) {
        // Never react to ourselves or other bots.
        if (!message.author || message.author.bot) return;
        if (!(await this.shouldRespond(client, message))) return;

        let text = this.cleanContent(client, message);
        if (text === "") {
            text = "(no text — the user just pinged you, greet them)";
        }

        const displayName = displayNameOf(message);

        const stopTyping = this.keepTyping(message.channel);
        try {
            const reply = await this.generate(message, text, displayName);
            stopTyping();
            const chunks = splitMessage(reply, 2000);
            for (let i = 0; i < chunks.length; i++) {
                if (i === 0) {
                    await message.reply(chunks[i]);
                } else {
                    await message.channel.send(chunks[i]);
                }
            }
        } catch (err) {
            console.error(`generate error for user ${message.author.id}:`, err);
            const apology = err.status === 429
                ? "The AI model is over capacity right now — give it a minute and ping me again."
                : "Sorry, I hit an error trying to answer that.";
            await message.reply(apology).catch(() => {});
        } finally {
            stopTyping();
        }
    }

    // True if the bot was @-mentioned or someone replied to it. Replies to
    // release announcements (Components V2 messages) don't count — those need
    // an explicit mention, so people commenting on updates don't summon the AI.
    async shouldRespond(client, message) {
        if (message.mentions.users.has(client.user.id)) return true;
        if (message.reference?.messageId) {
            const ref = await message.fetchReference().catch(() => null);
            if (ref?.author?.id === client.user.id && !ref.flags?.has(MessageFlags.IsComponentsV2)) {
                return true;
            }
        }
        return false;
    }

    // Strip the bot's own mention; render other user mentions as readable
    // names so the model isn't fed raw <@id> tokens.
    cleanContent(client, message) {
        return message.content.replace(/<@!?(\d+)>/g, (raw, id) => {
            if (id === client.user.id) return "";
            const user = message.mentions.users.get(id);
            return user ? `@${user.displayName ?? user.username}` : raw;
        }).trim();
    }

    // generate assembles memory + context and calls the model, then persists the turn.
    async generate(message, text, displayName) {
        const userId = message.author.id;

        await this.db.upsertUser(userId, displayName);
        const summary = await this.db.getSummary(userId);
        const history = await this.db.recentMessages(userId, this.cfg.shortTermLimit);

        // Payload order: system prompt -> knowledge base -> current speaker ->
        // long-term memory -> short-term history -> new turn.
        const msgs = [{ role: "system", content: this.cfg.systemPrompt }];

        if (this.cfg.knowledge.trim() !== "") {
            msgs.push({
                role: "system",
                content: "Knowledge base. Use this to answer questions accurately. If the answer is here, use it; " +
                    "if a question is not covered, say you are not sure rather than guessing.\n\n" + this.cfg.knowledge,
            });
        }

        msgs.push({
            role: "system",
            content: `You are currently talking to the Discord user whose display name is "${displayName}". Address them naturally.`,
        });

        if (summary.trim() !== "") {
            msgs.push({
                role: "system",
                content: `Long-term memory about ${displayName} (things you learned in past conversations):\n${summary}`,
            });
        }

        for (const h of history) {
            const msg = { role: h.role, content: h.content };
            if (h.role === "user") {
                msg.name = sanitizeName(displayName);
            }
            msgs.push(msg);
        }

        msgs.push({
            role: "user",
            content: `${displayName}: ${text}`,
            name: sanitizeName(displayName),
        });

        const reply = (await this.ai.chat(msgs)).trim();

        // Persist both sides of the exchange.
        await this.db.addMessage(userId, message.channelId, "user", text)
            .catch(err => console.error("store user message:", err));
        await this.db.addMessage(userId, message.channelId, "assistant", reply)
            .catch(err => console.error("store assistant message:", err));

        // Refresh long-term memory in the background; don't delay the reply.
        this.maybeSummarize(userId, displayName)
            .catch(err => console.error(`summarize error for ${userId}:`, err));

        return reply;
    }

    // maybeSummarize rebuilds the long-term summary every summaryEvery messages.
    async maybeSummarize(userId, displayName) {
        if (this.cfg.summaryEvery <= 0) return;
        const count = await this.db.countMessages(userId);
        if (count % this.cfg.summaryEvery !== 0) return;

        const all = await this.db.allMessages(userId);
        const log = all.map(m => `${m.role}: ${m.content}`).join("\n");

        const prompt = [
            {
                role: "system",
                content: "You compress chat logs into durable long-term memory. " +
                    `Summarize the durable facts, preferences, recurring topics and tone for the user named "${displayName}". ` +
                    "Write 3-8 concise bullet-style lines. Only include things worth remembering long-term. " +
                    "Do not include any content about minors or anything against Discord's terms.",
            },
            { role: "user", content: "Conversation log:\n" + log },
        ];

        const summary = await this.ai.chat(prompt);
        await this.db.setSummary(userId, summary.trim());
    }

    // keepTyping refreshes the typing indicator every few seconds until stopped.
    keepTyping(channel) {
        channel.sendTyping().catch(() => {});
        const timer = setInterval(() => channel.sendTyping().catch(() => {}), 7_000);
        return () => clearInterval(timer);
    }
}

// displayNameOf picks the best human name: guild nickname > global name > username.
function displayNameOf(message) {
    return message.member?.nickname || message.author.globalName || message.author.username;
}

// sanitizeName makes a display name safe for the OpenAI/OpenRouter `name`
// field (which disallows spaces and most punctuation).
function sanitizeName(name) {
    let out = name.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (out === "") return "user";
    return out.slice(0, 64);
}

// splitMessage breaks text into <=limit chunks on line/word boundaries.
function splitMessage(s, limit) {
    if (s.length <= limit) return [s];
    const chunks = [];
    while (s.length > limit) {
        let cut = s.lastIndexOf("\n", limit);
        if (cut <= 0) cut = s.lastIndexOf(" ", limit);
        if (cut <= 0) cut = limit;
        chunks.push(s.slice(0, cut));
        s = s.slice(cut).replace(/^[ \n]+/, "");
    }
    if (s !== "") chunks.push(s);
    return chunks;
}

module.exports = { ChatHandler };
