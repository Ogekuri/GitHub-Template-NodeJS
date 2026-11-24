"use strict";
/**
 * @file galias_conf.test.js
 * @brief HDT unit suite (Generator mode) covering TST-035 for the
 *        `.galias.conf` galias configuration contract (DES-070,
 *        DES-071, DES-072).
 * @details HDT static-analysis artifact (section 7.1):
 *          - UUTs and levels: L0 = the `.galias.conf` document contract
 *            (JSON parseability, mandated integration fields, ver_rules
 *            pattern set, semver-capturing regular expressions); L1 =
 *            the rule-to-tracked-file resolution plus the cross-file
 *            version-consistency scan against the `package.json`
 *            canonical version.
 *          - External dependencies isolated: none; the suite is fully
 *            deterministic and isolated (read-only filesystem reads of
 *            tracked repository files plus one `git ls-files`
 *            enumeration defining the galias resolution domain; no
 *            network, no clock, no writes, no shared mutable state).
 *          - Execution plan (dev signal): `npm test` from the project
 *            root; CI gates L0 -> L1 fail-fast outside test bodies.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");
const assert = require("node:assert");

/**
 * @brief Repository root holding the `.galias.conf` contract file and
 *        every ver_rules target.
 */
const REPO_ROOT = path.join(__dirname, "..");

/**
 * @brief galias local configuration contract file (DES-070).
 */
const GALIAS_CONF_PATH = path.join(REPO_ROOT, ".galias.conf");

/**
 * @brief ver_rules pattern set mandated by DES-071, in declaration
 *        order.
 * @details The set contains only NodeJS version-bearing tracked files;
 *          the Python source rule, `pyproject.toml`, and `uv.lock` are
 *          forbidden by DES-071 and fail this golden comparison.
 */
const EXPECTED_VER_RULE_PATTERNS = [
    "README.md",
    "scripts/**/*.sh",
    "package.json",
    "package-lock.json",
];

/**
 * @brief Semver capture-group literal mandated inside every ver_rules
 *        regular expression (DES-071).
 */
const SEMVER_CAPTURE_GROUP = "(\\d+\\.\\d+\\.\\d+)";

/**
 * @brief Load and parse the `.galias.conf` contract document.
 * @details Reads the tracked file as UTF-8 and parses the JSON document
 *          per call; no caching, no mutation. Complexity: O(file size).
 * @return {Object} Parsed `.galias.conf` payload.
 * @throws {SyntaxError} When the tracked document is malformed JSON.
 */
function loadGaliasConf() {
    return JSON.parse(fs.readFileSync(GALIAS_CONF_PATH, "utf8"));
}

/**
 * @brief Enumerate the tracked-file universe reported by `git ls-files`.
 * @details Mirrors the galias ver_rules resolution domain: only tracked
 *          repository files are addressable by ver_rules patterns.
 *          Read-only invocation with the repository root as working
 *          directory. Complexity: O(tracked files).
 * @return {string[]} Repository-relative tracked paths in git order.
 * @throws {Error} When `git ls-files` fails.
 */
function trackedFiles() {
    return execFileSync("git", ["ls-files"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
    }).split("\n").filter((line) => line.length > 0);
}

/**
 * @brief Convert one ver_rules glob pattern into a strict whole-path
 *        RegExp.
 * @details Grammar: a `**` segment between slashes matches zero or
 *          more complete intermediate segments, a trailing standalone
 *          `**` matches any remaining path, `*` matches within one
 *          segment, `?` matches one non-separator character, every
 *          other character is literal. The result anchors both ends so
 *          a pattern never matches a path prefix. Complexity:
 *          O(pattern length).
 * @param {string} pattern Glob pattern from `ver_rules.pattern`.
 * @return {RegExp} Anchored whole-path matcher.
 */
function globToRegExp(pattern) {
    let source = "";
    let index = 0;
    while (index < pattern.length) {
        if (pattern.startsWith("**/", index)) {
            source += "(?:[^/]+/)*";
            index += 3;
        } else if (pattern.startsWith("**", index)) {
            source += ".*";
            index += 2;
        } else if (pattern[index] === "*") {
            source += "[^/]*";
            index += 1;
        } else if (pattern[index] === "?") {
            source += "[^/]";
            index += 1;
        } else {
            source += pattern[index].replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&",
            );
            index += 1;
        }
    }
    return new RegExp("^" + source + "$");
}

/**
 * @brief Extract every semver capture from one text with one rule
 *        regex.
 * @details Applies the regex in global mode and collects capture group
 *          1 per match; the loop guard advances past zero-length
 *          matches defensively. Complexity: O(text size * matches).
 * @param {string} regex Source of the ver_rules regular expression.
 * @param {string} text File content to scan.
 * @return {string[]} Captured semver strings in occurrence order.
 */
function capturedVersions(regex, text) {
    const scanner = new RegExp(regex, "g");
    const versions = [];
    let match;
    while ((match = scanner.exec(text)) !== null) {
        versions.push(match[1]);
        if (match.index === scanner.lastIndex) {
            scanner.lastIndex += 1;
        }
    }
    return versions;
}

test("galias conf declares the repository integration contract", () => {
    /**
     * @brief TST-035 / DES-070 L0: document parseability and mandated
     *        fields.
     * @details expected_output = none; expected_exception =
     *          AssertionError when `.galias.conf` is malformed JSON or
     *          deviates from the mandated branch names, build script,
     *          and pre-release-check script declarations.
     */
    const conf = loadGaliasConf();
    assert.strictEqual(conf.master, "master");
    assert.strictEqual(conf.develop, "develop");
    assert.strictEqual(conf.work, "work");
    assert.strictEqual(conf.build_script, "scripts/build.sh");
    assert.strictEqual(
        conf.pre_release_check,
        "scripts/pre-release-check.sh",
    );
});

test("galias conf ver_rules match only the mandated nodejs targets", () => {
    /**
     * @brief TST-035 / DES-071 L0: golden pattern set and semver
     *        capture contract.
     * @details expected_output = none; expected_exception =
     *          AssertionError when the pattern list differs from the
     *          four mandated NodeJS targets in declaration order, when a
     *          rule carries malformed or non-string fields, or when a
     *          regular expression omits the semver capture group or
     *          fails to compile.
     */
    const conf = loadGaliasConf();
    assert.ok(Array.isArray(conf.ver_rules) && conf.ver_rules.length > 0);
    assert.deepStrictEqual(
        conf.ver_rules.map((rule) => rule.pattern),
        EXPECTED_VER_RULE_PATTERNS,
    );
    for (const rule of conf.ver_rules) {
        assert.strictEqual(typeof rule.pattern, "string", rule.pattern);
        assert.strictEqual(typeof rule.regex, "string", rule.pattern);
        assert.ok(rule.regex.includes(SEMVER_CAPTURE_GROUP), rule.pattern);
        assert.doesNotThrow(() => new RegExp(rule.regex), rule.pattern);
    }
});

test("galias ver rules resolve tracked files and agree with package version", () => {
    /**
     * @brief TST-035 / DES-072 L1: rule resolution and cross-file
     *        version consistency.
     * @details expected_output = none; expected_exception =
     *          AssertionError when a rule matches no tracked file (the
     *          `g ver` failure mode), when a matched tracked file lacks
     *          a version capture, or when any captured version differs
     *          from the `package.json` canonical version.
     */
    const conf = loadGaliasConf();
    const files = trackedFiles();
    const canonical = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
    ).version;
    for (const rule of conf.ver_rules) {
        const glob = globToRegExp(rule.pattern);
        const matched = files.filter((file) => glob.test(file));
        assert.ok(
            matched.length > 0,
            "no tracked file matches " + rule.pattern,
        );
        for (const file of matched) {
            const versions = capturedVersions(
                rule.regex,
                fs.readFileSync(path.join(REPO_ROOT, file), "utf8"),
            );
            assert.ok(
                versions.length > 0,
                "no version captured from " + file,
            );
            for (const version of versions) {
                assert.strictEqual(version, canonical, file);
            }
        }
    }
});
