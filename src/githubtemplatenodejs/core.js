"use strict";
/**
 * @file core.js
 * @brief Core command dispatch and githubtemplatenodejs CLI runtime
 *        orchestration.
 * @details Runs the automatic online version check before argument
 *          dispatch (REQ-007), then routes management and configuration
 *          commands to dedicated handlers and propagates exit codes to
 *          the process boundary.
 */
const path = require("path");
const config = require("./config");
const configRender = require("./config_render");
const management = require("./management");
const versionCheck = require("./version_check");

/**
 * @brief Installed package version (single version source).
 * @details Read once from the packaging metadata `package.json` at the
 *          repository/package root (two directory levels above this
 *          module); the same constant feeds the CLI usage line (A-01),
 *          the version report (REQ-002), and the availability comparison
 *          (REQ-012). Resolution works identically inside the repository
 *          and inside an installed `node_modules` package because npm
 *          always ships `package.json` at the package root.
 * @satisfies A-01 DES-001
 */
const VERSION = require(path.join(__dirname, "..", "..", "package.json")).version;

/**
 * @brief Execute the gated version check, then dispatch commands.
 * @details Dispatch order: `--help` or no arguments -> help screen;
 *          `--ver` / `--version` -> aligned three-row version report
 *          fetching npm and GitHub with the gate bypassed (REQ-002,
 *          REQ-027..REQ-031); then `--upgrade`, optionally with the
 *          `--develop` (or its `--dev` alias, REQ-048) source modifier
 *          selecting the GitHub develop branch (REQ-032..REQ-034) and
 *          the `--force` auxiliary modifier forcing the full
 *          re-download and reinstallation (REQ-035..REQ-038); then
 *          `--uninstall`; then the additive
 *          configuration CLI commands `--get`, `--set`, `--unset`,
 *          `--print-raw`, `--print`, `--info` (PRJ-006); unknown input
 *          falls back to the help screen. Non-forced invocations
 *          execute the gated npm check before dispatch (REQ-007),
 *          suppressed entirely when the configuration switch
 *          `version_check:disable-version-check` is enabled (REQ-043)
 *          and always restored when the configuration is unreadable or
 *          missing (REQ-044); `--ver` / `--version` bypass both the
 *          gate and the switch (REQ-045). Existing management dispatch
 *          and observable behavior are unchanged by the configuration
 *          branches (REQ-016..REQ-021). The `--develop` / `--dev`
 *          (REQ-034, REQ-048) and `--force` (REQ-038) modifiers
 *          dispatch no upgrade on their own and fall back to the help
 *          screen. Complexity:
 *          O(args + network) network-bound.
 * @param {string[]} [argv] CLI arguments excluding the program name;
 *        undefined resolves to `process.argv.slice(2)`.
 * @return {Promise<number>} Process exit code: 0 on handled dispatch, or
 *         the return code of the spawned `npm` subprocess for
 *         `--upgrade` / `--uninstall`, or 1 for configuration CLI
 *         failures (REQ-023).
 * @satisfies REQ-001 REQ-002 REQ-007 REQ-016 REQ-017 REQ-018 REQ-019
 *            REQ-020 REQ-021 REQ-027 REQ-028 REQ-029 REQ-030 REQ-031
 *            REQ-032 REQ-033 REQ-034 REQ-035 REQ-036 REQ-037 REQ-038
 *            REQ-042 REQ-043 REQ-044 REQ-045 REQ-048 A-06 PRJ-006
 */
async function main(argv) {
    const args = argv === undefined ? [...process.argv.slice(2)] : [...argv];
    const forced = args.includes("--ver") || args.includes("--version");
    if (!forced && !config.versionCheckDisabled()) {
        await versionCheck.runVersionCheck(VERSION, false);
    }
    if (args.length === 0 || (args.includes("--help") && !forced)) {
        return management.printHelp(VERSION);
    }
    if (forced) {
        await versionCheck.runVersionReport(VERSION);
        return 0;
    }
    if (args.includes("--upgrade")) {
        return management.cmdUpgrade(
            args.includes("--develop") || args.includes("--dev"),
            args.includes("--force"),
        );
    }
    if (args.includes("--uninstall")) {
        return management.cmdUninstall();
    }
    if (args.includes("--get")) {
        return config.handleGet(args);
    }
    if (args.includes("--set")) {
        return config.handleSet(args);
    }
    if (args.includes("--unset")) {
        return config.handleUnset(args);
    }
    if (args.includes("--print-raw")) {
        return config.handlePrintRaw(args);
    }
    if (args.includes("--print")) {
        return configRender.handlePrint(args);
    }
    if (args.includes("--info")) {
        return configRender.handleInfo(args);
    }
    return management.printHelp(VERSION);
}

module.exports = { VERSION, main };
