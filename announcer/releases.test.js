// node --test
const test = require("node:test");
const assert = require("node:assert");

const { splitLanguages, buildReleaseMessage } = require("./releases");

function fakeRelease(assets, body = "### Fixed\n- thing") {
    return {
        name: "v1.0.0",
        tag_name: "v1.0.0",
        body,
        html_url: "https://github.com/example/repo/releases/tag/v1.0.0",
        published_at: new Date().toISOString(),
        prerelease: false,
        assets,
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

test("a release with no assets still builds, with only the GitHub link", () => {
    assert.strictEqual(buttonCount(fakeRelease([])), 1);
    assert.strictEqual(buttonCount(fakeRelease(undefined)), 1);
});

test("more than four assets stay within Discord's five-button row limit", () => {
    const assets = Array.from({ length: 9 }, (_, i) => ({
        name: `file${i}.zip`,
        browser_download_url: `https://example.com/file${i}.zip`,
    }));
    assert.strictEqual(buttonCount(fakeRelease(assets)), 5);
});
