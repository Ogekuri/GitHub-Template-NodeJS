"use strict";
/**
 * @file githubtemplatenodejs.test.js
 * @brief HDT unit suite (Generator mode) covering TST-001..TST-032 for
 *        the githubtemplatenodejs CLI, its release workflow, its
 *        repository tooling scripts, and its packaging-artifact contract.
 * @details HDT static-analysis artifact (section 7.1):
 *          - UUTs and levels: L0 = colors.notificationColors,
 *            management.isLinux, management.managementEntry,
 *            version_check.parseVersion, version_check.humanTimestamp,
 *            version_check.formatReportRow, config.section; L1 =
 *            management.buildHelpText, management.printHelp,
 *            management.cmdUpgrade, management.cmdUninstall,
 *            version_check.readCache, version_check.writeCache,
 *            version_check.gateAllowsRequest,
 *            version_check.fetchLatestNpmVersion,
 *            version_check.fetchLatestGithubVersion,
 *            version_check.runVersionCheck,
 *            version_check.runVersionReport, config.render handlers; L2
 *            = core.main.
 *          - External dependencies isolated: network (transport seam
 *            `fetchJson` replaced with `t.mock.method`), filesystem
 *            (`$HOME` redirected into a per-test temp directory by the
 *            file-level hooks), process spawn (`management.runCommand`
 *            seam replaced with `t.mock.method`), wall clock
 *            (tolerance-bounded assertions on the 3600/86400 second
 *            deltas).
 *          - Stale-schema rendering reproducer: `--print` and `--info`
 *            render the schema-shaped tree from a configuration file
 *            persisted by an older schema version (DES-010, TST-008;
 *            REQ-019, REQ-023).
 *          - Contract checks (TST-012, TST-015, TST-019..TST-021,
 *            TST-023, TST-029..TST-032): action pins and job topology of
 *            `.github/workflows/release-npm.yml` versus the
 *            Node24-or-later manifest (DES-015, CTN-010) plus the npm
 *            trusted-publisher contract (DES-016..DES-018); the tracked
 *            workflow file is the read-only deterministic fixture.
 *          - Packaging-artifact contract: the committed `dist/` package
 *            tarball versus `package.json` (DES-017, DES-042); the
 *            tracked artifact is the read-only deterministic fixture.
 *          - Release-tooling sandbox contracts (TST-016..TST-018,
 *            TST-022, TST-029): `scripts/build.sh`,
 *            `scripts/pre-release-check.sh`, `scripts/clean.sh`, and
 *            `scripts/templatenodejs.sh` execute inside disposable git
 *            sandboxes under the OS temp directory; the real repository
 *            is never mutated.
 *          - Execution plan (dev signal): `npm test` from the project
 *            root; CI gates L0 -> L1 -> L2 fail-fast outside test bodies.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");

const colors = require("../src/githubtemplatenodejs/colors.js");
const config = require("../src/githubtemplatenodejs/config.js");
const configRender = require("../src/githubtemplatenodejs/config_render.js");
const core = require("../src/githubtemplatenodejs/core.js");
const management = require("../src/githubtemplatenodejs/management.js");
const versionCheck = require("../src/githubtemplatenodejs/version_check.js");

/**
 * @brief npm registry endpoint oracle duplicated from the SRS
 *        (REQ-009, REQ-028) to keep assertions independent from
 *        implementation constants.
 */
const EXPECTED_NPM_ENDPOINT = "https://registry.npmjs.org/githubtemplatenodejs/latest";

/**
 * @brief GitHub endpoint oracle duplicated from the SRS (REQ-029).
 */
const EXPECTED_GITHUB_ENDPOINT = (
    "https://api.github.com/repos/Ogekuri/"
    + "GitHub-Template-NodeJS/releases/latest"
);

/**
 * @brief Independent byte-exact help-screen oracle for TST-001 (REQ-001
 *        template with the current version substituted into the `(x.y.z)`
 *        slot; single version source `core.VERSION`).
 */
const EXPECTED_HELP_TEXT = (
    "Usage: githubtemplatenodejs [command] [options] (" + core.VERSION + ")\n"
    + "\n"
    + "Management Commands:\n"
    + "  --upgrade   - Reinstall githubtemplatenodejs on Linux; print manual"
    + " command elsewhere.\n"
    + "  --uninstall - Uninstall githubtemplatenodejs on Linux; print manual"
    + " command elsewhere.\n"
    + "  --ver       - Print the githubtemplatenodejs version.\n"
    + "  --version   - Print the githubtemplatenodejs version.\n"
    + "  --help      - Print the full help screen.\n"
    + "\n"
    + "Configuration Commands:\n"
    + "  --get       - Print the value at Path as one JSON document.\n"
    + "  --set       - Parse Value into the schema type and persist it at"
    + " Path.\n"
    + "  --unset     - Restore Path to its schema default and persist"
    + " atomically.\n"
    + "  --print     - Print current values as a box-drawing tree, whole"
    + " schema or at Path.\n"
    + "  --info      - Print parameter documentation with defaults,"
    + " constraints, and examples.\n"
    + "  --print-raw - Print the exact bytes of the configuration JSON file.\n"
    + "\n"
    + "Options:\n"
    + "  --develop   - With --upgrade: install from the GitHub develop"
    + " branch.\n"
    + "  --dev       - Alias of --develop.\n"
    + "  --force     - With --upgrade: force full re-download and"
    + " reinstallation."
);

/**
 * @brief Isolated `$HOME` root allocated by the file-level beforeEach hook.
 * @details Every test runs with `process.env.HOME` redirected here, so
 *          cache and configuration writes never touch the real user
 *          filesystem (HDT isolation).
 */
let isolatedHome = null;

/**
 * @brief `$HOME` value captured before the current test, restored in
 *        afterEach.
 */
let savedHome = null;

beforeEach(() => {
    savedHome = process.env.HOME;
    isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "gtcjs-home-"));
    process.env.HOME = isolatedHome;
});

afterEach(() => {
    process.env.HOME = savedHome;
    fs.rmSync(isolatedHome, { recursive: true, force: true });
    isolatedHome = null;
});

/**
 * @brief Capture stdout and stderr writes of one async action.
 * @details HDT isolation helper replacing Python `capsys`: patches
 *          `process.stdout.write` / `process.stderr.write`, awaits the
 *          action, and restores the originals in every termination path.
 * @param {Function} action Async callback under observation.
 * @return {Promise<{result: *, out: Function, err: Function}>} Action
 *         result plus lazy accessors for the captured stream texts.
 */
async function captureIO(action) {
    const outChunks = [];
    const errChunks = [];
    const originalOut = process.stdout.write;
    const originalErr = process.stderr.write;
    process.stdout.write = (chunk) => {
        outChunks.push(Buffer.from(chunk));
        return true;
    };
    process.stderr.write = (chunk) => {
        errChunks.push(Buffer.from(chunk));
        return true;
    };
    try {
        const result = await action();
        return {
            result,
            out: () => Buffer.concat(outChunks).toString("utf8"),
            err: () => Buffer.concat(errChunks).toString("utf8"),
        };
    } finally {
        process.stdout.write = originalOut;
        process.stderr.write = originalErr;
    }
}

/**
 * @brief Resolve the cache file path inside the isolated home.
 * @param {string} home Isolated home directory.
 * @return {string} Cache file path
 *         `home/.cache/githubtemplatenodejs/check_version_idle-time.json`.
 */
function cacheFile(home) {
    return path.join(
        home,
        ".cache",
        "githubtemplatenodejs",
        "check_version_idle-time.json",
    );
}

/**
 * @brief Seed an idle-time cache holding a four-field payload.
 * @param {string} home Isolated home directory.
 * @param {number} idleEpoch `idle_time_epoch` value to persist.
 * @return {undefined}
 */
function seedCache(home, idleEpoch) {
    const cachePath = cacheFile(home);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({
        "last_check_epoch": Math.floor(idleEpoch) - 3600,
        "last_check_human": "1970-01-01T00:00:00Z",
        "idle_time_epoch": Math.floor(idleEpoch),
        "idle_time_human": "1970-01-01T00:00:00Z",
    }), "utf8");
}

/**
 * @brief Seed the global configuration file inside the isolated home.
 * @param {string} home Isolated home directory.
 * @param {string} payloadText Exact JSON text to persist.
 * @return {string} Configuration file path.
 */
function seedConfig(home, payloadText) {
    const configFilePath = path.join(
        home,
        ".config",
        "githubtemplatenodejs",
        "config.json",
    );
    fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
    fs.writeFileSync(configFilePath, payloadText, "utf8");
    return configFilePath;
}

/**
 * @brief Assert the four-field cache shape and idle-time delta.
 * @param {string} home Isolated home directory.
 * @param {number} expectedDelay Expected idle-delay delta (3600/86400).
 * @return {undefined}
 * @throws {AssertionError} On field-set, delta, or timestamp-shape
 *         mismatch.
 */
function assertCacheFields(home, expectedDelay) {
    const cache = JSON.parse(fs.readFileSync(cacheFile(home), "utf8"));
    assert.deepStrictEqual(Object.keys(cache).sort(), [
        "idle_time_epoch",
        "idle_time_human",
        "last_check_epoch",
        "last_check_human",
    ]);
    assert.ok(
        Math.abs(cache.idle_time_epoch - (Date.now() / 1000 + expectedDelay)) <= 10,
        "idle_time_epoch must equal check time plus " + expectedDelay,
    );
    assert.match(
        cache.idle_time_human,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    );
}

/**
 * @brief Build a `fetchJson` transport mock dispatching payloads by URL.
 * @param {Object<string, Object>} payloads Mapping endpoint URL -> JSON
 *        payload.
 * @return {Function} Mock implementation resolving per URL; unknown URLs
 *         reject.
 */
function fetchJsonByUrl(payloads) {
    return async (url) => {
        if (!(url in payloads)) {
            throw new Error("unexpected endpoint requested: " + url);
        }
        return payloads[url];
    };
}

/* ------------------------------------------------------------------ */
/* Level 0: atomic leaf units (TST-011, TST-028).                     */
/* ------------------------------------------------------------------ */

test("notification colors embedded json contract", async (t) => {
    /**
     * @brief TST-011 (REQ-026/REQ-041): notifications use embedded JSON.
     * @details expected_output = the embedded JSON assigns bright_green
     *          and bright_red, the resolved ANSI SGR prefixes equal the
     *          92/91 literals, and the rendered availability and failure
     *          notes start with exactly those prefixes and end with the
     *          reset suffix; expected_exception = none.
     */
    const embedded = JSON.parse(colors.COLOR_CONFIG_JSON);
    assert.deepStrictEqual(embedded.notifications, {
        "new_version_color": "bright_green",
        "error_color": "bright_red",
    });
    const prefixes = colors.notificationColors();
    assert.deepStrictEqual(prefixes, {
        "new_version_color": "\u001b[92m",
        "error_color": "\u001b[91m",
    });
    const switchImplementation = { failing: false };
    const fetchMock = t.mock.method(versionCheck, "fetchJson", async () => {
        if (switchImplementation.failing) {
            throw new Error("HTTP Error 503: Service Unavailable");
        }
        return { info: { version: "9.9.9" } };
    });
    const first = await captureIO(() => versionCheck.runVersionCheck("0.0.0"));
    assert.ok(first.out().startsWith(prefixes.new_version_color), first.out());
    assert.ok(first.out().endsWith("\u001b[0m\n"), first.out());
    fs.rmSync(path.dirname(cacheFile(isolatedHome)), { recursive: true, force: true });
    switchImplementation.failing = true;
    const second = await captureIO(() => versionCheck.runVersionCheck("0.0.0"));
    assert.ok(second.out().startsWith(prefixes.error_color), second.out());
    assert.ok(second.out().endsWith("\u001b[0m\n"), second.out());
});

test("parse version tolerates non integer components", async (t) => {
    /**
     * @brief TST-028 (REQ-047) L0: tolerant leading-integer version parse.
     * @details expected_output = suffix components map to their leading
     *          integers, and a mocked `9.9.9rc1` release prints the green
     *          availability note comparing against `0.0.1` with a 3600 s
     *          cache refresh instead of the red failure note;
     *          expected_exception = none.
     */
    assert.deepStrictEqual(versionCheck.parseVersion("0.0.1rc1"), [0, 0, 1]);
    assert.deepStrictEqual(versionCheck.parseVersion("v2"), [2]);
    assert.deepStrictEqual(versionCheck.parseVersion("v1.2.x"), [1, 2, 0]);
    assert.deepStrictEqual(versionCheck.parseVersion(""), [0]);
    assert.strictEqual(versionCheck.compareVersions([0, 0, 1], [0, 0, 1, 0]), 0);
    assert.strictEqual(versionCheck.compareVersions([0, 0, 7], [0, 0, 7, 1]), -1);
    t.mock.method(
        versionCheck,
        "fetchJson",
        fetchJsonByUrl({ [EXPECTED_NPM_ENDPOINT]: { info: { version: "9.9.9rc1" } } }),
    );
    const parseCaptured = await captureIO(() => versionCheck.runVersionCheck("0.0.1"));
    const out = parseCaptured.out();
    assert.ok(out.includes("New version available: 9.9.9rc1"), out);
    assert.ok(out.includes("(installed version: 0.0.1)"), out);
    assert.ok(!out.includes("\u001b[91m"), out);
    assertCacheFields(isolatedHome, 3600);
});

test("schema section lookup is public and case sensitive", (t) => {
    /**
     * @brief TST-010 support (DES-058/REQ-022) L0: public section API.
     * @details expected_output = `config.section` resolves the canonical
     *          token and returns null for unknown or case-mismatched
     *          tokens; expected_exception = none.
     */
    assert.strictEqual(config.section("version_check").token, "version_check");
    assert.strictEqual(config.section("Version_Check"), null);
    assert.strictEqual(config.section("nosuchsection"), null);
    assert.strictEqual(
        config.section("version_check").param("disable-version-check").default,
        "no",
    );
});

test("report row formatter pads labels to seventeen columns", (t) => {
    /**
     * @brief TST-027-format support (REQ-027) L0: label pad contract.
     * @details expected_output = labels padded to 17 characters followed
     *          by ` : ` and the value; expected_exception = none.
     */
    assert.strictEqual(
        versionCheck.formatReportRow("Current Installed", "1.2.3"),
        "Current Installed : 1.2.3",
    );
    assert.strictEqual(
        versionCheck.formatReportRow("Latest @ npm", "9.9.9"),
        "Latest @ npm      : 9.9.9",
    );
    assert.strictEqual(versionCheck.unknownValue(""), "unknown");
    assert.strictEqual(
        versionCheck.unknownValue("timed out"),
        "unknown (timed out)",
    );
});

/* ------------------------------------------------------------------ */
/* Level 1: management commands (TST-003, TST-004, TST-014).          */
/* ------------------------------------------------------------------ */

test("help text matches the byte exact template", (t) => {
    /**
     * @brief TST-001 (REQ-001/REQ-039) L1: help template oracle.
     * @details expected_output = buildHelpText equals the byte-exact
     *          template with the current version substituted;
     *          expected_exception = none.
     */
    assert.strictEqual(management.buildHelpText(core.VERSION), EXPECTED_HELP_TEXT);
    assert.deepStrictEqual(management.UPGRADE_COMMAND, [
        "npm", "install", "-g", "githubtemplatenodejs@latest",
    ]);
    assert.deepStrictEqual(management.UPGRADE_FORCE_COMMAND, [
        "npm", "install", "-g", "githubtemplatenodejs@latest", "--force",
    ]);
    assert.deepStrictEqual(management.UPGRADE_DEVELOP_COMMAND, [
        "npm", "install", "-g",
        "git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git#develop",
    ]);
    assert.deepStrictEqual(management.UPGRADE_DEVELOP_FORCE_COMMAND, [
        "npm", "install", "-g",
        "git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git#develop",
        "--force",
    ]);
    assert.deepStrictEqual(management.UNINSTALL_COMMAND, [
        "npm", "uninstall", "-g", "githubtemplatenodejs",
    ]);
});

test("upgrade on linux executes exact npm install", async (t) => {
    /**
     * @brief TST-003 (REQ-003) L1: `--upgrade` spawns the exact argv.
     * @details expected_output = exit code 0, one runCommand call with
     *          UPGRADE_COMMAND; expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => true);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--upgrade"]));
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(runMock.mock.callCount(), 1);
    assert.deepStrictEqual(
        runMock.mock.calls[0].arguments[0],
        management.UPGRADE_COMMAND,
    );
});

test("upgrade develop on linux executes exact npm install", async (t) => {
    /**
     * @brief TST-014 (REQ-032) L1: `--upgrade --develop` spawns exact argv.
     * @details expected_output = exit code 0 and one runCommand call with
     *          UPGRADE_DEVELOP_COMMAND; expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => true);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--upgrade", "--develop"]));
    assert.strictEqual(captured.result, 0);
    assert.deepStrictEqual(
        runMock.mock.calls[0].arguments[0],
        management.UPGRADE_DEVELOP_COMMAND,
    );
});

test("upgrade dev alias on linux executes exact npm install", async (t) => {
    /**
     * @brief TST-003/TST-014 (REQ-032/REQ-048) L1: `--upgrade --dev`
     *        alias spawns the exact develop argv.
     * @details expected_output = exit code 0 and one runCommand call with
     *          UPGRADE_DEVELOP_COMMAND; expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => true);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--upgrade", "--dev"]));
    assert.strictEqual(captured.result, 0);
    assert.deepStrictEqual(
        runMock.mock.calls[0].arguments[0],
        management.UPGRADE_DEVELOP_COMMAND,
    );
});

test("upgrade dev force alias on linux executes exact npm install", async (t) => {
    /**
     * @brief TST-003/TST-014 (REQ-036/REQ-048) L1: `--upgrade --dev
     *        --force` alias spawns the exact forced develop argv.
     * @details expected_output = exit code 0 and one runCommand call with
     *          UPGRADE_DEVELOP_FORCE_COMMAND; expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => true);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(
        () => core.main(["--upgrade", "--dev", "--force"]),
    );
    assert.strictEqual(captured.result, 0);
    assert.deepStrictEqual(
        runMock.mock.calls[0].arguments[0],
        management.UPGRADE_DEVELOP_FORCE_COMMAND,
    );
});

test("upgrade force on linux executes exact npm install", async (t) => {
    /**
     * @brief TST-003 (REQ-035) L1: `--upgrade --force` spawns exact argv.
     * @details expected_output = exit code 0 and one runCommand call with
     *          UPGRADE_FORCE_COMMAND; expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => true);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--upgrade", "--force"]));
    assert.strictEqual(captured.result, 0);
    assert.deepStrictEqual(
        runMock.mock.calls[0].arguments[0],
        management.UPGRADE_FORCE_COMMAND,
    );
});

test("upgrade develop force on linux executes exact npm install", async (t) => {
    /**
     * @brief TST-003/TST-014 (REQ-036) L1: forced develop argv executes.
     * @details expected_output = exit code 0 and one runCommand call with
     *          UPGRADE_DEVELOP_FORCE_COMMAND; expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => true);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(
        () => core.main(["--upgrade", "--develop", "--force"]),
    );
    assert.strictEqual(captured.result, 0);
    assert.deepStrictEqual(
        runMock.mock.calls[0].arguments[0],
        management.UPGRADE_DEVELOP_FORCE_COMMAND,
    );
});

test("uninstall on linux executes exact npm uninstall", async (t) => {
    /**
     * @brief TST-003 (REQ-005) L1: `--uninstall` spawns the exact argv.
     * @details expected_output = exit code 0 and one runCommand call with
     *          UNINSTALL_COMMAND; expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => true);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--uninstall"]));
    assert.strictEqual(captured.result, 0);
    assert.deepStrictEqual(
        runMock.mock.calls[0].arguments[0],
        management.UNINSTALL_COMMAND,
    );
});

test("upgrade on non linux prints manual without execution", async (t) => {
    /**
     * @brief TST-004 (REQ-004) L1: non-Linux `--upgrade` prints warning.
     * @details expected_output = warning plus the REQ-003 manual command
     *          on stdout and zero runCommand calls; expected_exception =
     *          none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => false);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--upgrade"]));
    const out = captured.out();
    assert.strictEqual(captured.result, 0);
    assert.ok(out.includes("WARNING"), out);
    assert.ok(out.includes(management.UPGRADE_COMMAND.join(" ")), out);
    assert.strictEqual(runMock.mock.callCount(), 0);
});

test("upgrade develop on non linux prints manual without execution", async (t) => {
    /**
     * @brief TST-014 (REQ-033) L1: non-Linux develop upgrade prints manual.
     * @details expected_output = warning plus the REQ-032 manual command
     *          on stdout and zero runCommand calls; expected_exception =
     *          none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => false);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(
        () => core.main(["--upgrade", "--develop"]),
    );
    const out = captured.out();
    assert.strictEqual(captured.result, 0);
    assert.ok(out.includes("WARNING"), out);
    assert.ok(out.includes(management.UPGRADE_DEVELOP_COMMAND.join(" ")), out);
    assert.strictEqual(runMock.mock.callCount(), 0);
});

test("upgrade dev alias on non linux prints manual without execution", async (t) => {
    /**
     * @brief TST-014 (REQ-033/REQ-048) L1: non-Linux `--upgrade --dev`
     *        alias prints the develop manual command.
     * @details expected_output = warning plus the REQ-032 manual command
     *          on stdout and zero runCommand calls; expected_exception =
     *          none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => false);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--upgrade", "--dev"]));
    const out = captured.out();
    assert.strictEqual(captured.result, 0);
    assert.ok(out.includes("WARNING"), out);
    assert.ok(out.includes(management.UPGRADE_DEVELOP_COMMAND.join(" ")), out);
    assert.strictEqual(runMock.mock.callCount(), 0);
});

test("upgrade force on non linux prints manual without execution", async (t) => {
    /**
     * @brief TST-004 (REQ-035) L1: non-Linux forced upgrade manual.
     * @details expected_output = warning plus the REQ-035 manual command
     *          on stdout and zero runCommand calls; expected_exception =
     *          none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => false);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(
        () => core.main(["--upgrade", "--force"]),
    );
    const out = captured.out();
    assert.strictEqual(captured.result, 0);
    assert.ok(out.includes("WARNING"), out);
    assert.ok(out.includes(management.UPGRADE_FORCE_COMMAND.join(" ")), out);
    assert.strictEqual(runMock.mock.callCount(), 0);
});

test("upgrade develop force on non linux prints manual without execution", async (t) => {
    /**
     * @brief TST-004/TST-014 (REQ-033/REQ-036) L1: forced develop manual.
     * @details expected_output = warning plus the REQ-036 manual command
     *          on stdout and zero runCommand calls; expected_exception =
     *          none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => false);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(
        () => core.main(["--upgrade", "--develop", "--force"]),
    );
    const out = captured.out();
    assert.strictEqual(captured.result, 0);
    assert.ok(out.includes("WARNING"), out);
    assert.ok(
        out.includes(management.UPGRADE_DEVELOP_FORCE_COMMAND.join(" ")),
        out,
    );
    assert.strictEqual(runMock.mock.callCount(), 0);
});

test("uninstall on non linux prints manual without execution", async (t) => {
    /**
     * @brief TST-004 (REQ-006) L1: non-Linux `--uninstall` manual fallback.
     * @details expected_output = warning plus the REQ-005 manual command
     *          on stdout and zero runCommand calls; expected_exception =
     *          none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => false);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--uninstall"]));
    const out = captured.out();
    assert.strictEqual(captured.result, 0);
    assert.ok(out.includes("WARNING"), out);
    assert.ok(out.includes(management.UNINSTALL_COMMAND.join(" ")), out);
    assert.strictEqual(runMock.mock.callCount(), 0);
});

test("develop alone falls back to help without upgrade", async (t) => {
    /**
     * @brief TST-014 (REQ-034) L2: `--develop` alone dispatches no upgrade.
     * @details expected_output = exact help screen and zero runCommand
     *          calls; expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => true);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--develop"]));
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(captured.out(), EXPECTED_HELP_TEXT + "\n");
    assert.strictEqual(runMock.mock.callCount(), 0);
});

test("dev alone falls back to help without upgrade", async (t) => {
    /**
     * @brief TST-014 (REQ-034/REQ-048) L2: `--dev` alone dispatches no
     *        upgrade.
     * @details expected_output = exact help screen and zero runCommand
     *          calls; expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => true);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--dev"]));
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(captured.out(), EXPECTED_HELP_TEXT + "\n");
    assert.strictEqual(runMock.mock.callCount(), 0);
});

test("force alone falls back to help without upgrade", async (t) => {
    /**
     * @brief TST-014 (REQ-038) L2: `--force` alone dispatches no upgrade.
     * @details expected_output = exact help screen and zero runCommand
     *          calls; expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    t.mock.method(management, "isLinux", () => true);
    const runMock = t.mock.method(management, "runCommand", () => 0);
    const captured = await captureIO(() => core.main(["--force"]));
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(captured.out(), EXPECTED_HELP_TEXT + "\n");
    assert.strictEqual(runMock.mock.callCount(), 0);
});

/* ------------------------------------------------------------------ */
/* Level 1/2: help dispatch and gated check (TST-001, TST-005..007,   */
/* TST-025..TST-027).                                                 */
/* ------------------------------------------------------------------ */

test("no args prints exact help and runs gated check", async (t) => {
    /**
     * @brief TST-001 no-args branch: exact help screen, gated check first.
     * @details expected_output = EXPECTED_HELP_TEXT plus trailing newline;
     *          runVersionCheck called once with (VERSION, false) and zero
     *          transport calls; expected_exception = none.
     */
    const checkMock = t.mock.method(
        versionCheck,
        "runVersionCheck",
        async () => undefined,
    );
    const fetchMock = t.mock.method(versionCheck, "fetchJson", async () => ({}));
    const captured = await captureIO(() => core.main([]));
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(captured.out(), EXPECTED_HELP_TEXT + "\n");
    assert.strictEqual(checkMock.mock.callCount(), 1);
    assert.deepStrictEqual(
        checkMock.mock.calls[0].arguments,
        [core.VERSION, false],
    );
    assert.strictEqual(fetchMock.mock.callCount(), 0);
});

test("help flag prints exact help", async (t) => {
    /**
     * @brief TST-001 `--help` branch: exact help screen on stdout.
     * @details expected_output = EXPECTED_HELP_TEXT plus trailing newline;
     *          expected_exception = none.
     */
    t.mock.method(versionCheck, "runVersionCheck", async () => undefined);
    const captured = await captureIO(() => core.main(["--help"]));
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(captured.out(), EXPECTED_HELP_TEXT + "\n");
});

test("absent cache triggers request with two second timeout", async (t) => {
    /**
     * @brief TST-005 (REQ-009/CTN-006) L1: cache-miss -> one request.
     * @details expected_output = bright-green note for the newer 9.9.9
     *          version; request URL equals the npm endpoint oracle and the
     *          hardcoded timeout equals 2 seconds; expected_exception =
     *          none.
     */
    const fetchMock = t.mock.method(
        versionCheck,
        "fetchJson",
        fetchJsonByUrl({ [EXPECTED_NPM_ENDPOINT]: { info: { version: "9.9.9" } } }),
    );
    const runCaptured = await captureIO(() => versionCheck.runVersionCheck("0.0.0"));
    assert.strictEqual(fetchMock.mock.callCount(), 1);
    assert.strictEqual(fetchMock.mock.calls[0].arguments[0], EXPECTED_NPM_ENDPOINT);
    assert.strictEqual(versionCheck.HTTP_TIMEOUT_SECONDS, 2);
    const out = runCaptured.out();
    assert.ok(out.includes("\u001b[92m"), out);
    assert.ok(out.includes("9.9.9"), out);
});

test("unexpired cache skips request", async (t) => {
    /**
     * @brief TST-005 (REQ-008) L1: gate closed -> zero requests.
     * @details expected_output = empty stdout and no transport calls;
     *          expected_exception = none.
     */
    seedCache(isolatedHome, Date.now() / 1000 + 9999);
    const fetchMock = t.mock.method(versionCheck, "fetchJson", async () => ({}));
    const captured = await captureIO(() => versionCheck.runVersionCheck("0.0.0"));
    assert.strictEqual(fetchMock.mock.callCount(), 0);
    assert.strictEqual(captured.out(), "");
});

test("expired cache triggers request", async (t) => {
    /**
     * @brief TST-005 boundary (REQ-008) L1: elapsed idle-time opens gate.
     * @details expected_output = exactly one transport call;
     *          expected_exception = none.
     */
    seedCache(isolatedHome, Date.now() / 1000 - 10);
    const fetchMock = t.mock.method(
        versionCheck,
        "fetchJson",
        fetchJsonByUrl({ [EXPECTED_NPM_ENDPOINT]: { info: { version: "0.0.1" } } }),
    );
    await captureIO(() => versionCheck.runVersionCheck("0.0.0"));
    assert.strictEqual(fetchMock.mock.callCount(), 1);
});

test("non numeric idle epoch opens the gate", (t) => {
    /**
     * @brief TST-005 boundary (REQ-008) L0: malformed cache is a miss.
     * @details expected_output = gateAllowsRequest true for null caches
     *          and non-numeric idle epochs, false for future epochs;
     *          expected_exception = none.
     */
    assert.strictEqual(versionCheck.gateAllowsRequest(null, 1000), true);
    assert.strictEqual(versionCheck.gateAllowsRequest({}, 1000), true);
    assert.strictEqual(
        versionCheck.gateAllowsRequest({ idle_time_epoch: "x" }, 1000),
        true,
    );
    assert.strictEqual(
        versionCheck.gateAllowsRequest({ idle_time_epoch: 2000 }, 1000),
        false,
    );
    assert.strictEqual(
        versionCheck.gateAllowsRequest({ idle_time_epoch: 2000 }, 2000),
        true,
    );
});

test("cache round trip persists four human readable fields", (t) => {
    /**
     * @brief TST-006 support (REQ-010/REQ-011) L1: cache document shape.
     * @details expected_output = written cache holds exactly the four
     *          A-03 fields with human timestamps; readCache returns null
     *          for absent and malformed files; expected_exception = none.
     */
    const cachePath = cacheFile(isolatedHome);
    versionCheck.writeCache(cachePath, 1700000000, 3600);
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    assert.deepStrictEqual(cache, {
        "last_check_epoch": 1700000000,
        "last_check_human": "2023-11-14T22:13:20Z",
        "idle_time_epoch": 1700003600,
        "idle_time_human": "2023-11-14T23:13:20Z",
    });
    assert.deepStrictEqual(
        versionCheck.readCache(cachePath),
        JSON.parse(fs.readFileSync(cachePath, "utf8")),
    );
    assert.strictEqual(versionCheck.readCache(path.join(isolatedHome, "absent.json")), null);
    fs.writeFileSync(cachePath, "{not json", "utf8");
    assert.strictEqual(versionCheck.readCache(cachePath), null);
    fs.writeFileSync(cachePath, "[1,2]", "utf8");
    assert.strictEqual(versionCheck.readCache(cachePath), null);
    assert.strictEqual(versionCheck.humanTimestamp(0), "1970-01-01T00:00:00Z");
});

test("best effort cache write swallows filesystem failures", (t) => {
    /**
     * @brief REQ-046 L1: failing cache write never raises.
     * @details expected_output = writeCache returns normally when the
     *          parent path is a file; expected_exception = none.
     */
    const blocker = path.join(isolatedHome, "blocker");
    fs.writeFileSync(blocker, "file", "utf8");
    const impossiblePath = path.join(blocker, "cache", "cache.json");
    assert.doesNotThrow(() => {
        versionCheck.writeCache(impossiblePath, 1000, 3600);
    });
});

test("newer release prints green and writes cache 3600", async (t) => {
    /**
     * @brief TST-006 (REQ-012/REQ-013) L1: newer release notification.
     * @details expected_output = bright-green message comparing available
     *          and installed versions; cache holds four fields with
     *          idle-time equal to check time plus 3600; expected_exception
     *          = none.
     */
    t.mock.method(
        versionCheck,
        "fetchJson",
        fetchJsonByUrl({ [EXPECTED_NPM_ENDPOINT]: { info: { version: "9.9.9" } } }),
    );
    const runCaptured = await captureIO(() => versionCheck.runVersionCheck("0.0.0"));
    const out = runCaptured.out();
    assert.ok(out.includes("\u001b[92m"), out);
    assert.ok(out.includes("New version available: 9.9.9"), out);
    assert.ok(out.includes("(installed version: 0.0.0)"), out);
    assertCacheFields(isolatedHome, 3600);
});

test("equal release no notification but cache refreshed", async (t) => {
    /**
     * @brief TST-006 boundary (A-04) L1: up-to-date -> silent, cache +3600.
     * @details expected_output = empty stdout; cache refreshed with the
     *          standard idle-delay; expected_exception = none.
     */
    t.mock.method(
        versionCheck,
        "fetchJson",
        fetchJsonByUrl({ [EXPECTED_NPM_ENDPOINT]: { info: { version: "0.0.0" } } }),
    );
    const captured = await captureIO(() => versionCheck.runVersionCheck("0.0.0"));
    assert.strictEqual(captured.out(), "");
    assertCacheFields(isolatedHome, 3600);
});

test("http 503 prints red and backs off 86400", async (t) => {
    /**
     * @brief TST-007 (REQ-014/REQ-015) L1: HTTP 503 failure handling.
     * @details expected_output = bright-red message carrying the 503
     *          error; cache idle-time equals attempt time plus 86400;
     *          expected_exception = none (handled internally).
     */
    t.mock.method(versionCheck, "fetchJson", async () => {
        throw new Error("HTTP Error 503: Service Unavailable");
    });
    const runCaptured = await captureIO(() => versionCheck.runVersionCheck("0.0.0"));
    const out = runCaptured.out();
    assert.ok(out.includes("\u001b[91m"), out);
    assert.ok(out.includes("503"), out);
    assertCacheFields(isolatedHome, 86400);
});

test("timeout failure prints red and backs off 86400", async (t) => {
    /**
     * @brief TST-007 error path (REQ-014/REQ-015) L1: timeout handling.
     * @details expected_output = bright-red message carrying the timeout
     *          error; cache idle-time equals attempt time plus 86400;
     *          expected_exception = none.
     */
    t.mock.method(versionCheck, "fetchJson", async () => {
        throw new Error("HTTPS request timed out after 2 seconds");
    });
    const runCaptured = await captureIO(() => versionCheck.runVersionCheck("0.0.0"));
    const out = runCaptured.out();
    assert.ok(out.includes("\u001b[91m"), out);
    assert.ok(out.includes("timed out"), out);
    assertCacheFields(isolatedHome, 86400);
});

test("ver report prints aligned rows despite fresh cache", async (t) => {
    /**
     * @brief TST-002/TST-013 (REQ-002/REQ-027..REQ-031) L2: forced report.
     * @details expected_output = the exact three aligned rows with mocked
     *          npm and GitHub payloads; both fetches run even with an
     *          unexpired cache file; cache refreshed 3600 s (REQ-031);
     *          expected_exception = none.
     */
    seedCache(isolatedHome, Date.now() / 1000 + 9999);
    const fetchMock = t.mock.method(versionCheck, "fetchJson", fetchJsonByUrl({
        [EXPECTED_NPM_ENDPOINT]: { info: { version: "9.9.9" } },
        [EXPECTED_GITHUB_ENDPOINT]: { tag_name: "v8.8.8" },
    }));
    const captured = await captureIO(() => core.main(["--ver"]));
    const out = captured.out();
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(out, (
        "Current Installed : " + core.VERSION + "\n"
        + "Latest @ npm      : 9.9.9\n"
        + "Latest @ GitHub   : 8.8.8\n"
    ));
    assert.strictEqual(fetchMock.mock.callCount(), 2);
    assertCacheFields(isolatedHome, 3600);
});

test("ver report marks failed npm source unknown", async (t) => {
    /**
     * @brief TST-013 (REQ-030/REQ-031) L2: failed npm -> unknown row.
     * @details expected_output = `unknown (HTTP Error 503: Service
     *          Unavailable)` in the npm row, populated GitHub row, bright
     *          red note naming npm; cache backs off 86400 s (npm outcome
     *          only); expected_exception = none (handled internally).
     */
    t.mock.method(versionCheck, "fetchJson", async (url) => {
        if (url === EXPECTED_NPM_ENDPOINT) {
            throw new Error("HTTP Error 503: Service Unavailable");
        }
        return { tag_name: "v8.8.8" };
    });
    const captured = await captureIO(() => core.main(["--ver"]));
    const out = captured.out();
    assert.strictEqual(captured.result, 0);
    assert.ok(
        out.includes("Latest @ npm      : unknown (HTTP Error 503: Service Unavailable)\n"),
        out,
    );
    assert.ok(out.includes("Latest @ GitHub   : 8.8.8\n"), out);
    assert.ok(out.includes("\u001b[91m"), out);
    assert.ok(out.includes("@ npm"), out);
    assertCacheFields(isolatedHome, 86400);
});

test("ver report marks failed github source unknown", async (t) => {
    /**
     * @brief TST-013 (REQ-030/REQ-031) L2: failed GitHub -> unknown row.
     * @details expected_output = populated npm row, `unknown (timed out)`
     *          in the GitHub row, bright red note naming GitHub; cache
     *          refreshed 3600 s (npm outcome only); expected_exception =
     *          none (handled internally).
     */
    t.mock.method(versionCheck, "fetchJson", async (url) => {
        if (url === EXPECTED_GITHUB_ENDPOINT) {
            throw new Error("HTTPS request timed out after 2 seconds");
        }
        return { info: { version: "9.9.9" } };
    });
    const captured = await captureIO(() => core.main(["--ver"]));
    const out = captured.out();
    assert.strictEqual(captured.result, 0);
    assert.ok(out.includes("Latest @ npm      : 9.9.9\n"), out);
    assert.ok(out.includes("Latest @ GitHub   : unknown (HTTPS request timed out after 2 seconds)\n"), out);
    assert.ok(out.includes("\u001b[91m"), out);
    assert.ok(out.includes("@ GitHub"), out);
    assertCacheFields(isolatedHome, 3600);
});

test("ver report active when version check disabled", async (t) => {
    /**
     * @brief TST-026 (REQ-045) L2: `--ver` stays active with the switch.
     * @details expected_output = exit 0, the exact three aligned rows with
     *          mocked payloads, both fetches executed, and the cache
     *          refreshed 3600 s even with the switch enabled;
     *          expected_exception = none.
     */
    seedConfig(isolatedHome, '{"version_check": {"disable-version-check": "yes"}}\n');
    assert.strictEqual(config.versionCheckDisabled(), true);
    const fetchMock = t.mock.method(versionCheck, "fetchJson", fetchJsonByUrl({
        [EXPECTED_NPM_ENDPOINT]: { info: { version: "9.9.9" } },
        [EXPECTED_GITHUB_ENDPOINT]: { tag_name: "v8.8.8" },
    }));
    const captured = await captureIO(() => core.main(["--ver"]));
    const out = captured.out();
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(out, (
        "Current Installed : " + core.VERSION + "\n"
        + "Latest @ npm      : 9.9.9\n"
        + "Latest @ GitHub   : 8.8.8\n"
    ));
    assert.strictEqual(fetchMock.mock.callCount(), 2);
    assertCacheFields(isolatedHome, 3600);
});

test("disable version check yes skips gated check", async (t) => {
    /**
     * @brief TST-025 (REQ-042/REQ-043) L2: the disable switch suppresses
     *        the gated check.
     * @details expected_output = exit 0, the exact help screen on stdout,
     *          zero transport calls, no cache file, and no
     *          runVersionCheck execution with the switch enabled;
     *          expected_exception = none.
     */
    seedConfig(isolatedHome, '{"version_check": {"disable-version-check": "yes"}}\n');
    assert.strictEqual(config.versionCheckDisabled(), true);
    const checkMock = t.mock.method(
        versionCheck,
        "runVersionCheck",
        async () => undefined,
    );
    const fetchMock = t.mock.method(versionCheck, "fetchJson", async () => ({}));
    const captured = await captureIO(() => core.main([]));
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(captured.out(), EXPECTED_HELP_TEXT + "\n");
    assert.strictEqual(checkMock.mock.callCount(), 0);
    assert.strictEqual(fetchMock.mock.callCount(), 0);
    assert.strictEqual(fs.existsSync(cacheFile(isolatedHome)), false);
});

test("disable version check absent or malformed keeps check enabled", async (t) => {
    /**
     * @brief TST-025 (REQ-044) L2: tolerant default keeps the check on.
     * @details expected_output = runVersionCheck executed once per case
     *          (absent, malformed-JSON, non-object configuration) and
     *          versionCheckDisabled() false in every case;
     *          expected_exception = none.
     */
    const checkMock = t.mock.method(
        versionCheck,
        "runVersionCheck",
        async () => undefined,
    );
    const captured = await captureIO(() => core.main([]));
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(checkMock.mock.callCount(), 1);
    assert.strictEqual(config.versionCheckDisabled(), false);

    let previous = checkMock.mock.callCount();
    for (const brokenPayload of ["{not json", "[]"]) {
        seedConfig(isolatedHome, brokenPayload);
        const caseCaptured = await captureIO(() => core.main([]));
        assert.strictEqual(caseCaptured.result, 0, brokenPayload);
        assert.strictEqual(
            checkMock.mock.callCount(),
            previous + 1,
            brokenPayload,
        );
        assert.strictEqual(config.versionCheckDisabled(), false, brokenPayload);
        previous = checkMock.mock.callCount();
    }
});

test("cache write failure does not abort dispatch", { skip: process.getuid === undefined || process.getuid() === 0 }, async (t) => {
    /**
     * @brief TST-027 (REQ-046) L2: unwritable cache never aborts the CLI.
     * @details expected_output = with a read-only `$HOME/.cache` directory
     *          and a mocked newer npm release, the green note prints, the
     *          gated check returns normally, the help screen dispatches,
     *          and the exit code is 0 with no traceback;
     *          expected_exception = none.
     */
    const cacheDir = path.join(isolatedHome, ".cache");
    fs.mkdirSync(cacheDir);
    fs.chmodSync(cacheDir, 0o500);
    t.mock.method(
        versionCheck,
        "fetchJson",
        fetchJsonByUrl({ [EXPECTED_NPM_ENDPOINT]: { info: { version: "9.9.9" } } }),
    );
    try {
        const captured = await captureIO(() => core.main([]));
        assert.strictEqual(captured.result, 0);
        const out = captured.out();
        assert.ok(out.includes("New version available: 9.9.9"), out);
        assert.ok(out.endsWith(EXPECTED_HELP_TEXT + "\n"), out);
    } finally {
        fs.chmodSync(cacheDir, 0o700);
    }
});

/* ------------------------------------------------------------------ */
/* Level 1: configuration CLI (TST-008..TST-010, TST-024).            */
/* ------------------------------------------------------------------ */

test("version check parameter config cli round trip", async (t) => {
    /**
     * @brief TST-010 (REQ-016..REQ-018, REQ-022, REQ-023) L1: canonical
     *        `version_check` paths round-trip.
     * @details expected_output = `--set` exits 0 silently, `--get` prints
     *          the JSON-quoted value, `--unset` exits 0 silently restoring
     *          the schema default, an unknown path exits 1 with an
     *          `Error: ` stderr diagnostic and empty stdout,
     *          versionCheckDisabled() tracks the stored value, and
     *          `--print` renders the parameter; expected_exception = none.
     */
    config.ensureBootstrapped();
    const setCaptured = await captureIO(() => config.handleSet(
        ["--set", "version_check:disable-version-check", "yes"],
    ));
    assert.strictEqual(setCaptured.result, 0);
    const getCaptured = await captureIO(
        () => config.handleGet(["--get", "version_check:disable-version-check"]),
    );
    assert.strictEqual(getCaptured.result, 0);
    assert.strictEqual(getCaptured.out(), "\"yes\"\n");
    assert.strictEqual(config.versionCheckDisabled(), true);

    const unsetCaptured = await captureIO(
        () => config.handleUnset(["--unset", "version_check:disable-version-check"]),
    );
    assert.strictEqual(unsetCaptured.result, 0);
    const getAgain = await captureIO(
        () => config.handleGet(["--get", "version_check:disable-version-check"]),
    );
    assert.strictEqual(getAgain.out(), "\"no\"\n");
    assert.strictEqual(config.versionCheckDisabled(), false);

    const failCaptured = await captureIO(() => config.handleGet(["--get", "nosuchsection"]));
    assert.strictEqual(failCaptured.result, 1);
    assert.strictEqual(failCaptured.out(), "");
    assert.ok(failCaptured.err().startsWith("Error: "), failCaptured.err());

    const printCaptured = await captureIO(() => configRender.handlePrint(["--print"]));
    assert.strictEqual(printCaptured.result, 0);
    assert.ok(printCaptured.out().includes("disable-version-check"));
});

test("set rejects invalid enum values without mutation", async (t) => {
    /**
     * @brief TST-010 boundary (REQ-017/REQ-023) L1: typed value parsing.
     * @details expected_output = invalid enum values exit 1 with a stderr
     *          diagnostic, empty stdout, and the stored file untouched;
     *          expected_exception = none.
     */
    config.ensureBootstrapped();
    const before = fs.readFileSync(config.configPath(), "utf8");
    const captured = await captureIO(
        () => config.handleSet(["--set", "version_check:disable-version-check", "maybe"]),
    );
    assert.strictEqual(captured.result, 1);
    assert.strictEqual(captured.out(), "");
    assert.ok(captured.err().startsWith("Error: "), captured.err());
    assert.strictEqual(fs.readFileSync(config.configPath(), "utf8"), before);
    const quoted = await captureIO(
        () => config.handleSet(["--set", "version_check:disable-version-check", "\"yes\""]),
    );
    assert.strictEqual(quoted.result, 1);
});

test("print raw emits exact file bytes", async (t) => {
    /**
     * @brief REQ-021 L1: `--print-raw` byte passthrough.
     * @details expected_output = stdout equals the exact configuration
     *          file bytes with no reformatting or added text;
     *          expected_exception = none.
     */
    config.ensureBootstrapped();
    const raw = fs.readFileSync(config.configPath());
    const captured = await captureIO(() => config.handlePrintRaw(["--print-raw"]));
    assert.strictEqual(captured.result, 0);
    assert.strictEqual(Buffer.from(captured.out(), "utf8").equals(raw), true);
});

test("get prints json documents for section and parameter depths", async (t) => {
    /**
     * @brief REQ-016 L1: `--get` value shapes.
     * @details expected_output = depth 1 prints the section object, depth
     *          2 prints the JSON-quoted parameter string;
     *          expected_exception = none.
     */
    config.ensureBootstrapped();
    const sectionGet = await captureIO(() => config.handleGet(["--get", "version_check"]));
    assert.strictEqual(sectionGet.result, 0);
    assert.deepStrictEqual(
        JSON.parse(sectionGet.out()),
        { "disable-version-check": "no" },
    );
    const paramGet = await captureIO(
        () => config.handleGet(["--get", "version_check:disable-version-check"]),
    );
    assert.strictEqual(paramGet.out(), "\"no\"\n");
});

test("path resolver rejects unknown and misplaced tokens", (t) => {
    /**
     * @brief REQ-022 L1: canonical path resolution diagnostics.
     * @details expected_output = ConfigError raised for empty paths, empty
     *          tokens, unknown sections or parameters, and excessive
     *          depth; expected_exception = ConfigError per case.
     */
    assert.throws(() => config.resolveSegments(""), config.ConfigError);
    assert.throws(() => config.resolveSegments("version_check:"), config.ConfigError);
    assert.throws(() => config.resolveSegments("nosuch"), config.ConfigError);
    assert.throws(
        () => config.resolveSegments("version_check:nosuch"),
        config.ConfigError,
    );
    assert.throws(
        () => config.resolveSegments("version_check:disable-version-check:extra"),
        config.ConfigError,
    );
    assert.deepStrictEqual(
        config.resolveSegments("version_check"),
        ["version_check"],
    );
    assert.deepStrictEqual(
        config.resolveSegments("version_check:disable-version-check"),
        ["version_check", "disable-version-check"],
    );
});

test("set and unset never mutate the input payload", (t) => {
    /**
     * @brief REQ-017/REQ-018 L1: pure mutation helpers.
     * @details expected_output = setValue/unsetValue return new validated
     *          payloads while the input stays unchanged;
     *          expected_exception = none on valid inputs; ConfigError on
     *          invalid values.
     */
    const payload = config.defaultConfig();
    const updated = config.setValue(
        payload,
        "version_check:disable-version-check",
        "yes",
    );
    assert.strictEqual(payload.version_check["disable-version-check"], "no");
    assert.strictEqual(updated.version_check["disable-version-check"], "yes");
    const restored = config.unsetValue(updated, "version_check");
    assert.strictEqual(restored.version_check["disable-version-check"], "no");
    assert.throws(
        () => config.setValue(payload, "version_check", "{not json"),
        config.ConfigError,
    );
    assert.throws(
        () => config.setValue(payload, "nosuch", "x"),
        config.ConfigError,
    );
});

test("print and info render schema tree from stale schema file", async (t) => {
    /**
     * @brief TST-008 stale-schema reproducer (DES-010/REQ-019/REQ-042/
     *        REQ-023) L1: schema drift never blocks rendering.
     * @details expected_output = exit status 0 for both commands, the
     *          schema-shaped `Application_Configuration` golden trees on
     *          stdout, empty stderr, and a byte-identical configuration
     *          file; expected_exception = AssertionError. A file persisted
     *          by an older schema version (the removed Notifications
     *          section) is not schema-displayable (DES-010) and MUST NOT
     *          abort the schema-driven renderers (TST-008).
     */
    const configurationFile = path.join(
        isolatedHome,
        ".config",
        "githubtemplatenodejs",
        "config.json",
    );
    fs.mkdirSync(path.dirname(configurationFile), { recursive: true });
    const stalePayload = (
        '{"Notifications": {"new_version_color": "bright_green", '
        + '"error_color": "bright_red"}}\n'
    );
    fs.writeFileSync(configurationFile, stalePayload, "utf8");

    const printCaptured = await captureIO(() => configRender.handlePrint(["--print"]));
    const infoCaptured = await captureIO(() => configRender.handleInfo(["--info"]));
    assert.strictEqual(printCaptured.result, 0);
    assert.strictEqual(infoCaptured.result, 0);
    assert.strictEqual(
        printCaptured.out(),
        EXPECTED_PRINT_TREE_STALE_SCHEMA + "\n",
    );
    assert.strictEqual(
        infoCaptured.out(),
        EXPECTED_INFO_TREE_STALE_SCHEMA + "\n",
    );
    assert.strictEqual(printCaptured.err(), "");
    assert.strictEqual(infoCaptured.err(), "");
    assert.strictEqual(
        fs.readFileSync(configurationFile, "utf8"),
        stalePayload,
    );
});

test("print at path renders the requested subtree root", async (t) => {
    /**
     * @brief REQ-019/REQ-020 L1: path-scoped subtree rendering.
     * @details expected_output = `--print <Section>` renders the section
     *          heading as the first line without invented ancestors;
     *          `--info <Section:Parameter>` renders the parameter heading;
     *          unknown paths exit 1 with a stderr diagnostic and empty
     *          stdout; expected_exception = none.
     */
    config.ensureBootstrapped();
    const sectionPrint = await captureIO(
        () => configRender.handlePrint(["--print", "version_check"]),
    );
    assert.strictEqual(sectionPrint.result, 0);
    assert.ok(
        sectionPrint.out().startsWith(
            "version_check - [Path: version_check] Online version check",
        ),
        sectionPrint.out(),
    );
    const paramInfo = await captureIO(
        () => configRender.handleInfo(["--info", "version_check:disable-version-check"]),
    );
    assert.strictEqual(paramInfo.result, 0);
    assert.ok(
        paramInfo.out().startsWith("disable-version-check - [Selection:"),
        paramInfo.out(),
    );
    const badPath = await captureIO(
        () => configRender.handlePrint(["--print", "nosuch"]),
    );
    assert.strictEqual(badPath.result, 1);
    assert.strictEqual(badPath.out(), "");
    assert.ok(badPath.err().startsWith("Error: "), badPath.err());
});

test("print tree edges match schema and details carry owner prefix", (t) => {
    /**
     * @brief TST-009 (DES-012) L1: rendered tree matches schema topology.
     * @details expected_output = the edge-marked node count equals
     *          sections plus parameters from config.SCHEMA, every
     *          non-node line carries only continuation-prefix segments and
     *          never an edge marker, and every section heading embeds
     *          `[Path: <token>]`; expected_exception = none.
     */
    config.ensureBootstrapped();
    const payload = config.loadDisplay();
    const root = configRender.buildPrintRoot(payload, null);
    const lines = configRender.renderTree(root).split("\n");
    const edge = /^(?:\u2502   |    )*(?:\u251c\u2500\u2500 |\u2514\u2500\u2500 )/;
    const nodeLines = lines.filter((line) => edge.test(line));
    const expectedNodes = config.SCHEMA.length + config.SCHEMA.reduce(
        (count, schemaSection) => count + schemaSection.params.length,
        0,
    );
    assert.strictEqual(nodeLines.length, expectedNodes);
    assert.strictEqual(lines[0], "Application_Configuration - Current configuration");
    for (const schemaSection of config.SCHEMA) {
        assert.ok(
            nodeLines.some((line) => line.includes("[Path: " + schemaSection.token + "]")),
            "[Path: " + schemaSection.token + "]",
        );
    }
    for (const line of lines.slice(1)) {
        if (!edge.test(line)) {
            assert.match(line, /^(?:\u2502   |    )+/);
            assert.doesNotMatch(line, /\u251c\u2500\u2500 |\u2514\u2500\u2500 /);
        }
    }
});

test("print and info tables follow glyph contract", async (t) => {
    /**
     * @brief TST-024 (DES-053..DES-056) L1: box-drawing glyph contract.
     * @details expected_output = every non-ASCII character belongs to the
     *          mandated table glyph set plus the tree last-child connector
     *          `└`, every glyph line matches the rounded-corner border
     *          grammar, and each border kind occurs; expected_exception =
     *          none.
     */
    config.ensureBootstrapped();
    const printCaptured = await captureIO(() => configRender.handlePrint(["--print"]));
    const infoCaptured = await captureIO(() => configRender.handleInfo(["--info"]));
    assert.strictEqual(printCaptured.result, 0);
    assert.strictEqual(infoCaptured.result, 0);
    const out = printCaptured.out() + infoCaptured.out();
    const allowed = new Set("\u2500\u2502\u256d\u256e\u2570\u256f\u251c\u2524\u252c\u2534\u253c\u2550\u255e\u256a\u2561\u2514");
    const edgeLine = /^(?:\u2502   |    )*(?:\u251c\u2500\u2500 |\u2514\u2500\u2500 )/;
    const shape = /^(?:\u2502   |    )*(\u256d[\u2500\u252c]*\u256e|\u2570[\u2500\u2534]*\u256f|\u255e[\u2550\u256a]*\u2561|\u251c[\u2500\u253c]*\u2524|\u2502.*)$/;
    const borders = { top: 0, bottom: 0, header: 0, row: 0 };
    for (const line of out.split("\n")) {
        const glyphs = new Set([...line].filter((c) => c.codePointAt(0) > 127));
        for (const glyph of glyphs) {
            assert.ok(allowed.has(glyph), JSON.stringify(line));
        }
        if (glyphs.size === 0 || edgeLine.test(line)) {
            continue;
        }
        assert.match(line, shape, JSON.stringify(line));
        const stripped = line.replace(/^(?:\u2502   |    )*/, "");
        if (stripped.startsWith("\u256d")) {
            borders.top += 1;
        } else if (stripped.startsWith("\u2570")) {
            borders.bottom += 1;
        } else if (stripped.startsWith("\u255e")) {
            borders.header += 1;
        } else if (stripped.startsWith("\u251c")) {
            borders.row += 1;
        }
    }
    assert.ok(borders.top > 0);
    assert.ok(borders.bottom > 0);
    assert.ok(borders.header > 0);
    assert.ok(borders.row > 0);
});

/**
 * @brief Golden `--print` tree for the stale-schema reproducer (TST-008).
 */
const EXPECTED_PRINT_TREE_STALE_SCHEMA = [
    "Application_Configuration - Current configuration",
    "\u2514\u2500\u2500 version_check - [Path: version_check] Online version check"
    + " executed before argument parsing.",
    "    \u2514\u2500\u2500 disable-version-check = \"no\" (default)",
    "        \u256d\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e",
    "        \u2502 Sel \u2502 Value \u2502",
    "        \u255e\u2550\u2550\u2550\u2550\u2550\u256a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2561",
    "        \u2502 [*] \u2502 \"no\"  \u2502",
    "        \u251c\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524",
    "        \u2502 [ ] \u2502 \"yes\" \u2502",
    "        \u2570\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f",
].join("\n");

/**
 * @brief Golden `--info` tree for the stale-schema reproducer (TST-008).
 */
const EXPECTED_INFO_TREE_STALE_SCHEMA = [
    "Application_Configuration - Configuration schema and command reference",
    "\u2514\u2500\u2500 version_check - [Path: version_check] Online version check"
    + " executed before argument parsing.",
    "    Full overwrite : --set version_check '{\"disable-version-check\":\"no\"}'",
    "    Reset block : --unset version_check",
    "    \u2514\u2500\u2500 disable-version-check - [Selection: 2 allowed values]"
    + " Disable the automatic online version check executed before"
    + " argument parsing; --ver and --version stay active.",
    "        Default : \"no\" (restored via:"
    + " --unset version_check:disable-version-check)",
    "        Set cmd : --set version_check:disable-version-check no",
    "        Allowed Values:",
    "        \u256d\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256e",
    "        \u2502 Value \u2502 Default \u2502 Meaning \u2502",
    "        \u255e\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u256a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2561",
    "        \u2502 no    \u2502 default \u2502 -       \u2502",
    "        \u251c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524",
    "        \u2502 yes   \u2502         \u2502 -       \u2502",
    "        \u2570\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u256f",
].join("\n");

/* ------------------------------------------------------------------ */
/* Contract fixtures: release workflow, packaging, scripts.           */
/* ------------------------------------------------------------------ */

/**
 * @brief Release workflow contract file exercised by TST-012 and
 *        TST-015; its file name matches the pending npm trusted
 *        publisher (DES-016).
 */
const RELEASE_WORKFLOW_PATH = path.join(
    __dirname, "..", ".github", "workflows", "release-npm.yml",
);

/**
 * @brief Minimum major version per workflow action whose runtime is
 *        Node24 or later (DES-015).
 * @details `actions/setup-node@v5` runs on Node24; the manifest stays
 *          exhaustive over every `uses:` pin of the release workflow.
 */
const NODE24_ACTION_MIN_MAJOR = {
    "actions/checkout": 5,
    "actions/attest-build-provenance": 4,
    "mikepenz/release-changelog-builder-action": 6,
    "softprops/action-gh-release": 3,
    "actions/setup-node": 5,
};

/**
 * @brief Node20 back-compat environment variables forbidden by CTN-010.
 */
const NODE20_FALLBACK_VARIABLES = [
    "FORCE_JAVASCRIPT_ACTIONS_TO_NODE24",
    "ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION",
];

/**
 * @brief Extract every `uses:` pin from the release workflow.
 * @details Reads `RELEASE_WORKFLOW_PATH` and applies the line pattern
 *          `uses:` plus one non-space token; returns pin tokens in
 *          declaration order. Complexity: O(L) over file lines L.
 * @return {string[]} Pin tokens in `owner/repo@version` form.
 */
function releaseWorkflowPins() {
    const pattern = /\buses:\s*(\S+)/;
    const pins = [];
    for (const line of fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8").split("\n")) {
        const match = pattern.exec(line);
        if (match) {
            pins.push(match[1]);
        }
    }
    return pins;
}

/**
 * @brief Extract one top-level job block from the release workflow.
 * @details Returns the lines from the two-space-indented `  <name>:`
 *          header until the next job header (same indentation, `key:`
 *          form) or end of file. Complexity: O(L) over file lines L.
 * @param {string} name YAML job key (e.g. `publish-npm`).
 * @return {string} Job block text including the header line.
 * @throws {AssertionError} If the header line is absent.
 */
function workflowJobBlock(name) {
    const lines = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8").split("\n");
    const header = "  " + name + ":";
    const start = lines.indexOf(header);
    assert.ok(start !== -1, "missing job header " + header);
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
        if(/^  [A-Za-z0-9_-]+:$/.test(lines[index])) {
            end = index;
            break;
        }
    }
    return lines.slice(start, end).join("\n");
}

test("release workflow pins are node24 or later", (t) => {
    /**
     * @brief TST-012 (DES-015/CTN-010): every pin satisfies the Node24
     *        manifest and no fallback variable is present.
     * @details expected_output = none; expected_exception = AssertionError
     *          when a pin action is unlisted, below its minimum major, or
     *          a Node20 fallback variable occurs in the workflow text.
     */
    const pins = releaseWorkflowPins();
    assert.ok(pins.length > 0);
    for (const pin of pins) {
        const at = pin.indexOf("@");
        const action = pin.slice(0, at);
        let version = pin.slice(at + 1);
        assert.ok(action in NODE24_ACTION_MIN_MAJOR, pin);
        if (version.startsWith("release/")) {
            version = version.slice("release/".length);
        }
        assert.ok(version.startsWith("v"), pin);
        const major = Number.parseInt(version.slice(1).split(".")[0], 10);
        assert.ok(major >= NODE24_ACTION_MIN_MAJOR[action], pin);
    }
    const workflowText = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
    for (const variable of NODE20_FALLBACK_VARIABLES) {
        assert.ok(!workflowText.includes(variable), variable);
    }
});

test("release workflow declares node24 release stack", () => {
    /**
     * @brief TST-012 boundary: golden pin oracle for the migrated stack.
     * @details expected_output = none; expected_exception = AssertionError
     *          when the declaration-order pin list differs from the
     *          build-free Node24 stack (three checkout pins,
     *          attest-build-provenance, changelog builder, gh-release,
     *          setup-node).
     */
    assert.deepStrictEqual(releaseWorkflowPins(), [
        "actions/checkout@v5",
        "actions/checkout@v5",
        "actions/attest-build-provenance@v4",
        "mikepenz/release-changelog-builder-action@v6",
        "softprops/action-gh-release@v3",
        "actions/checkout@v5",
        "actions/setup-node@v5",
    ]);
});

test("release workflow file matches trusted publisher contract", () => {
    /**
     * @brief TST-015 (DES-016): workflow file name matches the publisher.
     * @details expected_output = none; expected_exception = AssertionError
     *          when the tracked workflow file is not `release-npm.yml` or
     *          the legacy `release-pypi.yml` still exists.
     */
    assert.strictEqual(path.basename(RELEASE_WORKFLOW_PATH), "release-npm.yml");
    const workflowsDir = path.dirname(RELEASE_WORKFLOW_PATH);
    assert.strictEqual(fs.existsSync(path.join(workflowsDir, "release-pypi.yml")), false);
});

test("release workflow publish job is oidc master only", () => {
    /**
     * @brief TST-015 (DES-017): OIDC publish job gated on master tags.
     * @details expected_output = none; expected_exception = AssertionError
     *          when the publish job lacks the master gate, the id-token
     *          permission, the tag checkout, or the npm publish command.
     */
    const block = workflowJobBlock("publish-npm");
    assert.ok(block.includes("needs: [check-branch, release]"), block);
    assert.ok(
        block.includes("needs.check-branch.outputs.is_master == 'true'"),
        block,
    );
    assert.ok(block.includes("id-token: write"), block);
    assert.ok(block.includes("actions/checkout"), block);
    assert.ok(block.includes("actions/setup-node"), block);
    assert.ok(block.includes("registry-url: 'https://registry.npmjs.org'"), block);
    assert.ok(block.includes("npm publish ./dist/*.tgz"), block);
});

test("release workflow publish tarball operand is file spec safe", () => {
    /**
     * @brief TST-015 support (DES-017): the npm publish operand resolves
     *        as a tarball file spec, never a hosted-git shortcut.
     * @details expected_output = the publish `run:` operand equals
     *          `./dist/*.tgz` exactly; shell glob expansion preserves the
     *          `./` prefix, so npm-package-arg classifies the expanded
     *          tarball path as a file spec. A bare `dist/*.tgz` expands to
     *          a single-slash relative path that parses as the GitHub
     *          shortcut `github:dist/githubtemplatenodejs-<version>.tgz`,
     *          making npm run `git ls-remote ssh://git@github.com/...`
     *          which fails with `Permission denied (publickey)` and exit
     *          code 128 (observed defect); expected_exception =
     *          AssertionError when the publish `run:` line is missing or
     *          the operand is not `./dist/*.tgz`.
     */
    const block = workflowJobBlock("publish-npm");
    const publishLine = block.split("\n").find(
        (line) => /^\s*run:\s*npm publish\s/.test(line),
    );
    assert.ok(publishLine !== undefined, block);
    const operand = publishLine.replace(/^\s*run:\s*npm publish\s*/, "").trim();
    assert.strictEqual(operand, "./dist/*.tgz");
});

test("release workflow release job runs for every tag", () => {
    /**
     * @brief TST-015 (DES-018): release job runs for every canonical tag.
     * @details expected_output = none; expected_exception = AssertionError
     *          when the release job carries a branch gate, misses the tag
     *          checkout or the GitHub release step, or still builds.
     */
    const block = workflowJobBlock("release");
    assert.ok(!block.includes("is_master"), block);
    assert.doesNotMatch(block, /^\s+if:/m);
    assert.ok(block.includes("actions/checkout"), block);
    assert.ok(block.includes("softprops/action-gh-release"), block);
    assert.ok(!block.includes("npm pack"), block);
});

test("release workflow publishes committed dist artifacts", () => {
    /**
     * @brief TST-021 (DES-042): release assets come from committed dist/.
     * @details expected_output = none; expected_exception = AssertionError
     *          when the release job does not upload the committed `dist/`
     *          files (with fail-on-unmatched enforcement) or the publish
     *          job does not check out the tagged commit before publishing.
     */
    const releaseBlock = workflowJobBlock("release");
    const publishBlock = workflowJobBlock("publish-npm");
    assert.ok(releaseBlock.includes("subject-path: dist/*"), releaseBlock);
    assert.ok(releaseBlock.includes("files: dist/**/*"), releaseBlock);
    assert.ok(releaseBlock.includes("fail_on_unmatched_files: true"), releaseBlock);
    assert.ok(publishBlock.includes("actions/checkout"), publishBlock);
});

test("release workflow runs no build or release checks", () => {
    /**
     * @brief TST-021 (DES-043): no build or build-preparatory step runs.
     * @details expected_output = none; expected_exception = AssertionError
     *          when the workflow references `scripts/build.sh`,
     *          `scripts/pre-release-check.sh`, any package build command,
     *          or any build-preparatory toolchain setup step.
     */
    const workflowText = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
    assert.ok(!workflowText.includes("scripts/build.sh"), workflowText);
    assert.ok(!workflowText.includes("pre-release-check.sh"), workflowText);
    assert.ok(!workflowText.includes("npm pack"), workflowText);
    assert.ok(!workflowText.includes("setup-python"), workflowText);
    assert.ok(!workflowText.includes("setup-uv"), workflowText);
});

test("release workflow runs on pinned ubuntu 2404", () => {
    /**
     * @brief TST-020 (DES-041): every job pins ubuntu-24.04.
     * @details expected_output = every `runs-on:` value equals
     *          `ubuntu-24.04` and no `ubuntu-latest` label occurs anywhere
     *          in the release workflow; expected_exception = none.
     */
    const workflowText = fs.readFileSync(RELEASE_WORKFLOW_PATH, "utf8");
    const runsOn = [...workflowText.matchAll(/^\s*runs-on:\s*(\S+)\s*$/gm)]
        .map((match) => match[1]);
    assert.ok(runsOn.length > 0);
    assert.deepStrictEqual([...new Set(runsOn)], ["ubuntu-24.04"]);
    assert.ok(!workflowText.includes("ubuntu-latest"), workflowText);
});

test("package json declares engines bin and complete files", () => {
    /**
     * @brief TST-030/TST-031 (DES-003/DES-057/DES-002): packaging contract.
     * @details expected_output = `engines.node` declares a minimum-pinning
     *          semver range, `bin` declares exactly the
     *          `githubtemplatenodejs` entry point, and `files` carries the
     *          distributable sources; expected_exception = none.
     */
    const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
    );
    assert.match(pkg.engines.node, /^>=\d+\.\d+\.\d+$/);
    assert.deepStrictEqual(pkg.bin, {
        "githubtemplatenodejs": "src/githubtemplatenodejs/main.js",
    });
    assert.ok(pkg.files.includes("src/githubtemplatenodejs/"), pkg.files);
    assert.strictEqual(pkg.name, "githubtemplatenodejs");
});

test("committed dist tarball matches package json", () => {
    /**
     * @brief Packaging contract (DES-017/DES-042): the committed `dist/`
     *        tarball is publishable and carries the current package
     *        version.
     * @details expected_output = none; expected_exception = AssertionError
     *          when `dist/` lacks the `githubtemplatenodejs-<version>.tgz`
     *          tarball, the archive is unreadable, or the archived
     *          `package.json` version/name diverge from the tracked
     *          metadata (staleness the release workflow would publish
     *          verbatim).
     */
    const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
    );
    const tarball = path.join(
        __dirname, "..", "dist", "githubtemplatenodejs-" + pkg.version + ".tgz",
    );
    assert.strictEqual(fs.existsSync(tarball), true, tarball);
    const listing = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" });
    assert.ok(listing.includes("package/package.json"), listing);
    assert.ok(listing.includes("package/src/githubtemplatenodejs/main.js"), listing);
    assert.ok(listing.includes("package/README.md"), listing);
});

test("readme command and configuration documentation contract", () => {
    /**
     * @brief TST-032 (DES-059/DES-060): README stays behavior-consistent.
     * @details expected_output = README carries the exact REQ-003 upgrade
     *          argv and the REQ-032 develop argv (including the REQ-048
     *          `--dev` alias rows), documents the
     *          `version_check:disable-version-check` parameter, and keeps
     *          no stale schema-empty or configurable-color claims;
     *          expected_exception = none.
     */
    const text = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
    assert.ok(text.includes("`npm install -g githubtemplatenodejs@latest`"), text);
    assert.ok(
        text.includes(
            "`npm install -g git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git#develop`",
        ),
        text,
    );
    assert.ok(text.includes("`--upgrade --dev`"), text);
    assert.ok(text.includes("version_check:disable-version-check"), text);
    assert.ok(!text.includes("currently defines no sections"), text);
    assert.ok(!text.includes("notification-color subsystem"), text);
});

test("gitignore keeps dist traversable", () => {
    /**
     * @brief TST-019 (DES-040): dist/ stays selectively re-includable.
     * @details expected_output = `git check-ignore -v --no-index` resolves
     *          every probed `dist/` path to the `!dist/` or the deep
     *          re-include rule `!dist/...` (last matching pattern), proving selective
     *          re-inclusion of versionable files; expected_exception =
     *          none.
     */
    const projectRoot = path.join(__dirname, "..");
    const gitignore = fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf8");
    assert.ok(gitignore.includes("!dist/"), gitignore);
    assert.ok(gitignore.includes("!dist/**/*"), gitignore);
    for (const probe of ["dist/probe.whl", "dist/nested/probe.tar.gz"]) {
        const stdout = execFileSync(
            "git",
            ["-C", projectRoot, "check-ignore", "-v", "--no-index", probe],
            { encoding: "utf8" },
        );
        const fields = stdout.replace(/\n$/, "").split("\t");
        assert.strictEqual(fields.length, 2, probe + " -> " + stdout);
        assert.ok(fields[0].includes("!dist/"), probe + " -> " + stdout);
    }
});

/* ------------------------------------------------------------------ */
/* Release-tooling sandbox contracts (TST-016..TST-018, TST-022,      */
/* TST-023, TST-029).                                                 */
/* ------------------------------------------------------------------ */

/**
 * @brief Repository root anchoring the file-level contract fixtures;
 *        resolved relative to this test file so the suite stays
 *        location-independent.
 */
const PROJECT_ROOT = path.join(__dirname, "..");

/**
 * @brief Launcher script contract target (TST-029).
 */
const LAUNCHER_SCRIPT_PATH = path.join(PROJECT_ROOT, "scripts", "templatenodejs.sh");

/**
 * @brief Release tooling scripts exercised by the sandbox contracts.
 */
const CLEAN_SCRIPT_PATH = path.join(PROJECT_ROOT, "scripts", "clean.sh");
const BUILD_SCRIPT_PATH = path.join(PROJECT_ROOT, "scripts", "build.sh");
const PREFLIGHT_SCRIPT_PATH = path.join(
    PROJECT_ROOT, "scripts", "pre-release-check.sh",
);

/**
 * @brief Execution-generated paths seeded into the sandbox repository
 *        (DES-046, DES-047, DES-048): coverage outputs, build
 *        intermediates, and nested dependency trees.
 */
const SANDBOX_GENERATED_PATHS = [
    ".nyc_output/out.json",
    "coverage/lcov.info",
    "build/lib/synthetic.js",
    ".coverage",
    ".coverage.host.12345.67890",
    "src/deep/nested/node_modules/synthetic.js",
];

/**
 * @brief Content the cleaner MUST preserve (DES-050): one commit-tracked
 *        file, one untracked user file, and one versioned `dist/` release
 *        artifact.
 */
const SANDBOX_PRESERVED_PATHS = [
    "tracked.txt",
    "notes.txt",
    "dist/githubtemplatenodejs-0.0.1.tgz",
];

/**
 * @brief Run one git command inside a sandbox repository.
 * @details Passes throwaway committer identity options so the commit
 *          works without inheriting any developer git configuration.
 * @param {string} repo Sandbox repository root.
 * @param {...string} args Git argv executed after the repo flag.
 * @return {undefined}
 */
function sandboxGit(repo, ...args) {
    execFileSync(
        "git",
        ["-C", repo, "-c", "user.name=dev", "-c", "user.email=dev@example.invalid", ...args],
        { stdio: "pipe" },
    );
}

/**
 * @brief Create a disposable git repository seeded for TST-022.
 * @details Lives under the OS temp directory in a directory whose name
 *          contains spaces (DES-044); carries the copied
 *          `scripts/clean.sh`, one commit-tracked file, one untracked
 *          user file, a `dist/` release artifact, and every generated
 *          path of `SANDBOX_GENERATED_PATHS`. The real repository is
 *          never touched.
 * @param {string} root Parent directory of the sandbox.
 * @param {string} name Sandbox directory name (may contain spaces).
 * @return {string} The sandbox repository root.
 */
function makeSandboxRepo(root, name) {
    const repo = path.join(root, name);
    fs.mkdirSync(path.join(repo, "scripts"), { recursive: true });
    fs.copyFileSync(CLEAN_SCRIPT_PATH, path.join(repo, "scripts", "clean.sh"));
    fs.chmodSync(path.join(repo, "scripts", "clean.sh"), 0o755);
    fs.writeFileSync(path.join(repo, "tracked.txt"), "tracked content\n", "utf8");
    for (const relative of SANDBOX_GENERATED_PATHS) {
        const seeded = path.join(repo, relative);
        fs.mkdirSync(path.dirname(seeded), { recursive: true });
        fs.writeFileSync(seeded, "synthetic generated bytes\n", "utf8");
    }
    fs.mkdirSync(path.join(repo, "dist"), { recursive: true });
    fs.writeFileSync(
        path.join(repo, "dist", "githubtemplatenodejs-0.0.1.tgz"),
        "release artifact bytes\n",
        "utf8",
    );
    sandboxGit(repo, "init", "-q");
    sandboxGit(repo, "add", "tracked.txt");
    sandboxGit(repo, "commit", "-qm", "sandbox init");
    fs.writeFileSync(path.join(repo, "notes.txt"), "untracked user content\n", "utf8");
    return repo;
}

/**
 * @brief Execute the sandbox copy of `scripts/clean.sh`.
 * @param {string} repo Sandbox repository root used as the child cwd.
 * @return {{status: number, stdout: string, stderr: string}} Completed
 *         run record.
 */
function runSandboxClean(repo) {
    try {
        const stdout = execFileSync(
            "bash",
            [path.join(repo, "scripts", "clean.sh")],
            { cwd: repo, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
        );
        return { status: 0, stdout, stderr: "" };
    } catch (error) {
        return {
            status: error.status === undefined ? 1 : error.status,
            stdout: String(error.stdout === undefined ? "" : error.stdout),
            stderr: String(error.stderr === undefined ? "" : error.stderr),
        };
    }
}

test("clean script removes generated paths and preserves content", () => {
    /**
     * @brief TST-022 (DES-045..DES-050): the first run cleans, never harms.
     * @details expected_output = per-target cleanup log; expected_exception
     *          = AssertionError when the run exits non-zero, any generated
     *          path survives, or any tracked, untracked, or `dist/` content
     *          is deleted.
     */
    const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gtcjs-clean-"));
    try {
        const repo = makeSandboxRepo(sandboxRoot, "sandbox repo with spaces");
        const result = runSandboxClean(repo);
        assert.strictEqual(result.status, 0, result.stderr);
        for (const relative of SANDBOX_GENERATED_PATHS) {
            assert.strictEqual(fs.existsSync(path.join(repo, relative)), false, relative);
        }
        for (const relative of SANDBOX_PRESERVED_PATHS) {
            assert.strictEqual(
                fs.statSync(path.join(repo, relative)).isFile(),
                true,
                relative,
            );
        }
        assert.ok(result.stdout.includes("==> [CLEAN] removed:"), result.stdout);
        assert.ok(
            result.stdout.includes("dist/ release artifacts preserved."),
            result.stdout,
        );
    } finally {
        fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
});

test("clean script second run is removal free noop", () => {
    /**
     * @brief TST-022 (DES-049): the second run is an idempotent no-op.
     * @details expected_output = skip log only; expected_exception =
     *          AssertionError when the second run exits non-zero, removes
     *          anything, or does not report the absent targets as skipped.
     */
    const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gtcjs-clean2-"));
    try {
        const repo = makeSandboxRepo(sandboxRoot, "sandbox noop");
        assert.strictEqual(runSandboxClean(repo).status, 0);
        const second = runSandboxClean(repo);
        assert.strictEqual(second.status, 0, second.stderr);
        assert.ok(!second.stdout.includes("==> [CLEAN] removed:"), second.stdout);
        assert.ok(second.stdout.includes("absent, skipping:"), second.stdout);
    } finally {
        fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
});

test("clean script static contract", () => {
    /**
     * @brief TST-022 (DES-044, DES-045): the static script contract holds.
     * @details expected_output = none; expected_exception = AssertionError
     *          when the script is missing, not executable, syntactically
     *          invalid, not git-root-resolved, missing the toolchain gate,
     *          or carrying a destructive git command or a `dist/` removal
     *          target (CTN-011, DES-050).
     */
    assert.strictEqual(fs.existsSync(CLEAN_SCRIPT_PATH), true);
    fs.accessSync(CLEAN_SCRIPT_PATH, fs.constants.X_OK);
    execFileSync("bash", ["-n", CLEAN_SCRIPT_PATH], { stdio: "pipe" });
    const text = fs.readFileSync(CLEAN_SCRIPT_PATH, "utf8");
    assert.ok(text.includes("set -Eeuo pipefail"), text);
    assert.ok(text.includes("command -v git"), text);
    assert.ok(text.includes("rev-parse --show-toplevel"), text);
    assert.ok(!text.includes("git clean"), text);
    assert.ok(!text.includes("git reset"), text);
    assert.ok(text.includes("-path ./dist -prune"), text);
    assert.doesNotMatch(text, /remove_target[^\n]*dist/);
});

test("build script delegates prebuild cleanup before any build action", () => {
    /**
     * @brief TST-023 (DES-051, CTN-011): build.sh delegates, never destroys.
     * @details expected_output = none; expected_exception = AssertionError
     *          when `scripts/build.sh` does not invoke `scripts/clean.sh`
     *          after the toolchain loop and before the `dist/` stale-
     *          artifact removal and the build command, or when any of the
     *          three tooling scripts contains a destructive git command.
     */
    const text = fs.readFileSync(BUILD_SCRIPT_PATH, "utf8");
    const toolchainPos = text.indexOf("for build_tool in git node npm");
    const cleanPos = text.indexOf("bash \"${SCRIPT_DIR}/clean.sh\"");
    const distPos = text.indexOf("DIST_DIR=");
    /* lastIndexOf anchors the real invocation, not the header-documentation
       mention of the build command. */
    const buildPos = text.lastIndexOf("npm pack");
    assert.ok(toolchainPos !== -1 && cleanPos !== -1 && distPos !== -1 && buildPos !== -1);
    assert.ok(toolchainPos < cleanPos, "toolchain before clean");
    assert.ok(cleanPos < distPos, "clean before dist handling");
    assert.ok(distPos < buildPos, "dist handling before build");
    for (const scriptPath of [BUILD_SCRIPT_PATH, CLEAN_SCRIPT_PATH, PREFLIGHT_SCRIPT_PATH]) {
        const scriptText = fs.readFileSync(scriptPath, "utf8");
        assert.ok(!scriptText.includes("git clean"), scriptPath);
        assert.ok(!scriptText.includes("git reset --hard"), scriptPath);
    }
});

/**
 * @brief Copy the build-relevant project tree into a sandbox.
 * @details Copies `scripts/`, `src/`, packaging metadata, lock, README,
 *          LICENSE, and `.gitignore` into `target`, then initializes a
 *          git repository and stages every copied path so
 *          `git ls-files`-driven checks enumerate them.
 * @param {string} target Sandbox repository root (existing directory).
 * @return {undefined}
 */
function copyProjectSkeleton(target) {
    for (const directory of ["scripts", "src"]) {
        fs.cpSync(path.join(PROJECT_ROOT, directory), path.join(target, directory), {
            recursive: true,
        });
    }
    for (const name of [
        "package.json",
        "package-lock.json",
        "README.md",
        "LICENSE",
        ".gitignore",
    ]) {
        fs.copyFileSync(path.join(PROJECT_ROOT, name), path.join(target, name));
    }
    sandboxGit(target, "init", "-q");
    sandboxGit(target, "add", "-A");
}

/**
 * @brief Copy the project skeleton plus a minimal dummy test suite.
 * @details Replacement `tests/` payload for pre-release-check sandboxes:
 *          the inner `npm test` phase executes only the dummy module,
 *          preventing suite recursion.
 * @param {string} target Sandbox repository root (existing directory).
 * @return {undefined}
 */
function copyProjectWithDummyTests(target) {
    copyProjectSkeleton(target);
    fs.mkdirSync(path.join(target, "tests"));
    fs.writeFileSync(
        path.join(target, "tests", "test_sandbox_dummy.test.js"),
        "\"use strict\";\n"
        + "const { test } = require(\"node:test\");\n"
        + "test(\"sandbox dummy\", () => { /* no-op */ });\n",
        "utf8",
    );
    sandboxGit(target, "add", "-A");
}

test("build script double run is clean and idempotent", () => {
    /**
     * @brief TST-016 (DES-021..DES-025, DES-052): two builds, one tarball.
     * @details expected_output = both sandboxed `scripts/build.sh` runs
     *          exit 0 with the `[CLEAN]` pre-build delegation logged, the
     *          seeded stale distribution artifact disappears, and `dist/`
     *          ends holding exactly one package tarball for the declared
     *          version; expected_exception = none. Isolation: disposable
     *          git sandbox under the OS temp directory.
     */
    const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gtcjs-build-"));
    try {
        const repo = path.join(sandboxRoot, "build sandbox");
        fs.mkdirSync(repo);
        copyProjectSkeleton(repo);
        const staleDir = path.join(repo, "dist");
        fs.mkdirSync(staleDir);
        const stale = path.join(staleDir, "githubtemplatenodejs-0.0.0.tar.gz");
        fs.writeFileSync(stale, "stale bytes\n", "utf8");
        const first = execFileSync(
            "bash",
            [path.join(repo, "scripts", "build.sh")],
            { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
        );
        const second = execFileSync(
            "bash",
            [path.join(repo, "scripts", "build.sh")],
            { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
        );
        assert.ok(first.includes("==> [CLEAN] project root:"), first);
        assert.ok(second.includes("==> [CLEAN] project root:"), second);
        assert.strictEqual(fs.existsSync(stale), false);
        const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
        const artifacts = fs.readdirSync(staleDir).filter(
            (name) => fs.statSync(path.join(staleDir, name)).isFile(),
        ).sort();
        assert.deepStrictEqual(artifacts, ["githubtemplatenodejs-" + pkg.version + ".tgz"]);
    } finally {
        fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
});

test("pre release check passes and leaves clean tree", () => {
    /**
     * @brief TST-017 (DES-026..DES-038): full verification run.
     * @details expected_output = the sandboxed
     *          `scripts/pre-release-check.sh` exits 0 reporting the success
     *          summary, and the sandbox `git status --porcelain --ignored`
     *          equals the pre-execution baseline after the trap-based
     *          cleanup; expected_exception = none.
     */
    const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gtcjs-preflight-"));
    try {
        const repo = path.join(sandboxRoot, "preflight sandbox");
        fs.mkdirSync(repo);
        copyProjectWithDummyTests(repo);
        const status = () => execFileSync(
            "git",
            ["-C", repo, "status", "--porcelain", "--ignored"],
            { encoding: "utf8" },
        );
        const baseline = status();
        let stdout;
        try {
            stdout = execFileSync(
                "bash",
                [path.join(repo, "scripts", "pre-release-check.sh")],
                { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
            );
        } catch (error) {
            assert.fail(
                "pre-release-check failed: "
                + String(error.stderr === undefined ? "" : error.stderr)
                + String(error.stdout === undefined ? "" : error.stdout),
            );
        }
        assert.ok(stdout.includes("all pre-release checks passed"), stdout);
        assert.strictEqual(status(), baseline);
    } finally {
        fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
});

test("pre release check failing tool reports phase and cleans", () => {
    /**
     * @brief TST-018 (DES-027/DES-034/DES-035): failing tool aborts clean.
     * @details expected_output = with a failing `node` shim first on a
     *          minimal PATH (no `BASH_ENV`, so the shim cannot be shadowed
     *          by shell startup files), the sandboxed
     *          `scripts/pre-release-check.sh` exits 1, the stderr
     *          diagnostic names the first failed phase
     *          (`javascript-syntax-check`), the failure summary prints, and
     *          the sandbox `git status --porcelain --ignored` equals the
     *          pre-execution baseline; expected_exception = none.
     */
    const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gtcjs-failing-"));
    try {
        const repo = path.join(sandboxRoot, "failing tool sandbox");
        fs.mkdirSync(repo);
        copyProjectWithDummyTests(repo);
        const status = () => execFileSync(
            "git",
            ["-C", repo, "status", "--porcelain", "--ignored"],
            { encoding: "utf8" },
        );
        const baseline = status();
        const shimDir = path.join(sandboxRoot, "shim bin");
        fs.mkdirSync(shimDir);
        const shim = path.join(shimDir, "node");
        fs.writeFileSync(shim, "#!/bin/sh\nexit 1\n", "utf8");
        fs.chmodSync(shim, 0o755);
        let error;
        try {
            execFileSync(
                "bash",
                [path.join(repo, "scripts", "pre-release-check.sh")],
                {
                    encoding: "utf8",
                    stdio: ["pipe", "pipe", "pipe"],
                    env: {
                        "PATH": shimDir + path.delimiter + "/usr/bin:/bin",
                        "HOME": process.env.HOME === undefined ? repo : process.env.HOME,
                    },
                },
            );
        } catch (caught) {
            error = caught;
        }
        assert.ok(error !== undefined, "the failing tool must abort the run");
        const stderr = String(error.stderr === undefined ? "" : error.stderr);
        assert.strictEqual(error.status, 1, stderr);
        assert.ok(
            stderr.includes("pre-release check failed: javascript-syntax-check"),
            stderr,
        );
        assert.ok(stderr.includes("pre-release verification FAILED"), stderr);
        assert.strictEqual(status(), baseline);
    } finally {
        fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
});

/**
 * @brief Build a restricted PATH directory holding every launcher-needed
 *        tool except `node`.
 * @details Symlinks the POSIX tools the launcher requires
 *          (`readlink`, `dirname`, `basename`, `git`) from the current
 *          PATH into a fresh temp bin directory; `node` is deliberately
 *          absent so `command -v node` fails (CTN-012 probe).
 * @param {string} root Temp root hosting the bin directory.
 * @param {boolean} includeNode When true, a `node` shim printing its argv
 *        is installed instead of the real runtime (delegation probe).
 * @return {string} The restricted PATH value.
 */
function restrictedLauncherPath(root, includeNode) {
    const binDir = path.join(root, "restricted bin");
    fs.mkdirSync(binDir);
    for (const tool of ["bash", "sh", "readlink", "dirname", "basename", "git"]) {
        let resolved;
        try {
            resolved = execFileSync("bash", ["-c", "command -v " + tool], {
                encoding: "utf8",
            }).trim();
        } catch (whichError) {
            continue;
        }
        if (resolved !== "") {
            fs.symlinkSync(resolved, path.join(binDir, tool));
        }
    }
    if (includeNode) {
        const shim = path.join(binDir, "node");
        fs.writeFileSync(shim, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n", "utf8");
        fs.chmodSync(shim, 0o755);
    }
    return binDir;
}

test("launcher missing node exits nonzero with diagnostic", () => {
    /**
     * @brief TST-029 (CTN-012): launcher validates node before delegation.
     * @details expected_output = executing the sandboxed launcher on a
     *          PATH without `node` exits 1 with the stderr diagnostic
     *          `ERROR: Required tool not found: node` and delegates to no
     *          runtime; expected_exception = none.
     */
    const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gtcjs-launcher-"));
    try {
        const repo = makeSandboxRepo(sandboxRoot, "launcher sandbox");
        const launcher = path.join(repo, "scripts", "templatenodejs.sh");
        fs.copyFileSync(LAUNCHER_SCRIPT_PATH, launcher);
        fs.chmodSync(launcher, 0o755);
        const binDir = restrictedLauncherPath(sandboxRoot, false);
        let error;
        try {
            execFileSync(launcher, ["--help"], {
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
                env: { "PATH": binDir, "HOME": repo },
            });
        } catch (caught) {
            error = caught;
        }
        assert.ok(error !== undefined, "the launcher must fail without node");
        const stderr = String(error.stderr === undefined ? "" : error.stderr);
        assert.strictEqual(error.status, 1, stderr);
        assert.ok(stderr.includes("ERROR: Required tool not found: node"), stderr);
    } finally {
        fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
});

test("launcher delegation argv invokes skeleton entry", () => {
    /**
     * @brief TST-029 (CTN-013): delegation argv invokes
     *        `src/templatenodejs/main.js` without npm side effects.
     * @details expected_output = with a `node` shim printing its argv, the
     *          sandboxed launcher prints exactly the skeleton entry path
     *          followed by the forwarded arguments; expected_exception =
     *          none.
     */
    const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gtcjs-launcher2-"));
    try {
        const repo = makeSandboxRepo(sandboxRoot, "launcher argv sandbox");
        const launcher = path.join(repo, "scripts", "templatenodejs.sh");
        fs.copyFileSync(LAUNCHER_SCRIPT_PATH, launcher);
        fs.chmodSync(launcher, 0o755);
        const binDir = restrictedLauncherPath(sandboxRoot, true);
        const stdout = execFileSync(launcher, ["--help"], {
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
            env: { "PATH": binDir, "HOME": repo },
        });
        const lines = stdout.split("\n");
        assert.strictEqual(lines[0], "src/templatenodejs/main.js");
        assert.strictEqual(lines[1], "--help");
        const launcherText = fs.readFileSync(LAUNCHER_SCRIPT_PATH, "utf8");
        assert.ok(launcherText.includes("command -v node"), launcherText);
        assert.ok(launcherText.includes("src/templatenodejs/main.js"), launcherText);
        assert.ok(!/npm (install|uninstall|pack|ci)/.test(launcherText), launcherText);
    } finally {
        fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
});
