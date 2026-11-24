> [!CAUTION]
> **STRICTLY EXPERIMENTAL**: this project is a proof-of-concept template under
> active development. Interfaces, commands, packaging metadata, and release
> channels may change at any time without notice. Do not rely on it for
> production workloads.

# githubtemplatenodejs / templatenodejs (0.0.1)

<p align="center">
  <img src="https://img.shields.io/badge/node-24%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="NodeJS 24+">
  <img src="https://img.shields.io/badge/license-GPL--3.0-491?style=flat-square" alt="License: GPL-3.0">
  <img src="https://img.shields.io/badge/platform-Linux-6A7EC2?style=flat-square&logo=terminal&logoColor=white" alt="Platforms">
  <img src="https://img.shields.io/badge/docs-live-b31b1b" alt="Docs">
  <img src="https://img.shields.io/badge/npm-CB3837?style=flat-square&logo=npm&logoColor=white" alt="npm">
</p>
<p align="center">
<strong>GitHub template for NodeJS apps published on npm.</strong><br>
A Node.js CLI application shipped as an npm-installable global tool with
npm OIDC Trusted Publishing release automation. It provides management
commands for upgrade, uninstall, and version reporting; an automatic
new-version check throttled by an idle-time cache; self-upgrade from npm or
from the latest GitHub tag via <code>--develop</code>; a dual-source version
report (installed / npm / GitHub); and a JSON configuration CLI
(<code>version_check:disable-version-check</code>) with schema validation
and atomic persistence.
</p>

<p align="center">
  <a href="#feature-highlights">Feature Highlights</a> |
  <a href="#quick-start">Quick Start</a> |
  <a href="#requirements">Requirements</a> |
  <a href="#users-guide">User's Guide</a> |
  <a href="#acknowledgments">Acknowledgments</a>
</p>

<p align="center">
🚧 <strong>STAGE:</strong> PRE-ALPHA 📝 - Proof-of-Concept 🏗️ 🚧<br>
⚠️ <strong>IMPORTANT NOTICE</strong>: Created with <a href="https://github.com/Ogekuri/PI-useReq"><strong>PI-useReq/pi-usereq</strong></a> 🤖✨ ⚠️
</p>

# Feature Highlights

- **Published on npm**: install with `npm install -g githubtemplatenodejs`, or run on-the-fly with `npx githubtemplatenodejs`.
- **Dual-source version report** (`--ver` / `--version`): installed, latest npm, and latest GitHub versions in aligned columns.
- **Automatic new-version check** before every run, throttled by an idle-time cache so no redundant network calls are made.
- **Self-upgrade** from npm (`--upgrade`), forced full re-download (`--force`), or the latest GitHub tagged release (`--develop`).
- **One-command removal** (`--uninstall`) — on non-Linux systems the exact manual command is printed instead.
- **Colored console notifications** (bright green for availability, bright red for errors), hardcoded in the embedded internal color JSON of `src/githubtemplatenodejs/colors.js`.
- **Configuration CLI** (`--get`, `--set`, `--unset`, `--print`, `--info`, `--print-raw`) with schema validation and atomic persistence.
- **Release automation**: a GitHub release for every version tag and OIDC Trusted Publishing to npm for `master` tags.

# Quick Start

1. **Install** the tool from npm:

   ```bash
   npm install -g githubtemplatenodejs
   ```

2. **Configure** — optional: the application works out of the box with
   sensible defaults (bright green availability notes, bright red error
   notes). Customization is described in the [User's Guide](#users-guide).

3. **Execute**:

   ```bash
   githubtemplatenodejs --help
   githubtemplatenodejs --ver
   ```

# Requirements

- **Node.js >= 24**.
- **`git`** — required only to install the development source with `--develop`.
- **Network access** — outbound HTTPS to `registry.npmjs.org` (version check, upgrades) and `api.github.com` (latest-release query for the `--ver` report and `--develop` channel).
- **Linux** — required for the `--upgrade` and `--uninstall` side effects; on any other platform the tool prints a warning and the exact manual command.
- **ANSI-capable terminal** — required for colored notifications.

# User's Guide

## Install from npm (primary method)

```bash
npm install -g githubtemplatenodejs
```

Upgrade and uninstall:

```bash
githubtemplatenodejs --upgrade
npm uninstall -g githubtemplatenodejs
```

## Live execution with npx (alternative method)

Run directly from npm without a prior installation:

```bash
npx githubtemplatenodejs
npx githubtemplatenodejs --ver
```

## Install and upgrade from GitHub (non-primary development channel)

A dedicated, non-primary distribution channel hosts intermediate and test
releases on GitHub: `https://github.com/Ogekuri/GitHub-Template-NodeJS`.

```bash
# Install from the GitHub repository
npm install -g githubtemplatenodejs --force --from git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git

# Upgrade to the latest GitHub tagged release (tagged on any branch)
githubtemplatenodejs --upgrade --develop

# Forced full re-download and reinstallation variants
githubtemplatenodejs --upgrade --force
githubtemplatenodejs --upgrade --develop --force
```

`--upgrade --develop` always downloads the most recent tagged build from
GitHub, regardless of the branch it was tagged on. The `--ver` report shows
that channel in the `Latest @ GitHub` row.

## Run locally from the repository

```bash
./scripts/templatenodejs.sh --help
```

The launcher resolves the repository root and delegates to
`node src/templatenodejs/main.js`.

## Command reference

The full help screen (printed by `--help` or by running the tool with no
arguments):

```text
Usage: githubtemplatenodejs [command] [options] (0.0.1)

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

### Version report (`--ver` / `--version`)

Prints the three-row report with aligned version columns and always refreshes
the source queries, bypassing the idle-time gate:

```text
Current Installed : X1.Y1.Z1
Latest @ npm      : X2.Y2.Z2
Latest @ GitHub   : X3.Y3.Z3
```

A failed source prints `unknown (<reason>)` in place of the version, with a
bright red note naming that source. The GitHub row strips the `v` prefix from
the latest release tag.

### `--upgrade` variants (Linux)

| Command | Executed command |
| --- | --- |
| `--upgrade` | `npm install -g githubtemplatenodejs@latest` |
| `--upgrade --force` | `npm install -g githubtemplatenodejs@latest --force` |
| `--upgrade --develop` | `npm install -g git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git` |
| `--upgrade --develop --force` | `npm install -g git+https://github.com/Ogekuri/GitHub-Template-NodeJS.git --force` |

On non-Linux operating systems nothing is executed: the tool prints a warning
and the matching manual command from the table. `--develop` and `--force` are
accepted exclusively as `--upgrade` modifiers; any other combination falls
back to the normal dispatch behavior.

### `--uninstall` (Linux)

```bash
githubtemplatenodejs --uninstall
```

Executes `npm uninstall -g githubtemplatenodejs` on Linux; on any other
platform it prints a warning and the manual command
`npm uninstall -g githubtemplatenodejs`.

## Configuration

### Configuration file

The global configuration lives at
`$HOME/.config/githubtemplatenodejs/config.json`. It is created with the
schema defaults on the first configuration command and every update is
validated against the schema and persisted atomically (the previous file is
preserved if any step fails).

### Configuration commands

Configuration paths are case-sensitive, colon-separated canonical tokens
(`Section`, `Section:Parameter`); the schema defines the `version_check`
section holding the `disable-version-check` Selection parameter.

| Command | Behavior |
| --- | --- |
| `--get <Path>` | Prints the resolved value as one valid JSON document on stdout. |
| `--set <Path> <Value>` | Parses `Value` into the schema type, validates, and persists atomically. |
| `--unset <Path>` | Restores the targeted parameter or section to its schema default. |
| `--print [Path]` | Renders current values as a box-drawing tree with `[Path: <canonical path>]` section headings. |
| `--info [Path]` | Renders per-parameter type, constraints, description, default, and shell-valid `--set` / `--unset` examples. |
| `--print-raw` | Writes the exact bytes of the configuration JSON file to stdout. |

Examples:

```bash
githubtemplatenodejs --print
githubtemplatenodejs --info
githubtemplatenodejs --print-raw

# Read, change, and restore the automatic version-check switch.
githubtemplatenodejs --get version_check:disable-version-check
githubtemplatenodejs --set version_check:disable-version-check yes
githubtemplatenodejs --unset version_check:disable-version-check
```

On any configuration failure the tool exits with code `1`, prints a
diagnostic on stderr, and emits nothing on stdout.

### Notification colors (hardcoded)

Notification colors are not configurable. All colors live in one embedded
internal JSON document (`COLOR_CONFIG_JSON`) inside
`src/githubtemplatenodejs/colors.js`:

- `notifications` assigns the new-version color `bright_green` (ANSI SGR 92)
  and the error color `bright_red` (ANSI SGR 91).
- `palette` maps every color token to its ANSI SGR prefix: `bright_green`
  (92), `bright_red` (91), `bright_yellow` (93), `bright_blue` (94),
  `bright_magenta` (95), `bright_cyan` (96), `bright_white` (97).

Both colors drive the automatic version-check notifications; no CLI option,
file, or environment variable can alter them.

# Documentation

## Automatic version check

On every invocation the tool runs an online new-version check **before**
argument parsing. The check is throttled by an idle-time cache:

- Cache file: `$HOME/.cache/githubtemplatenodejs/check_version_idle-time.json`.
- The HTTPS request to `https://registry.npmjs.org/githubtemplatenodejs/latest` runs
  only when the cache file is absent or the cached idle-time has elapsed
  (2-second timeout).
- A successful check refreshes the cache with a 3600-second idle-delay; a
  failed check (HTTP 429, 503, timeout, network error) reports a bright red
  error note and backs off with an 86400-second idle-delay.
- `--ver` and `--version` bypass the gate and always query both sources
  (npm registry JSON API and `https://api.github.com/repos/Ogekuri/GitHub-Template-NodeJS/releases/latest`).

## Repository tooling scripts

| Script | Purpose |
| --- | --- |
| `scripts/templatenodejs.sh` | Local-run launcher delegating to `node src/templatenodejs/main.js`. |
| `scripts/build.sh` | Release packager: cleans the generated state, removes stale `dist/*.tgz`, builds `npm pack --pack-destination dist/`, and verifies the produced package tarball. |
| `scripts/clean.sh` | Removes every repository-internal execution-generated artifact and restores the canonical startup state. |
| `scripts/pre-release-check.sh` | Fail-fast release verification (syntax, node --check, npm test, out-of-tree build, artifact validation) with baseline-guarded cleanup. |

`scripts/clean.sh` removes `node_modules/` at any depth, the `.nyc_output/`,
`coverage/`, and `build/` directories, and the `.coverage`/`.coverage.*`
data files. It is idempotent (absent targets are a successful no-op), never
touches tracked files, untracked user files, `$HOME` application data, or
the versioned release artifacts in `dist/`, and never runs destructive git
commands.

```bash
# Remove all execution-generated temporary artifacts
./scripts/clean.sh

# Build from the canonical cleaned state (also via clean.sh)
./scripts/build.sh
```

## Release automation

For every canonical version tag `vX.Y.Z` the release workflow
(`.github/workflows/release-npm.yml`) creates a GitHub release from the
`dist/` package tarball present at the tagged commit and, when the tag
belongs to `master`, publishes it to npm through OIDC Trusted Publishing.
No build step runs inside the workflow; runners are pinned to
`ubuntu-24.04`.

## Using this repository as a template

This repository doubles as the GitHub template
[`Ogekuri/GitHub-Template-NodeJS`](https://github.com/Ogekuri/GitHub-Template-NodeJS)
for new NodeJS applications. Template initialization extracts a skeleton
bundle into the working directory and resolves seven keywords
(`%AUTHOR%`, `%DESCRIPTION%`, `%PROGRAM%`, `%SHORTNAME%`, `%SRCDIR%`,
`%OWNER%`, `%REPOSITORY%`) across the repository files, then renames the
skeleton script and source directories to the substituted names. The full
procedure is specified in `usereq/docs/REQUIREMENTS.md`.

## Development and testing

```bash
# Run the unit-test suite
npm test

# Full release-readiness verification (fail-fast, leaves no artifacts)
./scripts/pre-release-check.sh
```

The test suite covers the help screen, version report, management-command
argv variants, the gated version check and its cache, the configuration CLI,
the release-workflow contract, and the packaging artifacts.

# License

This project is licensed under the **GNU General Public License v3.0 only**
(SPDX identifier `GPL-3.0-only`), as declared in `package.json`.
The full license text is available in the [`LICENSE`](LICENSE) file.

Copyright (c) Francesco Rolando.

# Acknowledgments

- **[Node.js](https://nodejs.org)** and **[npm](https://www.npmjs.com)** — the runtime and packaging backbone of this template.
- **[PI-useReq](https://github.com/Ogekuri/PI-useReq)** — the requirement-driven agentic workflow used to specify, implement, and document this repository.
- **[Shields.io](https://shields.io)** — for the README badges.
