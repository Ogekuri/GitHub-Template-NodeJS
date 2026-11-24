# Changelog

## [0.0.1](https://github.com/Ogekuri/GitHub-Template-NodeJS/releases/tag/v0.0.1) - 2026-11-24

### 🏗️ Implementations
- implement NodeJS CLI app, version check, tests, and runtime docs [useReq] *(core)*
  Implement the SRS end-to-end as the NodeJS port of the Python
  Astral-UV template:
  Package the CLI with `package.json`/`package-lock.json` (npm `bin`
  entry `githubtemplatenodejs`, engines >= 24).
  Add `src/githubtemplatenodejs` CommonJS modules: core dispatch,
  management commands, idle-time cached version check (REQ-001..047).
  Local-run launcher `scripts/templatenodejs.sh` delegating to
  `node src/templatenodejs/main.js` (PRJ-002, CTN-012, CTN-013).
  Release tooling: `scripts/build.sh`, `scripts/clean.sh`,
  `scripts/pre-release-check.sh`, `scripts/rename-me.sh`
  (PRJ-007..PRJ-010).
  Release workflow `release-npm.yml` with OIDC Trusted Publishing on
  `master` tags (DES-015..DES-018).
  HDT unit suites under `tests/` covering TST-001..TST-034.
