const crypto = require("crypto");
const {
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
} = require("discord.js");

// Accent colour ramps by how finished a build is: orange for alpha, yellow for
// beta, blurple for stable.
const ACCENT = {
    alpha: 0xffa500,
    beta: 0xfee75c,
    stable: 0x5865f2,
};

// Prereleases are tagged by track — v2.0.0-alpha-103, v2.0.0-beta-1, and the
// rolling latest-alpha / latest-beta pointers — so the tag says which one a
// build is on. A prerelease naming neither track keeps the alpha colour: an
// unfamiliar repo's prerelease is at least as unfinished as an alpha.
function releaseTrack(release) {
    if (!release.prerelease) return "stable";
    return /beta/i.test(release.tag_name || "") ? "beta" : "alpha";
}

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

const DOWNLOAD_HEADING = /^#{1,6}\s*(?:Download|다운로드)\s*:?\s*$/i;
const ANY_HEADING = /^#{1,6}\s/;

// The bot builds its own download block and buttons from the release assets,
// so a "## Download" section in the notes says the same thing twice — and says
// it worse, since its "the other files below" line points at a GitHub asset
// list the Discord message doesn't have. Drop the heading and everything under
// it, stopping at the next heading or "---" divider. A divider that ends the
// section goes too, so the changelog doesn't open on a stray rule.
function stripDownloadSection(md) {
    const lines = md.split("\n");
    const out = [];

    for (let i = 0; i < lines.length; i++) {
        if (!DOWNLOAD_HEADING.test(lines[i])) {
            out.push(lines[i]);
            continue;
        }
        i++;
        while (i < lines.length && !ANY_HEADING.test(lines[i]) && !DIVIDER.test(lines[i])) i++;
        if (i < lines.length && DIVIDER.test(lines[i])) i++;
        i--; // the loop's i++ lands on the boundary line, which is kept
    }

    return out.join("\n").replace(/^\s+/, "");
}

// A GFM delimiter row: "|---|---|", "| :--- | ---: |". Its presence directly
// under a pipe line is what makes that line a table header rather than prose
// that happens to contain a pipe.
const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

function tableCells(line) {
    return line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
}

// Discord renders no markdown tables — a pipe table arrives as literal pipes
// and delimiter dashes. Flatten each table into lines instead: the header
// becomes a bold lead-in (skipped when the table is headerless, which is how
// the Quartz release notes lay out downloads) and every row becomes a bullet
// with its cells joined by an em dash.
function flattenTables(md) {
    const lines = md.split("\n");
    const out = [];

    for (let i = 0; i < lines.length; i++) {
        const startsTable = lines[i].includes("|")
            && i + 1 < lines.length
            && TABLE_DELIM.test(lines[i + 1]);

        if (!startsTable) {
            out.push(lines[i]);
            continue;
        }

        const header = tableCells(lines[i]).filter(Boolean);
        if (header.length) out.push(header.map(h => `**${h}**`).join(" — "));

        i++; // consume the delimiter row
        while (i + 1 < lines.length && lines[i + 1].includes("|")) {
            i++;
            const row = tableCells(lines[i]).filter(Boolean);
            if (row.length) out.push(`- ${row.join(" — ")}`);
        }
    }

    return out.join("\n");
}

// Ping roles are named after the repo: "Quartz Update Ping", "Bismuth
// Pre-Release Ping". Matching on the name means announcing a new mod needs two
// new roles in Discord and no deploy. A missing role announces without a ping
// rather than falling back to another mod's role — a silent announcement beats
// pinging the wrong 27 people.
//
// ponytail: name-matched, so renaming a role in Discord breaks the ping
// silently (the console.error is the only signal). Swap in an explicit
// repo -> role-id map if the names turn out to churn.
function findPingRole(guild, repoName, prerelease) {
    const wanted = `${repoName} ${prerelease ? "Pre-Release" : "Update"} Ping`;
    const role = guild?.roles?.cache?.find(r => r.name === wanted);
    if (!role) console.error(`no role named "${wanted}" — announcing without a ping`);
    return role?.id ?? null;
}

// Components V2 needs the ping as its own text component; omit it entirely
// when there is no role to ping.
function pingComponents(pingRole) {
    return pingRole ? [new TextDisplayBuilder().setContent(`<@&${pingRole}>`)] : [];
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
    const { en, ko } = splitLanguages(release.body);
    if (lang === "ko" && !ko) lang = "en";
    const t = STRINGS[lang];
    const changelog = flattenTables(stripDownloadSection((lang === "ko" ? ko : en) || ko || t.noChangelog));

    // Releases ship internal files next to the ones people actually download —
    // Quartz publishes six assets, of which two are for humans. When any asset
    // carries a label we know, that set is the human-facing one; otherwise list
    // everything, the best guess for a repo we have no labels for.
    const allAssets = release.assets ?? [];
    const labelled = allAssets.filter(a => ASSET_LABELS[a.name]);
    const assets = labelled.length ? labelled : allAssets;

    const title =
        `## ${release.prerelease ? t.prerelease : t.release}\n` +
        `**${release.name || release.tag_name}**`;

    const downloads =
        `${t.download}\n` +
        (assets.length
            ? assets.map(a => `\`${a.name}\`${ASSET_LABELS[a.name] ? ` — ${ASSET_LABELS[a.name]}` : ""}\n`).join("")
            : `${t.noAssets}\n`);

    const container = new ContainerBuilder()
        .setAccentColor(ACCENT[releaseTrack(release)]);

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
        .addTextDisplayComponents(td => td.setContent(`${t.changelog}\n${truncate(changelog, 3500)}`));

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
            const pingRole = findPingRole(channel.guild, repo.name, release.prerelease);

            await channel.send({
                components: [
                    ...pingComponents(pingRole),
                    ...buildReleaseMessage(release, repo.full_name, "en"),
                ],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { roles: pingRole ? [pingRole] : [] },
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
        // Re-render keeps the ping line so the message layout is unchanged;
        // allowedMentions below stops it from pinging anyone a second time.
        const pingRole = findPingRole(interaction.guild, repoFullName.split("/")[1], release.prerelease);

        await interaction.editReply({
            components: [
                ...pingComponents(pingRole),
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

module.exports = { verifySignature, splitLanguages, stripDownloadSection, flattenTables, releaseTrack, ACCENT, buildReleaseMessage, findPingRole, webhookHandler, handleLanguageButton };
