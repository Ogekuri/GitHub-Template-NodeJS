# githubtemplatenodejs Requirements

## 1. Introduction

### 1.1 Document Rules
This document MUST follow these authoring rules (LLM-first, normative SRS):
- This document MUST be written and maintained in English.
- Use RFC 2119 keywords exclusively (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY). Do not use "shall".
- In requirements sections, every bullet MUST be a requirement and MUST start with a unique, stable Requirement ID (e.g., **REQ-001**).
- Requirement IDs MUST be stable: never renumber, reuse, or repurpose an ID. Only the dedicated reorganization workflow may renumber and it MUST emit an old→new ID mapping.
- Requirement ID prefixes MUST be consistent; the prefixes PRJ (project functions), CTN (project constraints), DES (design/implementation mandates), REQ (functional behaviors), and TST (verification requirements) are defined here before first use.
- Each requirement MUST be atomic, single-sentence, and testable; target <= 35 words per requirement; split any compound behavior into separate IDs.
- Write for other LLM Agents and automated parsers (high semantic density; no filler).
- On every change to this document:
  - Keep the first line as a level-1 title beginning with `# `.
  - Do NOT add YAML front matter or in-document revision history; use git history / CHANGELOG.md for change tracking.

### 1.2 Project Scope
Project `githubtemplatenodejs`: a Node.js CLI application published on npm (`https://www.npmjs.com/package/githubtemplatenodejs`) and distributed as a global npm tool via `npm install -g githubtemplatenodejs` or executed on-the-fly via `npx githubtemplatenodejs`; `git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git` remains the optional development source of the `--upgrade --develop` variant; the repository doubles as the GitHub template `Ogekuri/GitHub-Template-NodeJS` ("GitHub template for NodeJS app", author Francesco Rolando); `scripts/rename-me.sh` instantiates a copied template into a renamed project across file contents, filenames, and paths.

Interface: text-only CLI in English; no GUI functionality is requested. Functional areas: management commands (`--help`, `--ver`, `--version`, `--upgrade`, `--uninstall`, with the `--develop` source modifier of `--upgrade`) independent from core logic; automatic online new-version check against the npm registry throttled by an idle-time JSON cache; `--ver` dual-source report covering npm and GitHub; colored console notifications. Configurability: version-check parameters (endpoint, timeout, and idle-delays) remain hardcoded constants and stay unexposed (CTN-008); the automatic online check itself is switchable through the schema parameter `version_check:disable-version-check` (REQ-042..REQ-045); the cache location derives from the `$HOME` environment variable; notification colors are hardcoded in the embedded internal color JSON of the dedicated module `colors.js` (REQ-040); a JSON configuration CLI (`--get`, `--set`, `--unset`, `--print`, `--info`, `--print-raw`) persists schema state at `$HOME/.config/githubtemplatenodejs/config.json`. No application project-local configuration layer exists. Performance constraints: HTTPS timeout of 2 seconds; cache gating avoids redundant network calls.

Component model: the CLI entry `src/githubtemplatenodejs/main.js` dispatches to management commands and core logic; a dedicated version-check component performs the HTTPS queries (npm registry JSON API for the gated check and the report, GitHub releases API for the report), cache persistence, and notification rendering before argument parsing; `scripts/templatenodejs.sh` wraps local execution. Repository tooling: `scripts/build.sh` packages the release into `dist/`, `scripts/clean.sh` removes every repository-internal execution-generated artifact so consecutive builds start from the identical state, and `scripts/pre-release-check.sh` verifies release readiness; `scripts/rename-me.sh` performs the one-shot template instantiation rename. The tracked `.galias.conf` file configures the external galias CLI for this repository; its `ver_rules` drive the version-consistency command `g ver` over the tracked version-bearing files.

Keyword substitution mapping (skeleton initialization):

| Keyword | Resolved value |
| --- | --- |
| `%AUTHOR%` | Francesco Rolando |
| `%DESCRIPTION%` | GitHub template for NodeJS app |
| `%PROGRAM%` | githubtemplatenodejs |
| `%SHORTNAME%` | templatenodejs |
| `%SRCDIR%` | githubtemplatenodejs |
| `%OWNER%` | Ogekuri |
| `%REPOSITORY%` | GitHub-Template-NodeJS |

Rename-instantiation mapping (`scripts/rename-me.sh`; literal source strings; a source string is active when its target value differs from it):

| Parameter | Source string occurrence |
| --- | --- |
| `--description` (mandatory) | `GitHub template for NodeJS app` |
| `--program` (mandatory) | `githubtemplatenodejs` |
| `--shortname` (mandatory) | `templatenodejs` |
| `--repository` (mandatory) | `GitHub-Template-NodeJS` |
| `--publishname` (mandatory) | program name inside `.github/workflows/release-npm.yml` (A-15) |
| `--author` (optional) | `Francesco Rolando` |
| `--owner` (optional) | `Ogekuri` |

Assumptions (non-normative; reversible interpretations of unspecified details):
- **A-01**: The literal `(x.y.z)` in the help usage line is a runtime placeholder for the current installed version; all remaining help text is printed verbatim.
- **A-02**: The six configuration commands are documented in the help screen under a `Configuration Commands:` section; the former `Commands:` section ending with the literal `...` line is removed.
- **A-03**: Cache JSON key names are unspecified; the implementation MUST choose stable descriptive keys (e.g., `last_check_epoch`, `last_check_human`, `idle_time_epoch`, `idle_time_human`) and use them consistently.
- **A-04**: A successful check with no newer release prints no notification and refreshes the cache with the standard 3600-second idle-delay.
- **A-05**: On a failed check, the cache last-check timestamp records the failed attempt time and idle-time equals attempt time plus 86400 seconds.
- **A-06**: After the automatic version check, execution always continues with normal argument parsing, regardless of the check outcome.
- **A-07**: Version-check messages use English wording, preserving the user-request semantics "version available" versus "installed version".
- **A-08**: The HTTPS client uses the Node.js standard library (`https` module or global `fetch`); no third-party HTTP library is mandated.
- **A-09**: "Linux" detection MAY use `process.platform === "linux"` or equivalent; all other platforms take the manual-command branch.
- **A-10**: No unit tests were explicitly requested; Section 4 defines verification procedures for downstream development.
- **A-11**: The `bin` entry point name equals `%PROGRAM%` (`githubtemplatenodejs`).
- **A-12**: The renamed skeleton copy (`src/templatenodejs/`) and the distributed application sources (`src/githubtemplatenodejs/`) coexist as prescribed by the user request.
- **A-13**: The GitHub breaking change rolling the `ubuntu-latest` label to Ubuntu 26.04 (October 19 - November 19, 2026) is mitigated by pinning the release-workflow runner to the explicit `ubuntu-24.04` label (behavior-preserving mitigation) instead of adopting `ubuntu-26.04`.
- **A-14**: After `scripts/rename-me.sh` execution, `package-lock.json` may hold stale package names and hashes; refreshing it via `npm install` is a post-rename user step outside the script scope.
- **A-15**: The current `.github/workflows/release-npm.yml` contains no program-name occurrence; the `--publishname` substitution is defined as a pre-pass over that file and is a no-op until such an occurrence exists, while the npm package name in `package.json` remains driven by `program`.

## 2. Project Requirements

### 2.1 Project Functions
- **PRJ-001**: MUST provide the Node.js CLI application `githubtemplatenodejs`, published on npm, installable globally via `npm install -g` and executable on-the-fly via `npx`.
- **PRJ-002**: MUST support local execution of the CLI through the launcher script `scripts/templatenodejs.sh`.
- **PRJ-003**: MUST provide text-based management commands `--help`, `--ver`, `--version`, `--upgrade`, and `--uninstall`, implemented independently from the core application logic.
- **PRJ-004**: MUST provide an automatic online new-version check that runs before CLI argument parsing and is throttled by an idle-time cache.
- **PRJ-005**: MUST provide a text-only CLI interface in English; no GUI functionality is required.
- **PRJ-006**: MUST provide configuration CLI commands `--get`, `--set`, `--unset`, `--print`, `--info`, and `--print-raw`, implemented additively without altering existing commands.
- **PRJ-007**: MUST provide `scripts/build.sh`, an executable Bash script generating the complete distribution package with the project's native build tooling into `dist/`.
- **PRJ-008**: MUST provide `scripts/pre-release-check.sh`, an executable Bash script performing the full release-readiness verification and leaving no generated artifacts in the repository.
- **PRJ-009**: MUST provide `scripts/clean.sh`, an executable Bash script removing every repository-internal execution-generated temporary artifact while preserving tracked content and release artifacts.
- **PRJ-010**: MUST provide `scripts/rename-me.sh`, an executable Bash script renaming a template copy across file contents, filenames, and paths to the target project names.

### 2.2 Project Constraints
- **CTN-001**: MUST initialize the repository by extracting `../skell.tgz` into the working directory, overwriting existing files and preserving empty directories.
- **CTN-002**: MUST replace all seven keywords mapped in Section 1.2 with their resolved values in: `README.md`, `package.json`, `package-lock.json`, `src/skell/core.js`, `scripts/skell.sh`, `src/skell/main.js`.
- **CTN-003**: MUST rename `scripts/skell.sh` to `scripts/templatenodejs.sh` after keyword substitution.
- **CTN-004**: MUST rename the `src/skell` directory to `src/templatenodejs` after keyword substitution.
- **CTN-005**: MUST generate application source files under `src/githubtemplatenodejs` following the pre-imposed skeleton schema.
- **CTN-006**: MUST hardcode the version-check HTTPS timeout to 2 seconds.
- **CTN-007**: MUST hardcode the standard idle-delay to 3600 seconds and the failure backoff idle-delay to 86400 seconds.
- **CTN-008**: MUST NOT expose configuration surfaces (CLI options or files) altering endpoint, timeout, or idle-delay values; the cache directory MUST derive from `$HOME`.
- **CTN-009**: MUST execute `--upgrade` and `--uninstall` side effects only on Linux, delegating to the installed `npm` command-line tool.
- **CTN-010**: MUST NOT set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` or `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` in `.github/workflows/release-npm.yml`.
- **CTN-011**: MUST NOT execute destructive git commands (`git clean -fdx`, `git reset --hard`) inside `scripts/build.sh`, `scripts/clean.sh`, or `scripts/pre-release-check.sh`.
- **CTN-012**: MUST validate `node` availability in `scripts/templatenodejs.sh` before delegation and terminate non-zero with a diagnostic naming `node` when missing.
- **CTN-013**: MUST delegate from `scripts/templatenodejs.sh` through `node src/templatenodejs/main.js`, never modifying the tracked `package-lock.json`.
- **CTN-014**: MUST re-verify `scripts/rename-me.sh` at every source change, updating its substitution coverage when sources add or remove template-string occurrences, and MUST re-execute its test.

## 3. Requirements

### 3.1 Design and Implementation
- **DES-001**: MUST implement the application in Node.js with `package.json` packaging metadata compatible with `npm pack`, `npm install -g`, and `npx`.
- **DES-002**: MUST declare in `package.json` every file and directory required for `.github/workflows/release-npm.yml` to build a complete distributable package.
- **DES-003**: MUST expose exactly one `bin` entry point, named `githubtemplatenodejs`, invoking the CLI defined in `src/githubtemplatenodejs/main.js`.
- **DES-004**: MUST place application sources under `src/githubtemplatenodejs/` with the CLI entry in `main.js` and core logic in `core.js`, mirroring the skeleton layout.
- **DES-005**: MUST isolate management commands (`--help`, `--ver`, `--version`, `--upgrade`, `--uninstall`) from core logic in a dedicated module or clearly separated functions.
- **DES-006**: MUST isolate the online version check (HTTPS query, cache persistence, notification rendering) in a dedicated component invoked before argument parsing.
- **DES-007**: MUST store the cache file at `$HOME/.cache/githubtemplatenodejs/check_version_idle-time.json`, creating missing parent directories.
- **DES-008**: SHOULD render notifications with ANSI SGR colors: bright green for availability, bright red for errors.
- **DES-009**: SHOULD follow the proposed repository layout below (depth-limited; generated and virtual directories omitted).

```
.
├── .github/
│   └── workflows/
│       └── release-npm.yml
├── README.md
├── package.json
├── package-lock.json
├── scripts/
│   ├── build.sh
│   ├── clean.sh
│   ├── pre-release-check.sh
│   ├── rename-me.sh
│   └── templatenodejs.sh
├── src/
│   ├── githubtemplatenodejs/
│   │   ├── index.js
│   │   ├── main.js
│   │   ├── colors.js
│   │   ├── config.js
│   │   ├── config_render.js
│   │   ├── core.js
│   │   ├── management.js
│   │   └── version_check.js
│   └── templatenodejs/
│       ├── main.js
│       └── core.js
├── tests/
│   ├── githubtemplatenodejs.test.js
│   └── rename_me.test.js
└── usereq/
    └── docs/
        └── REQUIREMENTS.md
```

- **DES-010**: MUST define one canonical in-code configuration schema covering sections, parameters, types, constraints, defaults, and descriptions, driving validation, path resolution, display, and documentation output.
- **DES-011**: MUST isolate the configuration subsystem (schema, validation, atomic persistence, CLI handlers, renderer) in dedicated modules under `src/githubtemplatenodejs/`.
- **DES-012**: MUST render `--print` and `--info` through one shared data-driven renderer emitting UTF-8 box-drawing trees from typed configuration nodes.
- **DES-013**: MUST produce every table through one measured-width formatter rendering rectangular box-drawing rows anchored to the owning parameter detail prefix.
- **DES-014**: MUST persist `--set` and `--unset` updates atomically via a same-directory temporary file, fsync, atomic replace, and prior-file preservation on any failure.
- **DES-015**: MUST pin every JavaScript action referenced by `.github/workflows/release-npm.yml` to a major version whose declared runtime is Node24 or later.
- **DES-016**: MUST name the release workflow file `release-npm.yml`, matching the pending npm trusted publisher (package `githubtemplatenodejs`, repository `Ogekuri/GitHub-Template-NodeJS`, workflow `release-npm.yml`).
- **DES-017**: MUST publish the `dist/` package tarball present at the triggered tag commit to npm via OIDC Trusted Publishing through `npm publish` granted `id-token: write`, only when the tag belongs to `master`.
- **DES-018**: MUST execute the GitHub release and npm publish jobs for every canonical version tag on any branch, gating only the npm publish job on the `master` branch check.
- **DES-019**: MUST keep `README.md` documenting npm installation as the primary method, an npx alternative-installation section, and a dedicated non-primary section for installation from GitHub with the `--develop` upgrade.
- **DES-020**: MUST implement `scripts/build.sh` in Bash, resolving the repository root independently of the invocation directory and handling paths containing spaces.
- **DES-021**: MUST validate required build tooling (`git`, `node`, `npm`) before building and terminate non-zero when any required tool is missing.
- **DES-022**: MUST build the package tarball by executing `npm pack --pack-destination dist/` from the repository root.
- **DES-023**: MUST remove from `dist/` every previously generated distribution artifact matching `*.tgz` or `*.tar.gz` at any version before building, preserving every other file.
- **DES-024**: MUST terminate non-zero with a diagnostic when the build fails or when `dist/` lacks at least one package tarball.
- **DES-025**: MUST print a final summary listing every produced artifact found in `dist/`.
- **DES-026**: MUST implement `scripts/pre-release-check.sh` in Bash, resolving the repository root independently of the invocation directory and handling paths containing spaces.
- **DES-027**: MUST execute checks fail-fast, terminating non-zero on the first failed mandatory check with a diagnostic naming the failed check.
- **DES-028**: MUST validate the mandatory toolchain (`git`, `node`, `npm`) and treat any missing tool as a failed check.
- **DES-029**: MUST validate tracked shell scripts with `bash -n` and run ShellCheck on them when ShellCheck is installed.
- **DES-030**: MUST syntax-check all tracked JavaScript sources and test files with `node --check` and treat any syntax error as a failed check.
- **DES-031**: MUST execute the complete Node.js test suite via `npm test` and treat any test failure as a failed check.
- **DES-032**: MUST perform the complete build into a temporary output directory outside the repository, generating no build artifacts inside the repository tree.
- **DES-033**: MUST verify the built release artifacts exist and are structurally valid (readable package tarball archive) and treat any invalid artifact as a failed check.
- **DES-034**: MUST remove, on success and on failure, every artifact, cache, and temporary file generated by the execution, using trap-based exit and signal handling.
- **DES-035**: MUST terminate non-zero when final cleanup fails, even when all checks passed, and MUST NOT mask the original check outcome.
- **DES-036**: MUST restrict cleanup to paths generated by the execution and MUST NOT delete user files, tracked content, or pre-existing modifications.
- **DES-037**: MUST verify repository integrity at completion by comparing `git status --porcelain --ignored` output with the pre-execution baseline.
- **DES-038**: MUST print readable per-phase logs and a final summary reporting the overall outcome and the failed phase on any failure.
- **DES-040**: MUST preserve the `.gitignore` inverse exclude-then-include strategy and make `dist/` traversable so versionable files under it can be selectively re-included.
- **DES-041**: MUST pin the `runs-on` label of every job in `.github/workflows/release-npm.yml` to the explicit label `ubuntu-24.04` and MUST NOT use the `ubuntu-latest` label.
- **DES-042**: MUST source every release-workflow artifact exclusively from the `dist/` files present at the tagged release commit, obtained by checking out that commit.
- **DES-043**: MUST NOT execute `scripts/build.sh`, `scripts/pre-release-check.sh`, or any build or build-preparatory step in the release workflow.
- **DES-044**: MUST implement `scripts/clean.sh` in Bash, resolving the repository root independently of the invocation directory and handling paths containing spaces.
- **DES-045**: MUST validate the required clean tooling (`git`) before removing and terminate non-zero naming any missing tool.
- **DES-046**: MUST remove every `node_modules/` directory at any depth under the repository root.
- **DES-047**: MUST remove the `.nyc_output/`, `coverage/`, and `build/` directories whenever present under the repository root.
- **DES-048**: MUST remove the coverage data files `.coverage` and `.coverage.*` whenever present under the repository root.
- **DES-049**: MUST treat every absent cleanup target as a successful no-op, terminate non-zero on any removal failure, and log each handled target with a final summary.
- **DES-050**: MUST restrict `scripts/clean.sh` removals to the enumerated generated paths and MUST NOT delete tracked files, untracked user files, `dist/` release artifacts, or `$HOME` application data.
- **DES-051**: MUST execute `scripts/clean.sh` from `scripts/build.sh` after toolchain validation and before every build action, terminating non-zero when the cleanup fails.
- **DES-052**: MUST guarantee that two consecutive `scripts/build.sh` executions perform the build from the identical generated-path startup state.
- **DES-053**: MUST draw every `--print` and `--info` table using exclusively the characters `─`, `│`, `╭`, `╮`, `╰`, `╯`, `├`, `┤`, `┬`, `┴`, `┼`, `═`, `╞`, `╪`, `╡`.
- **DES-054**: MUST render table outer borders with rounded corners: `╭`/`╮` on the top border, `╰`/`╯` on the bottom border, `┬`/`┴` column junctions.
- **DES-055**: MUST separate each table header row from the content rows with the double-line border built from `╞`, `═`, `╪`, `╡`.
- **DES-056**: MUST separate consecutive table content rows with the single-line border built from `├`, `─`, `┼`, `┤`.
- **DES-057**: MUST declare an `engines.node` semver range in `package.json` pinning the minimum supported Node.js runtime.
- **DES-058**: MUST expose schema section lookup through a public `config` API consumed by `config_render`, without accessing module-private schema indices.
- **DES-059**: MUST keep every README.md executed-command row byte-identical to the exact argv mandated by REQ-003, REQ-032, REQ-035, and REQ-036.
- **DES-060**: MUST keep README.md configuration and color documentation consistent with the canonical schema (REQ-042) and the hardcoded color policy (REQ-040, CTN-008).
- **DES-061**: MUST implement `scripts/rename-me.sh` in Bash resolving the template root from the script location, independent of the invocation directory and handling paths containing spaces.
- **DES-062**: MUST accept mandatory parameters `--description`, `--program`, `--shortname`, `--repository`, and `--publishname`, terminating non-zero with a usage diagnostic when any is missing, empty, or newline-bearing.
- **DES-063**: MUST accept optional `--author` and `--owner` whose omission preserves the `Francesco Rolando` and `Ogekuri` source strings.
- **DES-064**: MUST replace every active source-string occurrence inside all template text file contents, excluding the script itself, `.git`, `temp/`, and generated directories.
- **DES-065**: MUST order substitutions so `githubtemplatenodejs` is replaced before its substring `templatenodejs`.
- **DES-066**: MUST rename every file and directory whose name contains an active source string, applying the same mapping deepest-first.
- **DES-067**: MUST substitute program-name occurrences inside `.github/workflows/release-npm.yml` with `publishname` before the global `program` substitution (A-15).
- **DES-068**: MUST terminate non-zero with a diagnostic when any substitution, rename, or residual verification step fails.
- **DES-069**: MUST verify after renaming that no active source string remains in any processed content, filename, or path, and MUST remove `scripts/rename-me.sh` only after full success.
- **DES-070**: MUST maintain `.galias.conf` as the tracked galias project configuration declaring the `master`, `develop`, and `work` branches, `build_script` `scripts/build.sh`, and `pre_release_check` `scripts/pre-release-check.sh`.
- **DES-071**: MUST keep `.galias.conf` `ver_rules` matching only the tracked version-bearing files `README.md`, `scripts/**/*.sh`, `package.json`, and `package-lock.json` through semver-capturing regular expressions.
- **DES-072**: MUST keep every version occurrence captured by `.galias.conf` `ver_rules` equal to the `package.json` `version` field, the single canonical project version.

### 3.2 Functions
- **REQ-001**: MUST print the verbatim English help screen (template below) when invoked with `--help` or with no arguments.

```
Usage: githubtemplatenodejs [command] [options] (x.y.z)

Management Commands:
  --upgrade   - Reinstall githubtemplatenodejs on Linux; print manual command elsewhere.
  --uninstall - Uninstall githubtemplatenodejs on Linux; print manual command elsewhere.
  --ver       - Print the githubtemplatenodejs version.
  --version   - Print the githubtemplatenodejs version.
  --help      - Print the full help screen.

Configuration Commands:
  --get       - Print the value at Path as one JSON document.
  --set       - Parse Value into the schema type and persist it at Path.
  --unset     - Restore Path to its schema default and persist atomically.
  --print     - Print current values as a box-drawing tree, whole schema or at Path.
  --info      - Print parameter documentation with defaults, constraints, and examples.
  --print-raw - Print the exact bytes of the configuration JSON file.

Options:
  --develop   - With --upgrade: install from the GitHub development source.
  --force     - With --upgrade: force full re-download and reinstallation.
```

- **REQ-002**: MUST print for `--ver` and `--version` the three-row version report with aligned version columns, bypassing the idle-time gate and cache file.
- **REQ-003**: MUST execute `npm install -g githubtemplatenodejs@latest` when `--upgrade` runs on Linux without `--force`, upgrading the installed package from the npm registry.
- **REQ-004**: MUST NOT execute any upgrade command on non-Linux operating systems; MUST print a warning and the manual command of REQ-003 or REQ-035 matching the requested variant instead.
- **REQ-005**: MUST execute `npm uninstall -g githubtemplatenodejs` when `--uninstall` runs on Linux.
- **REQ-006**: MUST NOT execute any uninstall command on non-Linux operating systems; MUST print a warning and the manual command of REQ-005 instead.
- **REQ-007**: MUST run the automatic version check before argument parsing on every invocation, subject to REQ-008 gating and REQ-043 suppression; `--ver` and `--version` bypass the gate.
- **REQ-008**: MUST perform the HTTPS request only when the cache file is absent or the current epoch is greater than or equal to the cached idle-time; otherwise skip the check.
- **REQ-009**: MUST query `https://registry.npmjs.org/githubtemplatenodejs/latest` with a 2-second timeout whenever the check executes.
- **REQ-010**: MUST persist, after every executed check, a cache JSON containing four fields: last-check epoch, last-check human-readable, idle-time epoch, idle-time human-readable.
- **REQ-011**: MUST compute the idle-time epoch as the last-check epoch plus the applicable idle-delay: 3600 seconds on success, 86400 seconds on failure.
- **REQ-012**: MUST print a bright green message comparing the available npm registry version with the installed version when a newer npm registry version is found.
- **REQ-013**: MUST refresh the cache with the standard 3600-second idle-delay after every successful HTTPS check, regardless of comparison outcome (A-04).
- **REQ-014**: MUST print a bright red message reporting the encountered error for any failed HTTPS check (HTTP 429, 503, timeout, or network error).
- **REQ-015**: MUST write the cache with an idle-delay of 86400 seconds after any failed HTTPS check (A-05).
- **REQ-016**: MUST provide `--get Path` printing the resolved value as one valid JSON document on stdout without decoration, labels, or confirmations.
- **REQ-017**: MUST provide `--set Path Value` parsing Value into the schema type and persisting the fully validated configuration atomically.
- **REQ-018**: MUST provide `--unset Path` restoring the targeted parameter or section to its schema default and persisting atomically.
- **REQ-019**: MUST provide `--print [Path]` rendering current values as a box-drawing tree whose section headings carry `[Path: <canonical path>]`.
- **REQ-020**: MUST provide `--info [Path]` rendering per-parameter type, constraints, description, default, and complete shell-valid `--set` and `--unset` command examples.
- **REQ-021**: MUST provide `--print-raw` writing the exact bytes of the global configuration JSON file to stdout without reformatting or added text.
- **REQ-022**: MUST resolve configuration paths as case-sensitive, colon-separated canonical tokens and reject unknown or misplaced tokens with a stderr diagnostic.
- **REQ-023**: MUST exit 1 with a clear stderr diagnostic on any configuration CLI failure, emit valid output on stdout only, and print nothing on failure.
- **REQ-026**: MUST color version-check notifications with the ANSI prefixes from the embedded internal color JSON of the dedicated module `colors.js`.
- **REQ-027**: MUST format each `--ver` report row as `<label padded to 17 characters> : <version>`, rendering the labels `Current Installed`, `Latest @ npm`, and `Latest @ GitHub` with aligned version numbers.
- **REQ-028**: MUST fill the `Latest @ npm` report row with the latest version from `https://registry.npmjs.org/githubtemplatenodejs/latest`.
- **REQ-029**: MUST fill the `Latest @ GitHub` report row with the latest release tag from `https://api.github.com/repos/Ogekuri/GitHub-Template-NodeJS/releases/latest`, stripped of its `v` prefix.
- **REQ-030**: MUST print `unknown (<reason>)` in place of the version for a failed report source, `<reason>` naming the encountered error, plus a bright red note naming that source.
- **REQ-031**: MUST update the version-check cache from the report npm outcome only: 3600-second idle-delay on success, 86400-second idle-delay on failure.
- **REQ-032**: MUST execute `npm install -g git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git` when `--upgrade --develop` runs on Linux without `--force`.
- **REQ-033**: MUST NOT execute any develop-upgrade command on non-Linux operating systems; MUST print a warning and the manual command of REQ-032 or REQ-036 matching the requested variant instead.
- **REQ-034**: MUST interpret `--develop` exclusively as a source modifier of `--upgrade`, leaving every other argument combination to the existing dispatch behavior.
- **REQ-035**: MUST execute `npm install -g githubtemplatenodejs@latest --force` when `--upgrade --force` runs on Linux, forcing full re-download and reinstallation from the npm registry.
- **REQ-036**: MUST execute `npm install -g git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git --force` when `--upgrade --develop --force` runs on Linux.
- **REQ-037**: MUST apply the forcing option `--force` only to the `--force` variants of `--upgrade`; non-forced variants MUST execute their upgrading argv without `--force`.
- **REQ-038**: MUST interpret `--force` exclusively as an auxiliary modifier of `--upgrade`, leaving every other argument combination to the existing dispatch behavior.
- **REQ-039**: MUST list every implemented command flag in the `--help` screen under Management Commands or Configuration Commands, each with a one-line English description.
- **REQ-040**: MUST hold every notification color name and its ANSI SGR prefix in one embedded JSON document inside the dedicated module `src/githubtemplatenodejs/colors.js`.
- **REQ-041**: MUST assign the embedded JSON new-version color `bright_green` and error color `bright_red`, exposing both ANSI prefixes via the exported `notificationColors` object of `colors.js`.
- **REQ-042**: MUST define the canonical schema parameter `version_check:disable-version-check` as a Selection parameter with allowed values `no` and `yes` and schema default `no`.
- **REQ-043**: MUST skip the automatic version check entirely, executing no HTTPS request and no cache write, when `disable-version-check` is set to `yes`.
- **REQ-044**: MUST treat an absent, unreadable, malformed, or non-object configuration file as `disable-version-check` unset, keeping the REQ-007 check enabled.
- **REQ-045**: MUST keep the `--ver` and `--version` report active with its REQ-002 fetches and REQ-031 cache update regardless of the `disable-version-check` value.
- **REQ-046**: MUST treat version-check cache persistence as best effort: a failing cache write MUST NOT raise, print, or alter exit status and argument dispatch (refines REQ-010, A-06).
- **REQ-047**: MUST compare versions by tolerant tuple parsing: every dot-separated component contributes its leading integer digits; missing or non-numeric prefixes evaluate as zero.

## 4. Test Requirements
- **TST-001**: MUST verify REQ-001 and REQ-039 by running the CLI with no arguments and with `--help`; pass iff stdout equals the 3.2 template with `(x.y.z)` replaced by the current version.
- **TST-002**: MUST verify REQ-002 by invoking `--ver` and asserting the three-row aligned report prints and the fetches execute even with an unexpired cache file.
- **TST-003**: MUST verify REQ-003, REQ-005, REQ-032, REQ-035, and REQ-036 on Linux (or a mocked platform) by asserting the exact npm registry, forced npm registry, develop, forced develop, and uninstall `npm` command strings execute.
- **TST-004**: MUST verify REQ-004, REQ-006, and REQ-033 by simulating a non-Linux platform and asserting no `npm` subprocess spawns while the warnings and manual commands print.
- **TST-005**: MUST verify REQ-007, REQ-008, and REQ-009 with a mocked npm registry endpoint: absent cache triggers one request; unexpired cache triggers none; timeout equals 2 seconds.
- **TST-006**: MUST verify REQ-010, REQ-011, REQ-012, and REQ-013 by mocking a newer-release response; pass iff bright green output prints and the cache holds four fields with idle-time equal to check time plus 3600.
- **TST-007**: MUST verify REQ-014 and REQ-015 by mocking an HTTP 503 response; pass iff a bright red error message prints and cache idle-time equals attempt time plus 86400.
- **TST-008**: MUST verify `--print` and `--info` against complete golden outputs of the schema-shaped tree: the `Application_Configuration` root with every schema section and stale-schema tolerance.
- **TST-009**: MUST verify tree structural invariants and table alignment: real-node edges match schema topology and every detail line carries its owner prefix.
- **TST-010**: MUST verify the configuration CLI with isolated `$HOME` by asserting unknown paths are rejected with exit 1 and a stderr diagnostic, canonical `version_check` paths round-trip through `--get`, `--set`, and `--unset`, and `--print`, `--info`, and `--print-raw` emit schema-consistent outputs.
- **TST-011**: MUST verify REQ-026 and REQ-041 by asserting the version-check notifications render with the hardcoded bright green and bright red ANSI prefixes from the embedded color JSON.
- **TST-012**: MUST verify DES-015 and CTN-010 by parsing `.github/workflows/release-npm.yml` and asserting every `uses:` pin meets the Node24-or-later runtime constraint with no fallback variable present.
- **TST-013**: MUST verify REQ-027 through REQ-031 with mocked npm registry and GitHub payloads: exact aligned rows, `unknown (<reason>)` rows plus red notes on failures, and cache deltas driven only by the npm outcome.
- **TST-014**: MUST verify REQ-032, REQ-033, REQ-034, REQ-036, and REQ-038 by asserting the exact develop argv variants on Linux, the warning and matching manual command on non-Linux, and no upgrade dispatch for `--develop` or `--force` alone.
- **TST-015**: MUST verify DES-016, DES-017, and DES-018 by parsing `.github/workflows/release-npm.yml` and asserting the OIDC publish job with `id-token: write` runs only for `master` tags while the release job runs for every tag.
- **TST-016**: MUST verify DES-021, DES-022, DES-023, DES-024, DES-025, and DES-052 by executing `./scripts/build.sh` twice; pass iff both runs exit 0, both start from the identical cleaned startup state, `dist/` holds exactly one package tarball, and stale artifacts do not accumulate.
- **TST-017**: MUST verify DES-026 through DES-038 by executing `./scripts/pre-release-check.sh`; pass iff exit code is 0 and `git status --porcelain --ignored` equals the pre-execution baseline.
- **TST-018**: MUST verify DES-027, DES-034, and DES-035 in an isolated repository copy with an injected failing tool; pass iff exit code is non-zero, the diagnostic names the failed phase, and no generated artifacts remain.
- **TST-019**: MUST verify DES-040 with `git check-ignore -v --no-index`; pass iff `dist/` stays traversable so any versionable file under it can be selectively re-included through the `!dist/` and `!dist/**/*` rules.
- **TST-020**: MUST verify DES-041 by parsing `.github/workflows/release-npm.yml` and asserting every `runs-on` value equals `ubuntu-24.04` and no `ubuntu-latest` label remains.
- **TST-021**: MUST verify DES-042 and DES-043 by parsing `.github/workflows/release-npm.yml`; pass iff the release and publish jobs check out the tag and consume the `dist/` artifacts present at the tagged commit, and no build, `scripts/build.sh`, `scripts/pre-release-check.sh`, or build-preparatory step executes.
- **TST-022**: MUST verify DES-044 through DES-050 by executing `scripts/clean.sh` twice in a sandbox repository seeded with generated paths, a tracked file, an untracked user file, and `dist/` content; pass iff the first run removes every generated path, the preserved content survives both runs, and the second run exits 0 as a removal-free no-op.
- **TST-023**: MUST verify DES-051 and CTN-011 by parsing `scripts/build.sh`, `scripts/clean.sh`, and `scripts/pre-release-check.sh`; pass iff the pre-build cleanup delegates to `scripts/clean.sh` before the `dist/` stale-artifact removal and no destructive git command appears in any of the three scripts.
- **TST-024**: MUST verify DES-053, DES-054, DES-055, and DES-056 by asserting every `--print` and `--info` table line uses only the mandated glyphs with rounded corners, the double-line header separator, and single-line row separators.
- **TST-025**: MUST verify REQ-042, REQ-043, and REQ-044 in an isolated `$HOME` by asserting the gated check performs no outbound HTTPS request and no cache write when `disable-version-check` is `yes`, and executes when the parameter holds the default or the configuration file is absent or malformed.
- **TST-026**: MUST verify REQ-045 by asserting `--ver` fetches the npm registry and GitHub and refreshes the cache even when `disable-version-check` is `yes`.
- **TST-027**: MUST verify REQ-046 with an unwritable cache directory in an isolated `$HOME`: the CLI still dispatches, exits 0, and prints no traceback.
- **TST-028**: MUST verify REQ-047 with a mocked npm version carrying a non-integer suffix (e.g. `9.9.9rc1`): no error note prints and comparison uses leading integers.
- **TST-029**: MUST verify CTN-012 and CTN-013 against `scripts/templatenodejs.sh`: a `node`-less PATH exits non-zero with a diagnostic and the delegation argv invokes `src/templatenodejs/main.js`.
- **TST-030**: MUST verify DES-057 by parsing `package.json`: `engines.node` declares a semver range pinning the minimum Node.js runtime.
- **TST-031**: MUST verify DES-003 by parsing `package.json`: `bin` declares exactly the `githubtemplatenodejs` entry point.
- **TST-032**: MUST verify DES-059 and DES-060 by parsing `README.md`: upgrade rows match the mandated argv and no schema-empty or configurable-color claims remain.
- **TST-033**: MUST verify `scripts/rename-me.sh` by copying the template working tree into `temp/`, executing the copied script with all seven parameters, and asserting exit status 0.
- **TST-034**: MUST pass TST-033 iff no source string remains in any copied text-file content, filename, or path (binary archives excluded from content scanning).
- **TST-035**: MUST verify DES-071 and DES-072 by parsing `.galias.conf`, applying every `ver_rules` pattern to the tracked files, and asserting each captured version equals the `package.json` version.
