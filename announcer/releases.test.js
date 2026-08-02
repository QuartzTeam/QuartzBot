// node --test
const test = require("node:test");
const assert = require("node:assert");

const {
    splitLanguages, stripDownloadSection, flattenTables,
    releaseTrack, ACCENT, buildReleaseMessage, findPingRole,
} = require("./releases");

// Mirrors the server's role list; Array#find stands in for a discord.js Collection.
const guild = {
    roles: {
        cache: [
            { id: "1501202364302889142", name: "Quartz Update Ping" },
            { id: "1520786654238081094", name: "Quartz Pre-Release Ping" },
            { id: "300", name: "Bismuth Update Ping" },
            { id: "400", name: "Bismuth Pre-Release Ping" },
            { id: "500", name: "Sapphire Update Ping" },
            { id: "600", name: "Sapphire Pre-Release Ping" },
        ],
    },
};

// findPingRole logs when it misses; keep the test output clean.
function quietly(fn) {
    const original = console.error;
    console.error = () => {};
    try {
        return fn();
    } finally {
        console.error = original;
    }
}

function fakeRelease(assets, body = "### Fixed\n- thing", overrides = {}) {
    return {
        name: "v1.0.0",
        tag_name: "v1.0.0",
        body,
        html_url: "https://github.com/example/repo/releases/tag/v1.0.0",
        published_at: new Date().toISOString(),
        prerelease: false,
        assets,
        ...overrides,
    };
}

// The buttons row is the second component; count its buttons.
function buttonCount(release, repo = "example/repo") {
    const [, row] = buildReleaseMessage(release, repo, "en");
    return row.toJSON().components.length;
}

test("splitLanguages splits at the first Hangul line and shares the trailer", () => {
    const { en, ko } = splitLanguages([
        "### Fixed",
        "- an English entry",
        "",
        "## 한국어 (Korean)",
        "",
        "### 수정",
        "- 한국어 항목",
        "",
        "---",
        "build 42",
    ].join("\n"));

    assert.match(en, /an English entry/);
    assert.doesNotMatch(en, /한국어 항목/);
    assert.match(ko, /한국어 항목/);
    assert.doesNotMatch(ko, /an English entry/);
    // The no-Hangul trailer belongs to both views.
    assert.match(en, /build 42/);
    assert.match(ko, /build 42/);
});

test("splitLanguages returns null Korean when the body has no Hangul", () => {
    const { en, ko } = splitLanguages("### Fixed\n- only English here");
    assert.match(en, /only English here/);
    assert.strictEqual(ko, null);
});

test("assets from any repo get a download button, labelled by filename", () => {
    const release = fakeRelease([
        { name: "Bismuth.dll", browser_download_url: "https://example.com/Bismuth.dll" },
    ]);
    const [container, row] = buildReleaseMessage(release, "example/bismuth", "en");

    assert.strictEqual(row.toJSON().components.length, 2); // asset + GitHub link
    assert.match(JSON.stringify(container.toJSON()), /Bismuth\.dll/);
});

test("known Quartz assets keep their friendly loader labels", () => {
    const release = fakeRelease([
        { name: "Quartz.zip", browser_download_url: "https://example.com/Quartz.zip" },
        { name: "QuartzUmm.zip", browser_download_url: "https://example.com/QuartzUmm.zip" },
    ]);
    const [container, row] = buildReleaseMessage(release, "QuartzTeam/Quartz", "en");
    const json = JSON.stringify([container.toJSON(), row.toJSON()]);

    assert.match(json, /MelonLoader/);
    assert.match(json, /UMM/);
    assert.strictEqual(row.toJSON().components.length, 3);
});

// The real PrismMods/Quartz asset list: four internal files, two for humans.
test("internal build artifacts are hidden when labelled assets exist", () => {
    const release = fakeRelease(
        ["modules.json", "Quartz.dll", "Quartz.zip", "QuartzAddon.dll", "QuartzModules.zip", "QuartzUmm.zip"]
            .map(name => ({ name, browser_download_url: `https://example.com/${name}` }))
    );
    const [container, row] = buildReleaseMessage(release, "PrismMods/Quartz", "en");
    const json = JSON.stringify([container.toJSON(), row.toJSON()]);

    assert.strictEqual(row.toJSON().components.length, 3); // 2 zips + GitHub link
    assert.match(json, /Quartz\.zip/);
    assert.match(json, /QuartzUmm\.zip/);
    assert.doesNotMatch(json, /modules\.json/);
    assert.doesNotMatch(json, /Quartz\.dll/);
    assert.doesNotMatch(json, /QuartzAddon\.dll/);
});

test("a release with no assets still builds, with only the GitHub link", () => {
    assert.strictEqual(buttonCount(fakeRelease([])), 1);
    assert.strictEqual(buttonCount(fakeRelease(undefined)), 1);
});

test("the notes' own Download section is dropped, changelog starts at the real content", () => {
    const out = stripDownloadSection([
        "## Download",
        "",
        "| | |",
        "|---|---|",
        "| **[Quartz.zip](https://example.com/Quartz.zip)** | MelonLoader — start here |",
        "",
        "The other files below are for the mod itself.",
        "",
        "---",
        "",
        "### Fixed",
        "- a real change",
    ].join("\n"));

    assert.ok(out.startsWith("### Fixed"), `changelog should open on the content, got: ${out.slice(0, 40)}`);
    assert.doesNotMatch(out, /Download/);
    assert.doesNotMatch(out, /other files below/);
    assert.match(out, /- a real change/);
});

test("a Download section ending at a heading keeps that heading", () => {
    const out = stripDownloadSection("## 다운로드\n\nsome table here\n\n### 수정\n- 항목");
    assert.strictEqual(out, "### 수정\n- 항목");
});

test("notes without a Download section are untouched", () => {
    const md = "### Fixed\n- only this\n\n### New\n- and this";
    assert.strictEqual(stripDownloadSection(md), md);
});

// Verbatim from PrismMods/Quartz v2.0.0-alpha-103 — a headerless two-column
// table, which is how the real release notes lay out downloads.
test("a headerless table becomes bullets, keeping links and losing every pipe", () => {
    const out = flattenTables([
        "## Download",
        "",
        "| | |",
        "|---|---|",
        "| **[Quartz.zip](https://example.com/Quartz.zip)** | MelonLoader — start here |",
        "| **[QuartzUmm.zip](https://example.com/QuartzUmm.zip)** | UnityModManager |",
        "",
        "Every feature is included.",
    ].join("\n"));

    assert.doesNotMatch(out, /\|/, "no pipe should survive");
    assert.doesNotMatch(out, /^-{3,}$/m, "no delimiter dashes should survive");
    assert.match(out, /- \*\*\[Quartz\.zip\]\(https:\/\/example\.com\/Quartz\.zip\)\*\* — MelonLoader — start here/);
    assert.match(out, /- \*\*\[QuartzUmm\.zip\]\(.+?\)\*\* — UnityModManager/);
    // Surrounding prose is untouched.
    assert.match(out, /## Download/);
    assert.match(out, /Every feature is included\./);
});

test("a table with a real header keeps it as a bold lead-in", () => {
    const out = flattenTables("| File | Loader |\n|---|---|\n| a.zip | UMM |");
    assert.strictEqual(out, "**File** — **Loader**\n- a.zip — UMM");
});

test("prose containing a pipe is not mistaken for a table", () => {
    const prose = "Use the a | b syntax.\nNothing here is a table.";
    assert.strictEqual(flattenTables(prose), prose);
});

test("alpha, beta and stable are three separate tracks", () => {
    const pre = tag => releaseTrack({ prerelease: true, tag_name: tag });

    assert.strictEqual(pre("v2.0.0-alpha-103"), "alpha");
    assert.strictEqual(pre("v2.0.0-beta-1"), "beta");
    // The rolling pointer tags the repo also publishes.
    assert.strictEqual(pre("latest-alpha"), "alpha");
    assert.strictEqual(pre("latest-beta"), "beta");
    // A prerelease naming no track is treated as the least finished.
    assert.strictEqual(pre("v0.0.0-test-1"), "alpha");
    assert.strictEqual(releaseTrack({ prerelease: false, tag_name: "v1.3.2" }), "stable");
});

test("the track drives the container's accent colour", () => {
    const accentOf = overrides =>
        buildReleaseMessage(fakeRelease([], undefined, overrides), "PrismMods/Quartz", "en")[0]
            .toJSON().accent_color;

    assert.strictEqual(accentOf({ prerelease: true, tag_name: "v2.0.0-alpha-103" }), ACCENT.alpha);
    assert.strictEqual(accentOf({ prerelease: true, tag_name: "v2.0.0-beta-1" }), ACCENT.beta);
    assert.strictEqual(accentOf({ prerelease: false, tag_name: "v2.0.0" }), ACCENT.stable);
    assert.notStrictEqual(ACCENT.alpha, ACCENT.beta);
});

test("each repo pings its own role, stable and prerelease", () => {
    assert.strictEqual(findPingRole(guild, "Quartz", false), "1501202364302889142");
    assert.strictEqual(findPingRole(guild, "Quartz", true), "1520786654238081094");
    assert.strictEqual(findPingRole(guild, "Bismuth", false), "300");
    assert.strictEqual(findPingRole(guild, "Bismuth", true), "400");
    assert.strictEqual(findPingRole(guild, "Sapphire", false), "500");
});

test("a repo with no matching role announces without a ping, never a wrong one", () => {
    quietly(() => {
        assert.strictEqual(findPingRole(guild, "Quartz-i18n", false), null);
        assert.strictEqual(findPingRole(undefined, "Quartz", false), null);
    });
});

test("more than four assets stay within Discord's five-button row limit", () => {
    const assets = Array.from({ length: 9 }, (_, i) => ({
        name: `file${i}.zip`,
        browser_download_url: `https://example.com/file${i}.zip`,
    }));
    assert.strictEqual(buttonCount(fakeRelease(assets)), 5);
});
