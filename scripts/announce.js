// Replays an already-published release through the announcer's webhook, for
// releases that happened while the webhook was misconfigured. GitHub's
// "Redeliver" button only replays events it actually sent, so a release whose
// deliveries 404'd has to be fetched, re-signed and posted by hand.
//
//   node scripts/announce.js PrismMods/Sapphire v1.0.0-a2
//   node scripts/announce.js PrismMods/Bismuth v1.3.2 --url=https://host/webhook
//
// Defaults to localhost so a stray run cannot hit production; pass --url (or
// set WEBHOOK_URL) to announce for real.
require("dotenv").config();
const crypto = require("crypto");

const args = process.argv.slice(2);
const [repoFullName, tag] = args.filter(a => !a.startsWith("--"));
const urlArg = args.find(a => a.startsWith("--url="));
const url = urlArg
    ? urlArg.slice("--url=".length)
    : process.env.WEBHOOK_URL || "http://localhost:3000/webhook";

if (!repoFullName || !tag || !repoFullName.includes("/")) {
    console.error("usage: node scripts/announce.js <owner/repo> <tag> [--url=https://host/webhook]");
    process.exit(1);
}

const secret = process.env.GITHUB_WEBHOOK_SECRET;
if (!secret) {
    console.error("GITHUB_WEBHOOK_SECRET is not set; it must match the secret the target bot runs with.");
    process.exit(1);
}

async function main() {
    const headers = { "User-Agent": "PrismBot", Accept: "application/vnd.github+json" };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const lookup = await fetch(
        `https://api.github.com/repos/${repoFullName}/releases/tags/${encodeURIComponent(tag)}`,
        { headers }
    );
    if (!lookup.ok) {
        throw new Error(`GitHub API responded ${lookup.status} for ${repoFullName}@${tag}`);
    }
    const release = await lookup.json();

    // Same shape GitHub sends for a release webhook — only the fields the
    // announcer reads matter, and `release` is verbatim from the API.
    const body = JSON.stringify({
        action: "published",
        release,
        repository: { name: repoFullName.split("/")[1], full_name: repoFullName },
    });
    const signature = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

    console.log(`announcing ${repoFullName}@${tag} (${release.prerelease ? "prerelease" : "stable"}, ` +
        `${release.assets?.length ?? 0} assets) -> ${url}`);

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-GitHub-Event": "release",
            "X-Hub-Signature-256": signature,
        },
        body,
    });

    if (res.status === 200) console.log("200 OK — check the Discord channel.");
    else if (res.status === 401) console.log("401 — GITHUB_WEBHOOK_SECRET here does not match the running bot's.");
    else if (res.status === 404) console.log(`404 — wrong path? ${url} should end in /webhook`);
    else console.log(`${res.status} — check the bot's logs.`);
}

main().catch(err => {
    console.error(err.message);
    process.exit(1);
});
