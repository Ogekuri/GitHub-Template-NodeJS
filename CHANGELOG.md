# Changelog

## [0.0.2](https://github.com/Ogekuri/GitHub-Template-NodeJS/releases/tag/v0.0.2) - 2026-11-24
### ⛰️  Features
- Add .galias.conf file.

### 🏗️  Implementations
- port Python Astra-UV CLI to NodeJS npm application [useReq] *(core)*
  Implement the full SRS as a NodeJS/CommonJS npm package:
  package.json/bin githubtemplatenodejs -> src/githubtemplatenodejs/main.js,
  engines >= 24, npm pack files contract, generated package-lock.json.
  CLI modules: core dispatch, management npm argv variants, idle-time
  cached version check over npm registry + GitHub releases, embedded
  color JSON, canonical schema config CLI with atomic persistence and
  box-drawing renderers (REQ-001..047, DES-001..069).
  Skeleton copy src/templatenodejs and launcher scripts/templatenodejs.sh
  delegating via node (PRJ-002, CTN-012, CTN-013).
  Release tooling: build.sh (npm pack), clean.sh, pre-release-check.sh,
  rename-me.sh template instantiation (PRJ-007..010).
  release-npm.yml: GitHub release per tag + OIDC trusted npm publishing
  on master tags, ubuntu-24.04 pins, Node24 action manifest.
  HDT tests under tests/ covering TST-001..TST-034 (70 passing) and
  runtime docs WORKFLOW.md/REFERENCES.md.

### 🐛  Bug Fixes
- Update .gitignore file.

### 🚜  Changes
- adapt galias ver_rules to NodeJS targets and add version consistency tests [useReq] *(galias-config)*
  Replace the Python/AstralUV ver_rules (src/**/*.py, pyproject.toml,
  uv.lock) with the NodeJS packaging rules for package.json and
  package-lock.json, keeping README.md and scripts/**/*.sh targets
  (DES-070, DES-071). Add DES-072 mandating version consistency with
  the package.json canonical version, TST-035, and the HDT suite
  tests/galias_conf.test.js verifying rule resolution and version
  agreement. g ver now exits 0; npm test passes 73/73.

### ◀️  Revert
- Roll back branch to 7ca258f7 (7ca258f7069b57ad71581ec811e02ccdea0cb41c).


# History

- \[0.0.2\]: https://github.com/Ogekuri/GitHub-Template-NodeJS/releases/tag/v0.0.2

[0.0.2]: https://github.com/Ogekuri/GitHub-Template-NodeJS/releases/tag/v0.0.2
