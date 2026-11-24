"use strict";
/**
 * @file management.js
 * @brief Management commands of githubtemplatenodejs, isolated from core
 *        dispatch logic (DES-005).
 * @details Implements exact help-screen rendering (REQ-001, REQ-039),
 *          `npm` global install and uninstall lifecycle with Linux-only
 *          execution gating (CTN-009), and the manual-command fallback
 *          for non-Linux platforms (REQ-004, REQ-006, REQ-033). Every
 *          upgrading argv is exported as a byte-exact constant so tests
 *          can assert the literal strings mandated by the SRS.
 */
const { spawnSync } = require("child_process");

/**
 * @brief Canonical program name used across help text and npm commands.
 * @details Equals the npm package name and the single `bin` entry point
 *          name (A-11); drives every help-screen line (REQ-001) and the
 *          npm operand of every management argv (REQ-003, REQ-005).
 */
const PROGRAM_NAME = "githubtemplatenodejs";

/**
 * @brief Exact `npm install -g` argv executed on Linux by `--upgrade`
 *        without `--force` (REQ-003).
 * @details `UPGRADE_COMMAND.join(" ")` equals the literal string mandated
 *          by REQ-003 and is printed verbatim as the manual command on
 *          non-Linux platforms (REQ-004). Source resolves from the npm
 *          registry; the standard upgrade applies no forcing option
 *          (REQ-037).
 * @satisfies REQ-003 REQ-004 REQ-037
 */
const UPGRADE_COMMAND = [
    "npm",
    "install",
    "-g",
    "githubtemplatenodejs@latest",
];

/**
 * @brief Exact forced `npm install -g` argv executed on Linux by
 *        `--upgrade --force` (REQ-035).
 * @details `UPGRADE_FORCE_COMMAND.join(" ")` equals the literal string
 *          mandated by REQ-035 and is printed verbatim as the manual
 *          command on non-Linux platforms (REQ-004). The `--force`
 *          option forces the full re-download and complete
 *          reinstallation of the package from the npm registry (REQ-037).
 * @satisfies REQ-035 REQ-037
 */
const UPGRADE_FORCE_COMMAND = [
    "npm",
    "install",
    "-g",
    "githubtemplatenodejs@latest",
    "--force",
];

/**
 * @brief Exact develop-source `npm install -g` argv executed on Linux by
 *        `--upgrade --develop` / `--upgrade --dev` without `--force`
 *        (REQ-032, REQ-048).
 * @details `UPGRADE_DEVELOP_COMMAND.join(" ")` equals the literal string
 *          mandated by REQ-032 and is printed verbatim as the manual
 *          command on non-Linux platforms (REQ-033). The `#develop`
 *          fragment pins the source to the tip of the `develop` branch;
 *          no `--force` applies to the non-forced variant (REQ-037).
 * @satisfies REQ-032 REQ-033 REQ-037 REQ-048
 */
const UPGRADE_DEVELOP_COMMAND = [
    "npm",
    "install",
    "-g",
    "git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git#develop",
];

/**
 * @brief Exact forced develop-source `npm install -g` argv executed on
 *        Linux by `--upgrade --develop --force` / `--upgrade --dev
 *        --force` (REQ-036, REQ-048).
 * @details `UPGRADE_DEVELOP_FORCE_COMMAND.join(" ")` equals the literal
 *          string mandated by REQ-036 and is printed verbatim as the
 *          manual command on non-Linux platforms (REQ-033). The
 *          `#develop` fragment pins the source to the tip of the
 *          `develop` branch; `--force` forces the full re-download and
 *          complete reinstallation (REQ-037).
 * @satisfies REQ-036 REQ-037 REQ-048
 */
const UPGRADE_DEVELOP_FORCE_COMMAND = [
    "npm",
    "install",
    "-g",
    "git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git#develop",
    "--force",
];

/**
 * @brief Exact `npm uninstall -g` argv executed on Linux by `--uninstall`
 *        (REQ-005).
 * @details `UNINSTALL_COMMAND.join(" ")` equals the literal string
 *          mandated by REQ-005 and is printed verbatim as the manual
 *          command on non-Linux platforms (REQ-006).
 * @satisfies REQ-005 REQ-006
 */
const UNINSTALL_COMMAND = [
    "npm",
    "uninstall",
    "-g",
    "githubtemplatenodejs",
];

/**
 * @brief Flag column width keeping management help lines aligned.
 * @details Equals the length of the longest documented flag
 *          `--uninstall` (11 characters); every entry line pads its flag
 *          to this width before the ` - ` separator (REQ-001 alignment).
 * @satisfies REQ-001
 */
const FLAG_COLUMN_WIDTH = "--uninstall".length;

/**
 * @brief Report whether the current operating system is Linux.
 * @details `process.platform` identity check; all other platforms take
 *          the manual-command branch (A-09). Complexity: O(1).
 * @return {boolean} True on Linux, false otherwise.
 * @satisfies A-09 CTN-009
 */
function isLinux() {
    return process.platform === "linux";
}

/**
 * @brief Render one aligned help-screen entry line.
 * @details Flag is padded with trailing spaces to `FLAG_COLUMN_WIDTH`,
 *          then ` - ` and the description follow (REQ-001 template).
 *          Complexity: O(width + description length).
 * @param {string} flag Command or option flag (e.g. `--upgrade`).
 * @param {string} description Description text placed after the dash.
 * @return {string} Line matching the REQ-001 template alignment.
 * @satisfies REQ-001 REQ-039
 */
function managementEntry(flag, description) {
    const padded = flag + " ".repeat(FLAG_COLUMN_WIDTH - flag.length);
    return "  " + padded + " - " + description;
}

/**
 * @brief Select the exact upgrade argv for the requested variant.
 * @details Mapping mandated by the SRS: `(false, false)` ->
 *          UPGRADE_COMMAND (REQ-003), `(false, true)` ->
 *          UPGRADE_FORCE_COMMAND (REQ-035), `(true, false)` ->
 *          UPGRADE_DEVELOP_COMMAND (REQ-032), `(true, true)` ->
 *          UPGRADE_DEVELOP_FORCE_COMMAND (REQ-036). Forcing options are
 *          applied only when `force` is true; non-forced variants
 *          upgrade without `--force` (REQ-037). Complexity: O(1).
 * @param {boolean} develop True selects the GitHub develop-branch source
 *        (`--develop` / `--dev` alias, REQ-048).
 * @param {boolean} force True selects the forced reinstallation variant.
 * @return {string[]} Exact argv of the requested upgrade variant.
 * @satisfies REQ-003 REQ-032 REQ-035 REQ-036 REQ-037 REQ-048
 */
function upgradeCommand(develop, force) {
    if (develop) {
        return force ? UPGRADE_DEVELOP_FORCE_COMMAND : UPGRADE_DEVELOP_COMMAND;
    }
    return force ? UPGRADE_FORCE_COMMAND : UPGRADE_COMMAND;
}

/**
 * @brief Render the full help screen text (REQ-001 template).
 * @details The literal `(x.y.z)` slot of the template receives the
 *          installed version (A-01); the `Management Commands:` section
 *          lists every management command, the
 *          `Configuration Commands:` section lists every configuration
 *          command (REQ-039, A-02), and the `Options:` section documents
 *          the `--develop` / `--dev` (REQ-048) and `--force` modifiers
 *          of `--upgrade`.
 *          Complexity: O(lines) over the fixed template.
 * @param {string} version Installed version in `x.y.z` format.
 * @return {string} Help text without trailing newline; the caller prints
 *         it.
 * @satisfies REQ-001 REQ-039 A-01 A-02
 */
function buildHelpText(version) {
    const entries = [
        managementEntry(
            "--upgrade",
            "Reinstall " + PROGRAM_NAME + " on Linux; "
            + "print manual command elsewhere.",
        ),
        managementEntry(
            "--uninstall",
            "Uninstall " + PROGRAM_NAME + " on Linux; "
            + "print manual command elsewhere.",
        ),
        managementEntry("--ver", "Print the " + PROGRAM_NAME + " version."),
        managementEntry(
            "--version",
            "Print the " + PROGRAM_NAME + " version.",
        ),
        managementEntry("--help", "Print the full help screen."),
    ];
    const configurationEntries = [
        managementEntry(
            "--get",
            "Print the value at Path as one JSON document.",
        ),
        managementEntry(
            "--set",
            "Parse Value into the schema type and persist it at Path.",
        ),
        managementEntry(
            "--unset",
            "Restore Path to its schema default and persist atomically.",
        ),
        managementEntry(
            "--print",
            "Print current values as a box-drawing tree, "
            + "whole schema or at Path.",
        ),
        managementEntry(
            "--info",
            "Print parameter documentation with defaults, "
            + "constraints, and examples.",
        ),
        managementEntry(
            "--print-raw",
            "Print the exact bytes of the configuration JSON file.",
        ),
    ];
    const optionEntries = [
        managementEntry(
            "--develop",
            "With --upgrade: install from the GitHub develop branch.",
        ),
        managementEntry(
            "--dev",
            "Alias of --develop.",
        ),
        managementEntry(
            "--force",
            "With --upgrade: force full re-download and reinstallation.",
        ),
    ];
    const header = (
        "Usage: " + PROGRAM_NAME + " [command] [options] (" + version + ")"
    );
    const lines = (
        [header, "", "Management Commands:"]
        .concat(entries)
        .concat(["", "Configuration Commands:"])
        .concat(configurationEntries)
        .concat(["", "Options:"])
        .concat(optionEntries)
    );
    return lines.join("\n");
}

/**
 * @brief Print the full help screen to stdout.
 * @details Emits exactly one trailing newline after the help text;
 *          stdout carries no other content. Side effect: one stdout
 *          write. Complexity: O(help text length).
 * @param {string} version Installed version in `x.y.z` format.
 * @return {number} Always 0.
 * @satisfies REQ-001 PRJ-005
 */
function printHelp(version) {
    console.log(buildHelpText(version));
    return 0;
}

/**
 * @brief Execute one external command argv synchronously, inheriting the
 *        standard streams.
 * @details Delegates to `child_process.spawnSync` with `stdio:
 *          "inherit"` so the child writes directly to the terminal.
 *          Test seam: dispatches through `module.exports`, so unit tests
 *          replace this function with `mock.method` to capture the exact
 *          argv without spawning a process.
 * @param {string[]} argv Exact command argv; element 0 is the program.
 * @return {number} Child exit status; 1 when the child could not spawn.
 * @satisfies REQ-003 REQ-005 REQ-032 REQ-035 REQ-036 CTN-009
 */
function runCommand(argv) {
    const result = spawnSync(argv[0], argv.slice(1), { stdio: "inherit" });
    if (result.error !== undefined) {
        console.error(String(result.error));
        return 1;
    }
    return typeof result.status === "number" ? result.status : 1;
}

/**
 * @brief Upgrade the tool via the installed `npm` CLI on Linux.
 * @details On Linux the exact argv selected by `develop` and `force`
 *          executes synchronously with inherited streams and its exit
 *          code propagates: UPGRADE_COMMAND for the npm registry upgrade
 *          (REQ-003), UPGRADE_FORCE_COMMAND for the forced npm registry
 *          reinstallation (REQ-035), UPGRADE_DEVELOP_COMMAND for the
 *          GitHub development reinstall (REQ-032), and
 *          UPGRADE_DEVELOP_FORCE_COMMAND for the forced development
 *          reinstallation (REQ-036); forcing options apply only when
 *          `force` is true (REQ-037). On any other OS no process spawns;
 *          a warning plus the matching manual command print instead
 *          (REQ-004, REQ-033). Complexity: O(1) on the fallback path.
 * @param {boolean} develop True selects the GitHub develop-branch source
 *        (`--upgrade --develop` / `--upgrade --dev`, REQ-048); false
 *        selects the npm registry source (default).
 * @param {boolean} force True selects the forced full re-download and
 *        reinstallation variant (`--upgrade --force`, REQ-037); false
 *        executes the standard process without any forcing option.
 * @return {number} 0 on manual fallback or successful subprocess;
 *         otherwise the `npm` process exit code.
 * @satisfies REQ-003 REQ-004 REQ-032 REQ-033 REQ-035 REQ-036 REQ-037
 *            REQ-048 CTN-009
 */
function cmdUpgrade(develop, force) {
    const withDevelop = develop === true;
    const withForce = force === true;
    const command = upgradeCommand(withDevelop, withForce);
    if (!module.exports.isLinux()) {
        console.log("WARNING: --upgrade executes automatically on Linux only.");
        console.log("Run manually: " + command.join(" "));
        return 0;
    }
    return module.exports.runCommand(command);
}

/**
 * @brief Uninstall the tool via `npm uninstall -g` on Linux.
 * @details On Linux the exact UNINSTALL_COMMAND argv executes
 *          synchronously with inherited streams and its exit code
 *          propagates. On any other OS no process spawns; a warning plus
 *          the manual command print instead (REQ-006). Complexity: O(1)
 *          on the fallback path.
 * @return {number} 0 on manual fallback or successful subprocess;
 *         otherwise the `npm` process exit code.
 * @satisfies REQ-005 REQ-006 CTN-009
 */
function cmdUninstall() {
    if (!module.exports.isLinux()) {
        console.log("WARNING: --uninstall executes automatically on Linux only.");
        console.log("Run manually: " + UNINSTALL_COMMAND.join(" "));
        return 0;
    }
    return module.exports.runCommand(UNINSTALL_COMMAND);
}

module.exports = {
    PROGRAM_NAME,
    UPGRADE_COMMAND,
    UPGRADE_FORCE_COMMAND,
    UPGRADE_DEVELOP_COMMAND,
    UPGRADE_DEVELOP_FORCE_COMMAND,
    UNINSTALL_COMMAND,
    isLinux,
    buildHelpText,
    printHelp,
    runCommand,
    cmdUpgrade,
    cmdUninstall,
};
