// Posts a signed, fake GitHub "release published" event to the local bot so
// you can test the announcement + language button without cutting a release.
//
//   node scripts/fake-release.js                        -> prerelease, default tag
//   node scripts/fake-release.js v1.2.3                 -> custom tag
//   node scripts/fake-release.js v1.2.3 --stable
//   node scripts/fake-release.js --repo=PrismMods/Bismuth
//
// The --repo form is how you check a new mod's ping role and download buttons
// before pointing its real webhook at the bot.
require("dotenv").config();
const crypto = require("crypto");

const secret = process.env.GITHUB_WEBHOOK_SECRET;
if (!secret) {
    console.error("Set GITHUB_WEBHOOK_SECRET in .env first (any value works locally).");
    process.exit(1);
}

const tag = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "v0.0.0-test-1";
const prerelease = !process.argv.includes("--stable");

const repoArg = process.argv.find(a => a.startsWith("--repo="));
const repoFullName = repoArg ? repoArg.slice("--repo=".length) : "PrismMods/Quartz";
const repoName = repoFullName.split("/")[1];

// Quartz ships two loader builds; every other mod ships one zip named after
// itself, which is also what exercises the generic asset path.
const assets = repoName === "Quartz"
    ? [
        { name: "Quartz.zip", browser_download_url: "https://example.com/Quartz.zip" },
        { name: "QuartzUmm.zip", browser_download_url: "https://example.com/QuartzUmm.zip" },
    ]
    : [{ name: `${repoName}.zip`, browser_download_url: `https://example.com/${repoName}.zip` }];

const payload = {
    action: "published",
    release: {
        name: `${tag} — Local webhook test`,
        tag_name: tag,
        // Mirrors the current release format: no English header, Korean
        // section introduced by "## 한국어 (Korean)", shared "---" trailer.
        body: [
            // This whole section should vanish from the announcement — the bot
            // renders downloads itself from the assets.
            "## Download",
            "",
            "| | |",
            "|---|---|",
            `| **[${repoName}.zip](https://example.com/${repoName}.zip)** | UnityModManager |`,
            "",
            "The other files below are for the mod itself.",
            "",
            "---",
            "",
            "### Fixed",
            "- Test entry: this message was posted by scripts/fake-release.js.",
            "",
            // This table should survive as bullets — Discord cannot render
            // tables, so it exercises flattenTables.
            "### Compatibility",
            "",
            "| Loader | Status |",
            "|---|---|",
            "| UnityModManager | supported |",
            "| MelonLoader | untested |",
            "",
            "---",
            "",
            "## 한국어 (Korean)",
            "",
            "### 수정",
            "- 테스트 항목: scripts/fake-release.js가 보낸 메시지입니다.",
            "",
            "---",
            `test build · ${tag}`,
        ].join("\n"),
        html_url: `https://github.com/${repoFullName}/releases/tag/${tag}`,
        published_at: new Date().toISOString(),
        prerelease,
        assets,
    },
    repository: { name: repoName, full_name: repoFullName },
};

const body = JSON.stringify(payload);
const sig = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

fetch("http://localhost:3000/webhook", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "release",
        "X-Hub-Signature-256": sig,
    },
    body,
}).then(res => {
    if (res.status === 200) {
        console.log("200 OK — check the Discord channel for the announcement.");
    } else {
        console.log(`webhook responded ${res.status} — check the bot's logs.`);
    }
}).catch(err => {
    console.error("request failed — is the bot running (npm start)?", err.message);
});
