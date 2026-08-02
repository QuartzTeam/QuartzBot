const crypto = require("crypto");
const {
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
} = require("discord.js");

const ROLE_ID = "1501202364302889142";
const PRERELEASE_ROLE_ID = "1520786654238081094";

// Friendly names for assets we know by filename. Anything not listed here —
// including every asset from a repo other than Quartz — falls back to its own
// filename, so a new repo needs no code change to announce correctly.
const ASSET_LABELS = {
    "Quartz.zip": "MelonLoader",
    "QuartzUmm.zip": "UMM",
    "Bismuth.zip": "UMM",
};

const STRINGS = {
    en: {
        prerelease: "🧪 New Pre-release!",
        release: "🚀 New Update!",
        download: "📦 **Download**",
        changelog: "📋 **Changelog**",
        noChangelog: "No changelog provided.",
        noAssets: "No downloadable files in this release.",
        toggleLabel: "한국어",
    },
    ko: {
        prerelease: "🧪 새 프리릴리스!",
        release: "🚀 새 업데이트!",
        download: "📦 **다운로드**",
        changelog: "📋 **변경 사항**",
        noChangelog: "변경 사항이 없습니다.",
        noAssets: "이 릴리스에는 다운로드 파일이 없습니다.",
        toggleLabel: "English",
    },
};

const HANGUL = /\p{Script=Hangul}/u;
// A heading whose text is just a language name, optionally with a
// parenthetical — "## English", "## 한국어", "## 한국어 (Korean)".
const LANG_HEADER = /^#{1,6}\s*(?:English|Korean|한국어)(?:\s*\([^)]*\))?\s*:?\s*$/i;
const DIVIDER = /^-{3,}\s*$/;

function verifySignature(req, secret) {
    if (!secret) {
        console.error("GITHUB_WEBHOOK_SECRET is not set; rejecting webhook");
        return false;
    }
    const sig = req.headers["x-hub-signature-256"];
    if (!sig || !req.rawBody) return false;
    // GitHub signs the raw request bytes — hashing re-serialized req.body
    // can produce different bytes and a false mismatch.
    const digest = "sha256=" + crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
    const sigBuf = Buffer.from(sig);
    const digestBuf = Buffer.from(digest);
    return sigBuf.length === digestBuf.length && crypto.timingSafeEqual(sigBuf, digestBuf);
}

// The languages are detected by script, not by headers: the Korean section
// starts at the first line containing Hangul and runs to the end of the body.
// Language headers, when present at all, are stripped as presentation noise —
// the release format has changed around them before. An optional "---" trailer
// with no Hangul (build number, compare link) belongs to both views.
function splitLanguages(body) {
    const lines = (body || "").split(/\r?\n/).filter(line => !LANG_HEADER.test(line));
    const koStart = lines.findIndex(line => HANGUL.test(line));
    if (koStart === -1) {
        return { en: lines.join("\n").trim(), ko: null };
    }

    const enLines = lines.slice(0, koStart);
    let koLines = lines.slice(koStart);

    let trailer = "";
    for (let i = koLines.length - 1; i >= 0; i--) {
        if (!DIVIDER.test(koLines[i])) continue;
        const tail = koLines.slice(i + 1);
        if (tail.some(line => line.trim()) && !tail.some(line => HANGUL.test(line))) {
            trailer = "\n\n" + koLines.slice(i).join("\n").trim();
            koLines = koLines.slice(0, i);
        }
        break;
    }

    const en = (enLines.join("\n").replace(/\n*-{3,}\s*$/, "").trim() + trailer).trim();
    const ko = (koLines.join("\n").replace(/\n*-{3,}\s*$/, "").trim() + trailer).trim();
    return { en, ko };
}

function truncate(text, max) {
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

// Cache webhook payloads so language toggles don't need to hit the GitHub
// API; falls back to the API after a restart.
const releaseCache = new Map();

function cacheKey(repoFullName, tag) {
    return `${repoFullName}:${tag}`;
}

async function getRelease(repoFullName, tag) {
    const key = cacheKey(repoFullName, tag);
    if (releaseCache.has(key)) return releaseCache.get(key);

    const headers = { "User-Agent": "PrismBot", Accept: "application/vnd.github+json" };
    // Unauthenticated GitHub API limits are per-IP and shared with every
    // other tenant on the host; a token gets a dedicated 5000/hr.
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(
        `https://api.github.com/repos/${repoFullName}/releases/tags/${encodeURIComponent(tag)}`,
        { headers }
    );
    if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
    const release = await res.json();
    releaseCache.set(key, release);
    return release;
}

function buildReleaseMessage(release, repoFullName, lang) {
    const repoName = repoFullName.split("/")[1];
    const { en, ko } = splitLanguages(release.body);
    if (lang === "ko" && !ko) lang = "en";
    const t = STRINGS[lang];
    const changelog = (lang === "ko" ? ko : en) || ko || t.noChangelog;

    const assets = release.assets ?? [];

    const title =
        `## ${release.prerelease ? t.prerelease : t.release}\n` +
        `**${release.name || release.tag_name}**`;

    const downloads =
        `${t.download}\n` +
        (assets.length
            ? assets.map(a => `\`${a.name}\`${ASSET_LABELS[a.name] ? ` — ${ASSET_LABELS[a.name]}` : ""}\n`).join("")
            : `${t.noAssets}\n`);

    const publishedAt = Math.floor(new Date(release.published_at).getTime() / 1000);

    const container = new ContainerBuilder()
        .setAccentColor(release.prerelease ? 0xffa500 : 0x5865f2); // orange for prerelease, purple for stable

    if (ko) {
        // Title with the language toggle as its accessory, top right
        container.addSectionComponents(section =>
            section
                .addTextDisplayComponents(td => td.setContent(title))
                .setButtonAccessory(btn =>
                    btn
                        .setCustomId(`lang:${lang === "ko" ? "en" : "ko"}:${repoFullName}:${release.tag_name}`)
                        .setLabel(t.toggleLabel)
                        // the accessory callback yields the raw builders-package
                        // ButtonBuilder, which only takes the object emoji form
                        .setEmoji({ name: "🌐" })
                        .setStyle(ButtonStyle.Secondary)
                )
        );
    } else {
        container.addTextDisplayComponents(td => td.setContent(title));
    }

    container
        .addTextDisplayComponents(td => td.setContent(downloads))
        .addTextDisplayComponents(td => td.setContent(`${t.changelog}\n${truncate(changelog, 3500)}`))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td => td.setContent(`-# ${repoName} > JRP • <t:${publishedAt}:f>`));

    const buttons = new ActionRowBuilder().addComponents(
        // ponytail: 4-asset cap — Discord allows 5 buttons per row and the
        // GitHub link takes one. Paginate if a repo ever ships more.
        ...assets.slice(0, 4).map(a =>
            new ButtonBuilder()
                .setLabel(truncate(`Download (${ASSET_LABELS[a.name] ?? a.name})`, 80))
                .setEmoji("⬇️")
                .setStyle(ButtonStyle.Link)
                .setURL(a.browser_download_url)
        ),
        new ButtonBuilder()
            .setLabel("View on GitHub")
            .setEmoji("🔗")
            .setStyle(ButtonStyle.Link)
            .setURL(release.html_url)
    );

    return [container, buttons];
}

// Express handler for the GitHub release webhook.
function webhookHandler(client, cfg) {
    return async (req, res) => {
        if (!verifySignature(req, cfg.githubSecret)) {
            return res.sendStatus(401);
        }

        const event = req.headers["x-github-event"];
        if (event !== "release" || req.body.action !== "published") {
            return res.sendStatus(200);
        }

        const release = req.body.release;
        const repo = req.body.repository;

        releaseCache.set(cacheKey(repo.full_name, release.tag_name), release);

        try {
            const channel = await client.channels.fetch(cfg.channelId);
            const pingRole = release.prerelease ? PRERELEASE_ROLE_ID : ROLE_ID;

            await channel.send({
                components: [
                    new TextDisplayBuilder().setContent(`<@&${pingRole}>`),
                    ...buildReleaseMessage(release, repo.full_name, "en"),
                ],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { roles: [pingRole] },
            });

            res.sendStatus(200);
        } catch (err) {
            console.error("Failed to send message:", err);
            res.sendStatus(500);
        }
    };
}

// Button-interaction handler for the language toggle.
async function handleLanguageButton(interaction) {
    if (!interaction.isButton() || !interaction.customId.startsWith("lang:")) return;

    const [, lang, repoFullName, tag] = interaction.customId.split(":");

    try {
        // Ack immediately — Discord allows only 3 seconds, and the release
        // fetch can be slower than that on a cache miss.
        await interaction.deferUpdate();

        const release = await getRelease(repoFullName, tag);
        const pingRole = release.prerelease ? PRERELEASE_ROLE_ID : ROLE_ID;

        await interaction.editReply({
            components: [
                new TextDisplayBuilder().setContent(`<@&${pingRole}>`),
                ...buildReleaseMessage(release, repoFullName, lang),
            ],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { roles: [] },
        });
    } catch (err) {
        console.error("Failed to switch language:", err);
        const apology = {
            content: "Couldn't switch language, please try again later.",
            flags: MessageFlags.Ephemeral,
        };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(apology).catch(() => { });
        } else {
            await interaction.reply(apology).catch(() => { });
        }
    }
}

module.exports = { verifySignature, splitLanguages, buildReleaseMessage, webhookHandler, handleLanguageButton };
