"use strict";
/**
 * @file rename_me.test.js
 * @brief HDT unit suite (Generator mode) covering TST-033 and TST-034 for
 *        the one-shot template instantiation script `scripts/rename-me.sh`
 *        (PRJ-010, DES-061..DES-069).
 * @details HDT static-analysis artifact (section 7.1):
 *          - UUTs and levels: L1 = scripts/rename-me.sh executed
 *            end-to-end as one script-level unit (bash orchestration of
 *            find/grep/sed/mv/rm; no internal functions under `src/`
 *            exist to level further).
 *          - External dependencies isolated: filesystem (the UUT operates
 *            only on a disposable working-tree copy under `temp/`; the
 *            tracked repository tree is never mutated), process spawn
 *            (`execFileSync` with captured stdout/stderr), network (none;
 *            the script invokes no network tooling), wall clock
 *            (unneeded; the per-run sandbox name uses the worker pid).
 *          - Determinism: fixed parameter vectors whose target values
 *            carry no source substring; the template copy skips `.git`,
 *            `temp`, `node_modules`, coverage outputs, and build
 *            directories, mirroring the script's own prune contract.
 *          - Execution plan (dev signal): `node --test
 *            tests/rename_me.test.js` from the project root; the full
 *            suite command `npm test` keeps this module alongside the
 *            L0..L2 CLI suites.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { test } = require("node:test");
const assert = require("node:assert");

/**
 * @brief Repository root of the tracked template, resolved relative to
 *        this test file so the suite stays location-independent.
 */
const REPO_ROOT = path.join(__dirname, "..");

/**
 * @brief Absolute path of the tracked one-shot rename script.
 */
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "rename-me.sh");

/**
 * @brief Scratch root hosting the disposable template copies; excluded
 *        from content scanning by the script's own prune contract and
 *        ignored by git.
 */
const TEMP_ROOT = path.join(REPO_ROOT, "temp");

/**
 * @brief Byte-exact source-string oracle duplicated from the SRS
 *        rename-instantiation mapping (TST-034) to keep the assertion set
 *        independent from the implementation constants.
 */
const SOURCE_STRINGS = [
    "Francesco Rolando",
    "GitHub template for NodeJS app",
    "githubtemplatenodejs",
    "templatenodejs",
    "Ogekuri",
    "GitHub-Template-NodeJS",
];

/**
 * @brief Optional-parameter source strings preserved on omission (DES-063).
 */
const OPTIONAL_SOURCE_STRINGS = ["Francesco Rolando", "Ogekuri"];

/**
 * @brief Target identity values of the complete-rename vector; none of
 *        them contains any source string as a substring.
 */
const RENAMED_DESCRIPTION = "Deep space telemetry toolkit";
const RENAMED_PROGRAM = "novaprobe";
const RENAMED_SHORTNAME = "nova";
const RENAMED_REPOSITORY = "Nova-Probe-Repo";
const RENAMED_PUBLISHNAME = "novaprobe-npm";
const RENAMED_AUTHOR = "Mario Rossi";
const RENAMED_OWNER = "TestOwner";

/**
 * @brief Complete rename parameter vector (TST-033): all seven parameters.
 */
const COMPLETE_RENAME_PARAMETERS = [
    "--description", RENAMED_DESCRIPTION,
    "--program", RENAMED_PROGRAM,
    "--shortname", RENAMED_SHORTNAME,
    "--repository", RENAMED_REPOSITORY,
    "--publishname", RENAMED_PUBLISHNAME,
    "--author", RENAMED_AUTHOR,
    "--owner", RENAMED_OWNER,
];

/**
 * @brief Mandatory-only parameter vector (DES-063 boundary): `--author`
 *        and `--owner` omitted, so their source strings must survive.
 */
const MANDATORY_ONLY_PARAMETERS = [
    "--description", RENAMED_DESCRIPTION,
    "--program", RENAMED_PROGRAM,
    "--shortname", RENAMED_SHORTNAME,
    "--repository", RENAMED_REPOSITORY,
    "--publishname", RENAMED_PUBLISHNAME,
];

/**
 * @brief Copy filter mirroring the script's prune contract: the sandbox
 *        copy is a plain tree without `.git` (DES-061) without generated
 *        cache or dependency directories; the tracked `dist/` artifacts
 *        stay included because their filenames carry the program name
 *        (DES-066) and `temp/` is the recursion guard.
 * @param {string} source Candidate path visited by `fs.cpSync`.
 * @return {boolean} False when the path must be excluded from the copy.
 */
function copyFilter(source) {
    const name = path.basename(source);
    return ![
        ".git",
        "temp",
        "node_modules",
        ".nyc_output",
        "coverage",
        "build",
    ].includes(name);
}

/**
 * @brief Copy the template working tree into the sandbox destination.
 * @details Mirrors every tracked and untracked non-ignored working-tree
 *          file (including the tracked `dist/` release artifacts whose
 *          filenames carry the program name) while skipping `.git`, the
 *          `temp/` scratch root (recursion guard), and generated cache or
 *          dependency directories; the sandbox copy is a plain tree
 *          without `.git`, which the script must support (DES-061).
 *          Implemented with a manual walker because `fs.cpSync` rejects
 *          destinations inside the source subtree even when a filter
 *          excludes them.
 * @param {string} destination Sandbox copy root (inside `temp/`).
 * @return {undefined}
 */
function copyTemplate(destination) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(REPO_ROOT, { withFileTypes: true })) {
        if (!copyFilter(entry.name)) {
            continue;
        }
        const sourceEntry = path.join(REPO_ROOT, entry.name);
        const targetEntry = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            copyDirectory(sourceEntry, targetEntry);
        } else if (entry.isFile()) {
            fs.copyFileSync(sourceEntry, targetEntry);
        }
    }
}

/**
 * @brief Recursively copy one directory tree of the template copy.
 * @details Worker of `copyTemplate`; copies files and nested directories
 *          without following symlinks. Complexity: O(tree size).
 * @param {string} sourceEntry Source directory path.
 * @param {string} targetEntry Destination directory path.
 * @return {undefined}
 */
function copyDirectory(sourceEntry, targetEntry) {
    fs.mkdirSync(targetEntry, { recursive: true });
    for (const nested of fs.readdirSync(sourceEntry, { withFileTypes: true })) {
        if (!copyFilter(nested.name)) {
            continue;
        }
        const nestedSource = path.join(sourceEntry, nested.name);
        const nestedTarget = path.join(targetEntry, nested.name);
        if (nested.isDirectory()) {
            copyDirectory(nestedSource, nestedTarget);
        } else if (nested.isFile()) {
            fs.copyFileSync(nestedSource, nestedTarget);
        }
    }
}

/**
 * @brief Execute one rename script invocation with captured streams.
 * @param {string} scriptPath Absolute path of the script to execute.
 * @param {string[]} parameters Complete CLI parameter vector.
 * @return {{status: number, stdout: string, stderr: string}} Completed
 *         process record with decoded stdout/stderr.
 */
function runRenameScript(scriptPath, parameters) {
    try {
        const stdout = execFileSync(
            "bash",
            [scriptPath, ...parameters],
            { cwd: REPO_ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
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

/**
 * @brief Report whether raw file bytes are scannable text.
 * @details Applies the same binary exclusion contract as the script's
 *          `grep -I` filter (TST-034): NUL bytes in the leading 8 KiB or
 *          a failing strict UTF-8 decode classify the payload as binary,
 *          so compressed distribution archives (package tarball) are
 *          excluded from content scanning while every tracked text file
 *          stays covered.
 * @param {Buffer} content Raw file bytes.
 * @return {boolean} True when the payload is scannable text.
 */
function isTextContent(content) {
    if (content.subarray(0, 8192).includes(0)) {
        return false;
    }
    try {
        const decoded = new TextDecoder("utf-8", { fatal: true });
        decoded.decode(content);
    } catch (decodeError) {
        return false;
    }
    return true;
}

/**
 * @brief Assert the TST-034 residual-free contract over the copy.
 * @details Walks the whole sandbox tree: every file and directory name
 *          must avoid all given source strings, and every text-file
 *          content (binary archives excluded per TST-034) must avoid
 *          them byte-wise; violations fail with the offending path and
 *          string.
 * @param {string} copyRoot Sandbox copy root to scan.
 * @param {string[]} [sources] Source strings that must be absent;
 *        defaults to the full SRS mapping.
 * @return {undefined}
 * @throws {AssertionError} On any surviving source-string occurrence.
 */
function assertNoSourceStrings(copyRoot, sources) {
    const effectiveSources = sources === undefined ? SOURCE_STRINGS : sources;
    const encodedSources = effectiveSources.map(
        (source) => Buffer.from(source, "utf8"),
    );
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const entryPath = path.join(current, entry.name);
            for (const source of effectiveSources) {
                assert.ok(
                    !entry.name.includes(source),
                    "source string " + JSON.stringify(source)
                    + " survives in path: " + entryPath,
                );
            }
            if (entry.isDirectory()) {
                walk(entryPath);
                continue;
            }
            const content = fs.readFileSync(entryPath);
            if (!isTextContent(content)) {
                continue;
            }
            for (const encoded of encodedSources) {
                assert.ok(
                    !content.includes(encoded),
                    "source string " + JSON.stringify(encoded.toString("utf8"))
                    + " survives in file: " + entryPath,
                );
            }
        }
    };
    walk(copyRoot);
}

test("rename me complete rename removes all source strings", () => {
    /**
     * @brief TST-033/TST-034 happy path: full seven-parameter rename.
     * @details expected_output = exit status 0 with captured diagnostics
     *          on failure, self-removal of the copied script (DES-069),
     *          the TST-034 residual-free contract over names and text
     *          contents, and the positive instantiation of the new
     *          identity across the renamed launcher, package, and
     *          skeleton directories (DES-066); expected_exception = none.
     * @note Isolation: the copy lives under `temp/` (git-ignored); the
     *       tracked tree is never mutated.
     */
    const workRoot = path.join(TEMP_ROOT, "rename-me-complete-" + process.pid);
    const copyRoot = path.join(workRoot, "template-copy");
    try {
        copyTemplate(copyRoot);
        const result = runRenameScript(
            path.join(copyRoot, "scripts", "rename-me.sh"),
            COMPLETE_RENAME_PARAMETERS,
        );
        assert.strictEqual(result.status, 0, (
            "expected exit 0; stdout=" + JSON.stringify(result.stdout)
            + " stderr=" + JSON.stringify(result.stderr)
        ));
        assert.strictEqual(
            fs.existsSync(path.join(copyRoot, "scripts", "rename-me.sh")),
            false,
            "the rename script must remove itself after full success (DES-069)",
        );
        assertNoSourceStrings(copyRoot);
        assert.strictEqual(
            fs.existsSync(path.join(copyRoot, "src", RENAMED_PROGRAM, "main.js")),
            true,
        );
        assert.strictEqual(
            fs.existsSync(path.join(copyRoot, "scripts", RENAMED_SHORTNAME + ".sh")),
            true,
        );
        assert.strictEqual(
            fs.existsSync(path.join(copyRoot, "src", RENAMED_SHORTNAME, "core.js")),
            true,
        );
    } finally {
        fs.rmSync(workRoot, { recursive: true, force: true });
    }
});

test("rename me optional parameters default preserves author and owner", () => {
    /**
     * @brief DES-063 boundary: omitted optional parameters keep sources.
     * @details expected_output = exit status 0, absence of the
     *          mandatory-source strings across names and text contents,
     *          and byte-presence of `Francesco Rolando` and `Ogekuri`
     *          inside the copied `package.json` (omission preserves both
     *          source strings); expected_exception = none.
     */
    const workRoot = path.join(TEMP_ROOT, "rename-me-mandatory-" + process.pid);
    const copyRoot = path.join(workRoot, "template-copy");
    const mandatorySources = SOURCE_STRINGS.filter(
        (source) => !OPTIONAL_SOURCE_STRINGS.includes(source),
    );
    try {
        copyTemplate(copyRoot);
        const result = runRenameScript(
            path.join(copyRoot, "scripts", "rename-me.sh"),
            MANDATORY_ONLY_PARAMETERS,
        );
        assert.strictEqual(result.status, 0, (
            "expected exit 0; stdout=" + JSON.stringify(result.stdout)
            + " stderr=" + JSON.stringify(result.stderr)
        ));
        assertNoSourceStrings(copyRoot, mandatorySources);
        const packageBytes = fs.readFileSync(
            path.join(copyRoot, "package.json"),
        );
        for (const source of OPTIONAL_SOURCE_STRINGS) {
            assert.ok(
                packageBytes.includes(Buffer.from(source, "utf8")),
                "omitted optional source string must survive: " + source,
            );
        }
    } finally {
        fs.rmSync(workRoot, { recursive: true, force: true });
    }
});

test("rename me missing mandatory parameter terminates non zero", () => {
    /**
     * @brief DES-062 error boundary: incomplete usage aborts pre-mutation.
     * @details expected_output = non-zero exit with a non-empty stderr
     *          diagnostic (usage contract), plus the tracked script file
     *          still existing: parameter validation precedes every
     *          mutation, so no self-removal and no repository mutation can
     *          occur (DES-068); expected_exception = none.
     */
    const result = runRenameScript(SCRIPT_PATH, ["--description", RENAMED_DESCRIPTION]);
    assert.notStrictEqual(
        result.status,
        0,
        "incomplete usage must terminate non-zero (DES-062)",
    );
    assert.notStrictEqual(
        result.stderr.trim(),
        "",
        "the failure must carry a stderr diagnostic (DES-062)",
    );
    assert.strictEqual(
        fs.existsSync(SCRIPT_PATH),
        true,
        "a usage failure must not remove the script (DES-068)",
    );
});
