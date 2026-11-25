# githubtemplatenodejs Runtime Workflow

Runtime model derived from static analysis of `src/` only. Declaration file
paths only; no line numbers. Process IDs are stable.

## Execution Units Index

| ID | Type | Parent process | Role | Entrypoint symbol(s) | Defining file(s) |
| --- | --- | --- | --- | --- | --- |
| `PROC:launcher` | process | none (user shell) | Local-run wrapper resolving the project root, validating `node`, and delegating to the skeleton CLI entry | `scripts/templatenodejs.sh` (bash top-level execution) | `scripts/templatenodejs.sh` |
| `PROC:main` | process | `PROC:launcher` (via `exec` replacement) or user interpreter (`node`, `npm install -g` bin, `npx`) | CLI application process: gated version check plus management-command and configuration-CLI dispatch | `src/githubtemplatenodejs/main.js` (npm `bin` entry); `src/templatenodejs/main.js` (launcher delegation) | `src/githubtemplatenodejs/main.js`, `src/githubtemplatenodejs/index.js`, `src/templatenodejs/main.js`, `src/templatenodejs/core.js`, `src/githubtemplatenodejs/core.js`, `src/githubtemplatenodejs/config.js`, `src/githubtemplatenodejs/config_render.js`, `src/githubtemplatenodejs/management.js`, `src/githubtemplatenodejs/version_check.js`, `src/githubtemplatenodejs/colors.js` |
| `PROC:npm-tool-manage` | process | `PROC:main` | Transient child process executing the npm global install/uninstall argv variants (`--upgrade` npm/develop/forced variants and `--uninstall`; Linux only) | npm CLI argv from `UPGRADE_COMMAND` / `UPGRADE_FORCE_COMMAND` / `UPGRADE_DEVELOP_COMMAND` / `UPGRADE_DEVELOP_FORCE_COMMAND` / `UNINSTALL_COMMAND` | `src/githubtemplatenodejs/management.js` |
| `PROC:build-tooling` | process | none (user shell) | Release-packaging wrapper validating the toolchain, restoring the clean startup state via `scripts/clean.sh`, pruning stale `dist/` tarballs, and delegating the package build | `scripts/build.sh` (bash top-level execution) | `scripts/build.sh` |
| `PROC:clean-tooling` | process | `PROC:build-tooling` (delegated) or user shell | Repository cleanup wrapper removing execution-generated dependency trees, coverage outputs, build intermediates, and coverage data files while preserving `dist/` | `scripts/clean.sh` (bash top-level execution) | `scripts/clean.sh` |
| `PROC:npm-pack-build` | process | `PROC:build-tooling` | Transient npm child process packaging `package.json` plus the declared files into the `dist/` package tarball | npm CLI argv: `pack --pack-destination <DIST_DIR>` | `scripts/build.sh` |
| `PROC:release-check` | process | none (user shell) | Release-readiness verifier running fail-fast checks (shell syntax, JavaScript syntax, npm test suite, out-of-tree build, artifact validation) with trap-based baseline-guarded cleanup and integrity verification | `scripts/pre-release-check.sh` (bash top-level execution) | `scripts/pre-release-check.sh` |
| `PROC:npm-check-runtime` | process | `PROC:release-check` | Transient npm/node children executing the `node --check` syntax phase, the `npm test` suite, the out-of-tree `npm pack` build, and the artifact validator | npm/node CLI argv: `node --check <file>`, `npm test`, `npm pack --pack-destination <TMP>`, `bash <validator> <TMP>` | `scripts/pre-release-check.sh` |
| `PROC:rename-tooling` | process | none (user shell) or test-suite child | One-shot template instantiation: substitutes the template identity strings across pruned-tree text file contents, renames every file/directory carrying them, verifies the residual-free state, and removes itself on success | `scripts/rename-me.sh` (bash top-level execution) | `scripts/rename-me.sh` |

Threads: `PROC:main` — no explicit threads detected (single-threaded
Node.js event loop; subprocesses are synchronous `spawnSync` calls, not
threads). `PROC:launcher`, `PROC:npm-tool-manage`,
`PROC:build-tooling`, `PROC:clean-tooling`, `PROC:npm-pack-build`,
`PROC:release-check`, `PROC:npm-check-runtime`, `PROC:rename-tooling` —
no explicit threads detected.

## Execution Units

### PROC:launcher

- Entrypoint(s): bash interpreter executing `scripts/templatenodejs.sh`
  top-level statements.
- Lifecycle/trigger: starts on user invocation of
  `scripts/templatenodejs.sh`; resolves the absolute script path, derives
  the base and project root directories, rejects execution when the base
  directory differs from the git root, validates `node` availability
  (non-zero exit with a diagnostic when missing), then enters the project
  root and replaces itself with the Node.js runtime via `exec` running the
  skeleton CLI entry `src/templatenodejs/main.js` (or exits non-zero on
  root-resolution or tool failure).
- Internal Call-Trace Tree: no internal functions under `src/` (linear
  top-level shell script; no function definitions).
- External Boundaries: `readlink -f`, `dirname`, `basename`, `git
  rev-parse --show-toplevel`, `command -v`, `exec` process replacement,
  stderr diagnostics.

### PROC:main

- Entrypoint(s): npm `bin` executable `githubtemplatenodejs` loading
  `src/githubtemplatenodejs/main.js` (top-level dispatcher invocation with
  `process.exit` propagation); launcher delegation loading
  `src/templatenodejs/main.js`, which bridges through
  `src/templatenodejs/core.js` to the same dispatcher; package-root
  export `src/githubtemplatenodejs/index.js` exposing `main`.
- Lifecycle/trigger: starts on CLI invocation; reads the installed version
  from `package.json`; runs the gated online version check before dispatch
  unless the configuration switch `version_check:disable-version-check` is
  enabled (REQ-043; the dual-source version report variant for `--ver` /
  `--version` always executes, independent of the switch and the gate);
  then dispatches help, the aligned three-row version report, the
  install/uninstall management commands with the `--develop` / `--dev` and
  `--force` upgrade modifiers, and the configuration CLI commands (`--get`, `--set`,
  `--unset`, `--print-raw`, `--print`, `--info`); unknown input falls back
  to the help screen; terminates through `process.exit` with the
  dispatcher promise resolution (0/child status/1).
- Internal Call-Trace Tree (internal functions only, call order):
  - `main(argv)`: disable-switch evaluation, gated check, then command
    dispatch [`src/githubtemplatenodejs/core.js`]
    - `config.versionCheckDisabled(...)`: tolerant disable-switch reader
      for the automatic check (REQ-042..REQ-044; absent, unreadable,
      malformed, or non-object configuration keeps the check enabled)
      [`src/githubtemplatenodejs/config.js`]
      - `config.loadDisplay(...)`: schema-shaped display-view loader with
        stale-schema tolerance [`src/githubtemplatenodejs/config.js`]
        - `config.readPayload(...)`: read and parse the configuration
          JSON document [`src/githubtemplatenodejs/config.js`]
    - `versionCheck.runVersionCheck(...)`: online check orchestration
      (skipped when the disable switch is enabled)
      [`src/githubtemplatenodejs/version_check.js`]
      - `colors.notificationColors(...)`: hardcoded ANSI prefixes from
        the embedded internal color JSON
        [`src/githubtemplatenodejs/colors.js`]
      - `versionCheck.cachePath(...)`: resolve cache file path from
        `$HOME` [`src/githubtemplatenodejs/version_check.js`]
      - `versionCheck.readCache(...)`: load idle-time cache JSON
        [`src/githubtemplatenodejs/version_check.js`]
      - `versionCheck.gateAllowsRequest(...)`: idle-time request gate
        [`src/githubtemplatenodejs/version_check.js`]
      - `versionCheck.fetchLatestNpmVersion(...)`: HTTPS GET of the
        latest npm registry version
        [`src/githubtemplatenodejs/version_check.js`]
        - `versionCheck.fetchJson(...)`: stdlib `https` transport with
          the hardcoded 2-second timeout
          [`src/githubtemplatenodejs/version_check.js`]
      - `versionCheck.parseVersion(...)`: tolerant dotted-version compare
        key built from leading-integer components
        [`src/githubtemplatenodejs/version_check.js`]
      - `versionCheck.compareVersions(...)`: element-wise component
        comparison with zero-filled missing components
        [`src/githubtemplatenodejs/version_check.js`]
      - `versionCheck.reportFailure(...)`: failure note plus 86400 s
        backoff cache (failure path)
        [`src/githubtemplatenodejs/version_check.js`]
        - `versionCheck.printColored(...)`: ANSI-prefixed stdout line
          [`src/githubtemplatenodejs/version_check.js`]
        - `versionCheck.writeCache(...)`: best-effort four-field cache
          write [`src/githubtemplatenodejs/version_check.js`]
          - `versionCheck.humanTimestamp(...)`: UTC ISO-8601 rendering
            [`src/githubtemplatenodejs/version_check.js`]
      - `versionCheck.printColored(...)`: newer-release note (newer path)
      - `versionCheck.writeCache(...)`: 3600 s refresh (success path)
  - `management.printHelp(...)`: help screen emission
    [`src/githubtemplatenodejs/management.js`]
    - `management.buildHelpText(...)`: exact REQ-001 template rendering
      [`src/githubtemplatenodejs/management.js`]
      - `management.managementEntry(...)`: aligned flag/description line
        [`src/githubtemplatenodejs/management.js`]
  - `versionCheck.runVersionReport(...)`: forced dual-source report
    (`--ver` / `--version` bypass of the gate and switch)
    [`src/githubtemplatenodejs/version_check.js`]
    - `colors.notificationColors(...)`
    - `versionCheck.fetchLatestNpmVersion(...)`
      - `versionCheck.fetchJson(...)`
    - `versionCheck.fetchLatestGithubVersion(...)`: HTTPS GET of the
      latest GitHub release tag stripped of its `v` prefix
      [`src/githubtemplatenodejs/version_check.js`]
      - `versionCheck.fetchJson(...)`
    - `versionCheck.printColored(...)`: per-source failure notes
    - `versionCheck.formatReportRow(...)`: 17-character label pad rows
    - `versionCheck.unknownValue(...)`: `unknown (<reason>)` placeholder
    - `versionCheck.writeCache(...)`: cache delta driven by the npm
      outcome only
  - `management.cmdUpgrade(...)`: install lifecycle
    [`src/githubtemplatenodejs/management.js`]
    - `management.upgradeCommand(...)`: variant selection by
      `--develop` / `--dev` / `--force`
      [`src/githubtemplatenodejs/management.js`]
    - `management.runCommand(...)`: synchronous child spawn with
      inherited streams and exit-code propagation (Linux only)
      [`src/githubtemplatenodejs/management.js`]
  - `management.cmdUninstall(...)`: uninstall lifecycle
    [`src/githubtemplatenodejs/management.js`]
    - `management.runCommand(...)` (Linux only)
  - `config.handleGet(...)`: `--get Path` JSON document emission
    [`src/githubtemplatenodejs/config.js`]
    - `config.operandValues(...)`: flag operand extraction
      [`src/githubtemplatenodejs/config.js`]
      - `config.usageExamples(...)`: schema-valid usage diagnostics
        [`src/githubtemplatenodejs/config.js`]
    - `config.ensureBootstrapped(...)`: create missing storage with
      defaults [`src/githubtemplatenodejs/config.js`]
      - `config.atomicWriteJson(...)`: atomic persisted write
        [`src/githubtemplatenodejs/config.js`]
        - `config.defaultConfig(...)`: schema-default payload builder
          [`src/githubtemplatenodejs/config.js`]
    - `config.loadStrict(...)`: strict validated loader
      [`src/githubtemplatenodejs/config.js`]
      - `config.readPayload(...)`
      - `config.validateConfig(...)`: full-schema validation
        [`src/githubtemplatenodejs/config.js`]
        - `describeType(...)`: JSON type diagnostic naming
          [`src/githubtemplatenodejs/config.js`]
        - `sortedDifference(...)`: sorted key-set mismatch fragments
          [`src/githubtemplatenodejs/config.js`]
    - `config.resolveSegments(...)`: canonical path resolution
      [`src/githubtemplatenodejs/config.js`]
      - `config.section(...)`: public schema section lookup (DES-058)
        [`src/githubtemplatenodejs/config.js`]
    - `config.getValue(...)`: value extraction by depth
      [`src/githubtemplatenodejs/config.js`]
  - `config.handleSet(...)`: `--set Path Value` typed parse + atomic
    persist [`src/githubtemplatenodejs/config.js`]
    - `config.operandValues(...)`
    - `config.ensureBootstrapped(...)`
    - `config.loadStrict(...)`
    - `config.setValue(...)`: pure mutation + full validation
      [`src/githubtemplatenodejs/config.js`]
      - `config.resolveSegments(...)`
      - `config.parseValue(...)`: Selection enum validation
        [`src/githubtemplatenodejs/config.js`]
      - `config.validateConfig(...)`
    - `config.atomicWriteJson(...)`
  - `config.handleUnset(...)`: `--unset Path` restore-to-default + atomic
    persist [`src/githubtemplatenodejs/config.js`]
    - `config.operandValues(...)`
    - `config.ensureBootstrapped(...)`
    - `config.loadStrict(...)`
    - `config.unsetValue(...)`: default restoration + full validation
      [`src/githubtemplatenodejs/config.js`]
      - `config.resolveSegments(...)`
      - `config.defaultConfig(...)`
      - `config.validateConfig(...)`
    - `config.atomicWriteJson(...)`
  - `config.handlePrintRaw(...)`: exact-bytes configuration passthrough
    [`src/githubtemplatenodejs/config.js`]
    - `config.operandValues(...)`
    - `config.ensureBootstrapped(...)`
  - `configRender.handlePrint(...)`: `--print [Path]` tree rendering
    [`src/githubtemplatenodejs/config_render.js`]
    - `config.operandValues(...)`
    - `config.ensureBootstrapped(...)`
    - `config.loadDisplay(...)`
    - `configRender.buildPrintRoot(...)`: virtual-root or subtree root
      [`src/githubtemplatenodejs/config_render.js`]
      - `config.resolveSegments(...)`, `config.section(...)`
      - `configRender.buildPrintSection(...)`: section node builder
        [`src/githubtemplatenodejs/config_render.js`]
        - `configRender.buildPrintParameter(...)`: parameter node with
          `Sel | Value` table
          [`src/githubtemplatenodejs/config_render.js`]
          - `configRender.selectionRows(...)`: `[*]`/`[ ]` rows
            [`src/githubtemplatenodejs/config_render.js`]
          - `configRender.formatTable(...)`: measured-width box-drawing
            table [`src/githubtemplatenodejs/config_render.js`]
            - `configRender.displayWidth(...)`: terminal cell width
              [`src/githubtemplatenodejs/config_render.js`]
              - `isCombiningCodePoint(...)`: zero-width classification
                [`src/githubtemplatenodejs/config_render.js`]
              - `isWideCodePoint(...)`: double-width classification
                [`src/githubtemplatenodejs/config_render.js`]
    - `configRender.renderTree(...)`: canonical prefix traversal
      [`src/githubtemplatenodejs/config_render.js`]
      - `emitNode(...)`: recursive edge/detail emitter
        [`src/githubtemplatenodejs/config_render.js`]
  - `configRender.handleInfo(...)`: `--info [Path]` schema documentation
    rendering [`src/githubtemplatenodejs/config_render.js`]
    - `config.operandValues(...)`, `config.ensureBootstrapped(...)`,
      `config.loadDisplay(...)`
    - `configRender.buildInfoRoot(...)`
      [`src/githubtemplatenodejs/config_render.js`]
      - `config.resolveSegments(...)`, `config.section(...)`
      - `configRender.buildInfoSection(...)`: section documentation node
        [`src/githubtemplatenodejs/config_render.js`]
        - `config.defaultConfig(...)`
        - `configRender.buildInfoParameter(...)`: parameter documentation
          node [`src/githubtemplatenodejs/config_render.js`]
          - `configRender.colorMeaning(...)`: palette-aware Meaning cell
            [`src/githubtemplatenodejs/config_render.js`]
          - `configRender.formatTable(...)`
    - `configRender.renderTree(...)`
      - `emitNode(...)`
  - fallback `management.printHelp(...)`: unknown input
- External Boundaries: `fs` cache/config reads and writes (including
  atomic rename + fsync), `https` transport to the npm registry and the
  GitHub API, `child_process.spawnSync` npm child processes (stdio
  inherited), stdout/stderr writes, `process.exit` status propagation,
  `os.homedir()` fallback for `$HOME`.

### PROC:npm-tool-manage

- Entrypoint(s): npm CLI argv values `UPGRADE_COMMAND`,
  `UPGRADE_FORCE_COMMAND`, `UPGRADE_DEVELOP_COMMAND`,
  `UPGRADE_DEVELOP_FORCE_COMMAND`, `UNINSTALL_COMMAND`.
- Lifecycle/trigger: starts when `PROC:main` calls `management.runCommand`
  on Linux for `--upgrade` (any variant) or `--uninstall`; blocks the
  parent synchronously via `spawnSync` with inherited stdio; exits with
  the npm status which the parent propagates. Never starts on non-Linux
  platforms (manual-command fallback instead).
- Internal Call-Trace Tree: none under `src/` (external tooling process).
- External Boundaries: npm registry access, global `node_modules`
  installation prefix, npm cache.

### PROC:build-tooling

- Entrypoint(s): bash interpreter executing `scripts/build.sh` top-level
  statements.
- Lifecycle/trigger: starts on user invocation of `scripts/build.sh`;
  resolves the repository root, validates `git`, `node`, and `npm`,
  delegates the pre-build cleanup to `scripts/clean.sh` (non-zero abort on
  cleanup failure), removes every stale first-level `dist/*.tar.gz` /
  `dist/*.tgz` artifact, creates `dist/`, runs `npm pack
  --pack-destination dist/` as a child, verifies at least one tarball was
  produced, prints the artifact summary, exits 0 (non-zero on any failed
  stage).
- Internal Call-Trace Tree: no internal functions under `src/` (linear
  top-level shell script; no function definitions).
- External Boundaries: `readlink -f`, `dirname`, `git rev-parse
  --show-toplevel`, `command -v`, `bash` child for cleanup, `find`,
  `mkdir`, `npm pack` child, `wc`, stderr diagnostics.

### PROC:clean-tooling

- Entrypoint(s): bash interpreter executing `scripts/clean.sh` top-level
  statements and the `remove_target(...)` shell function.
- Lifecycle/trigger: starts from `scripts/build.sh` delegation or user
  invocation; resolves the repository root, validates `git`, removes
  `.nyc_output/`, `coverage/`, `build/`, `.coverage` / `.coverage.*`
  files, and every `node_modules/` directory at any depth (pruned
  traversal, `dist/` excluded), logging every handled target; absent
  targets are successful no-ops (idempotent); exits 0, or non-zero on any
  removal failure.
- Internal Call-Trace Tree: no internal functions under `src/`.
- External Boundaries: `readlink -f`, `dirname`, `git rev-parse
  --show-toplevel`, `command -v`, `find` (pruned traversal),
  `mapfile`, `rm -rf`, stdout logging.

### PROC:npm-pack-build

- Entrypoint(s): npm CLI argv `pack --pack-destination <DIST_DIR>`.
- Lifecycle/trigger: starts when `PROC:build-tooling` runs the packaging
  step; reads `package.json` metadata and the declared files, writes the
  package tarball into `dist/`, exits with the npm status.
- Internal Call-Trace Tree: none under `src/` (external tooling process).
- External Boundaries: `package.json`/`package-lock.json` reads, tarball
  filesystem write, npm cache.

### PROC:release-check

- Entrypoint(s): bash interpreter executing `scripts/pre-release-check.sh`
  top-level statements; `run_check(...)`, `run_shell_syntax_checks(...)`,
  `run_javascript_syntax_checks(...)`, `cleanup_and_verify(...)`, and
  `on_exit(...)` shell functions.
- Lifecycle/trigger: starts on user invocation; resolves the repository
  root, validates `git`, `node`, and `npm`, allocates a run-scoped
  temporary work area, installs EXIT/INT/TERM/HUP traps, captures the
  `git status --porcelain --ignored` baseline, then executes the fail-fast
  phases: shell-script-syntax (`bash -n` per tracked script plus
  ShellCheck when installed), javascript-syntax-check (`node --check` per
  tracked JavaScript source/test), unit-test-suite (`npm test`),
  full-out-of-tree-build (`npm pack --pack-destination <TMP>`), and
  release-artifact-validation (Bash validator verifying readable package
  tarballs); the EXIT trap removes exactly the run-generated paths, warns
  non-zero when cleanup fails without masking the original outcome,
  verifies final repository state equals the baseline, prints the phase
  summary, and exits with the preserved status.
- Internal Call-Trace Tree: no internal functions under `src/` (shell
  functions of the script itself only, listed above).
- External Boundaries: `mktemp -d`, `git status/ls-files`, `bash -n`,
  ShellCheck (optional), `node --check` children, `npm test` child,
  `npm pack` child, `tar -tzf` (validator), `cmp`/`diff`, trap-based
  process termination handling.

### PROC:npm-check-runtime

- Entrypoint(s): npm/node CLI argv `node --check <file>`, `npm test`,
  `npm pack --pack-destination <TMP>`, and the Bash artifact validator
  script generated inside the temporary work area.
- Lifecycle/trigger: children started by `PROC:release-check` phases;
  each blocks the parent until completion; any non-zero child status
  aborts the parent at the failed phase via the `run_check` guard.
- Internal Call-Trace Tree: none under `src/` (external tooling
  processes; the validator script lives outside the repository tree).
- External Boundaries: tracked-file enumeration, npm test runner
  (Node.js test runner children), tarball write into the system temporary
  area, archive read access for validation.

### PROC:rename-tooling

- Entrypoint(s): bash interpreter executing `scripts/rename-me.sh`
  top-level statements; `usage(...)`, `require_value(...)`,
  `escape_pattern(...)`, `escape_replacement(...)`, `add_rule(...)`,
  `apply_publishname_prepass(...)`, `is_text_file(...)`,
  `find_template_files(...)`, `substitute_contents(...)`,
  `rename_paths(...)`, and `verify_residuals(...)` shell functions.
- Lifecycle/trigger: starts on parameterized invocation (five mandatory
  parameters, two optional defaulting to the template identity); parses
  and validates parameters before any mutation, builds the ordered
  substitution program (description, repository, program, shortname,
  author, owner; program before its substring shortname), applies the
  publish-action pre-pass over the release workflow, substitutes every
  pruned-tree text file in place, renames every file/directory carrying
  an active source string deepest-first, verifies no active source string
  survives in any processed content, filename, or path, and removes
  itself on full success; on any failure exits non-zero with a stderr
  diagnostic and keeps itself on disk.
- Internal Call-Trace Tree: no internal functions under `src/` (shell
  functions of the script itself only, listed above).
- External Boundaries: `mktemp -d`, `sed` in-place edits, `grep -I` text
  detection, `find` pruned inventories, `mv`/`rm` path operations, EXIT
  trap cleanup of the sed workspace.

## Communication Edges

| # | Direction | Mechanism | Endpoint/Channel | Payload/Data shape | Declaration file path(s) |
| --- | --- | --- | --- | --- | --- |
| 1 | `PROC:launcher` -> `PROC:main` | `exec` process replacement (skeleton entry) | OS process image; argv passthrough | CLI arguments (`$@`) forwarded unchanged | `scripts/templatenodejs.sh` -> `src/templatenodejs/main.js`, `src/templatenodejs/core.js`, `src/githubtemplatenodejs/core.js` |
| 2 | `PROC:main` -> `PROC:npm-tool-manage` | `child_process.spawnSync` child process, stdio inherited | OS process (npm CLI) | Exact argv arrays: `UPGRADE_COMMAND`, `UPGRADE_FORCE_COMMAND`, `UPGRADE_DEVELOP_COMMAND`, `UPGRADE_DEVELOP_FORCE_COMMAND`, `UNINSTALL_COMMAND`; exit status returned | `src/githubtemplatenodejs/management.js` (`runCommand`, `cmdUpgrade`, `cmdUninstall`) |
| 3 | `PROC:main` -> npm registry | HTTPS GET (`node:https`), 2-second timeout | `https://registry.npmjs.org/githubtemplatenodejs/latest` | JSON payload `{"name": ..., "version": "x.y.z", ...}` request: the version manifest of the latest published release with the latest version at the top-level `version` field; version string extracted | `src/githubtemplatenodejs/version_check.js` (`fetchJson`, `fetchLatestNpmVersion`, `NPM_JSON_ENDPOINT`) |
| 4 | `PROC:main` -> GitHub API | HTTPS GET (`node:https`) with `Accept: application/vnd.github+json` and the GitHub-mandatory `User-Agent` header, 2-second timeout | `https://api.github.com/repos/Ogekuri/GitHub-Template-NodeJS/releases/latest` | JSON payload `{"tag_name": "vx.y.z"}` request; `v`-stripped version extracted | `src/githubtemplatenodejs/version_check.js` (`fetchJson`, `fetchLatestGithubVersion`, `GITHUB_RELEASES_ENDPOINT`) |
| 5 | `PROC:main` -> filesystem cache | Read/write JSON file; missing parent directories created; best-effort write | `$HOME/.cache/githubtemplatenodejs/check_version_idle-time.json` | Four-field JSON object: `last_check_epoch`, `last_check_human`, `idle_time_epoch`, `idle_time_human` | `src/githubtemplatenodejs/version_check.js` (`cachePath`, `readCache`, `writeCache`) |
| 6 | `PROC:main` -> filesystem configuration | Read/parse JSON; atomic persist via same-directory temp file, fsync, rename, directory fsync | `$HOME/.config/githubtemplatenodejs/config.json` | Schema-shaped JSON object: section token -> parameter token -> Selection token | `src/githubtemplatenodejs/config.js` (`configPath`, `readPayload`, `atomicWriteJson`) |
| 7 | `PROC:main` -> terminal | stdout/stderr writes | Console streams | Help text, three-row version report, ANSI-colored notifications, configuration JSON/trees, `Error:` diagnostics | `src/githubtemplatenodejs/management.js`, `src/githubtemplatenodejs/version_check.js`, `src/githubtemplatenodejs/config.js`, `src/githubtemplatenodejs/config_render.js` |
| 8 | `PROC:build-tooling` -> `PROC:clean-tooling` | `bash` child invocation | OS process (bash) | Cleanup argv `bash <scripts-dir>/clean.sh`; exit status enforced | `scripts/build.sh` |
| 9 | `PROC:build-tooling` -> `PROC:npm-pack-build` | `npm pack` child invocation | OS process (npm CLI) | Argv `npm pack --pack-destination <DIST_DIR>`; tarball written to `dist/` | `scripts/build.sh` |
| 10 | `PROC:release-check` -> `PROC:npm-check-runtime` | `node --check`, `npm test`, `npm pack`, and validator `bash` child invocations, fail-fast guarded | OS processes (node/npm/bash) | Phase argv; child exit statuses gate the next phase | `scripts/pre-release-check.sh` (`run_check`, `run_javascript_syntax_checks`, phase invocations) |
| 11 | `PROC:main` -> skeleton bridge | CommonJS module resolution at delegation startup | In-process `require` edge | Dispatcher export `{ VERSION, main }` | `src/templatenodejs/main.js`, `src/templatenodejs/core.js` -> `src/githubtemplatenodejs/core.js` |
| 12 | `PROC:main` internal renderer -> schema API | CommonJS `require` of the config module (public `section()` API, DES-058) | In-process module boundary | `SectionSpec`/`ParamSpec` frozen descriptors | `src/githubtemplatenodejs/config_render.js` -> `src/githubtemplatenodejs/config.js` |
| 13 | `PROC:main` internal check -> color registry | CommonJS `require` of the colors module | In-process module boundary | `notificationColors()` ANSI SGR prefixes parsed from the embedded JSON | `src/githubtemplatenodejs/version_check.js`, `src/githubtemplatenodejs/config_render.js` -> `src/githubtemplatenodejs/colors.js` |
