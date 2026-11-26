# Changelog

## [0.0.8](https://github.com/Ogekuri/GitHub-Template-NodeJS/releases/tag/v0.0.8) - 2026-11-26
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
- read npm top-level version and send GitHub User-Agent [useReq] *(version-check)*
  The npm /latest endpoint returns the version manifest with the latest
  version at the top-level 'version' field; the extractor read the
  nonexistent 'info.version' path and every check failed with
  'npm payload misses info.version'.
  The GitHub API rejects requests without a User-Agent header with
  HTTP 403 Forbidden; fetchLatestGithubVersion now sends the mandatory
  'User-Agent: githubtemplatenodejs' header next to Accept.
  Add the failing L0 reproducer test 'npm latest manifest shape and
  github user agent contract' and align the ten mocked npm payload
  fixtures with the real /latest manifest shape.
  Update WORKFLOW.md communication-edge payloads and regenerate
  REFERENCES.md; requirements unchanged (REQ-009/REQ-028/REQ-029).
- publish ./dist/*.tgz file-spec operand for npm OIDC [useReq] *(release-npm)*
  npm resolved the bare glob-expanded operand dist/githubtemplatenodejs-<v>.tgz
  as the GitHub shortcut github:dist/... and ran git ls-remote over
  ssh://git@github.com/dist/....git, failing with exit 128 publickey.
  Prefixing the operand with ./ makes npm-package-arg classify it as a
  file spec, so npm publish uploads the committed dist/ tarball via OIDC
  trusted publishing (DES-017). Add a workflow-contract reproducer test
  and update the strictly-related argv assertion; requirements unchanged.
- Update .gitignore file.

### 🚜  Changes
- deploy CLI under long and short bin names [useReq] *(packaging)*
  REQUIREMENTS: DES-003 mandates exactly two bin entry points (githubtemplatenodejs, templatenodejs) both invoking src/githubtemplatenodejs/main.js; TST-031 and A-11 updated accordingly. package.json: bin adds the templatenodejs short-name entry mapping to the same CLI dispatcher. tests: TST-031 packaging assertion extended to both entries; full npm test suite passes 79/79. WORKFLOW: PROC:main entrypoints record the dual-name npm bin deployment.
- pin develop upgrade to develop branch and add --dev alias [useReq] *(management)*
  REQ-032/REQ-036: develop upgrade now installs the GitHub develop branch via git+https://...GitHub-Template-NodeJS.git#develop (forced variant keeps --force per REQ-037).
  REQ-034/REQ-048: --dev added as exact alias of --develop in dispatch and non-Linux manual fallback.
  REQ-001/REQ-039: help Options section documents --dev and the develop-branch source.
  README rows and help excerpt aligned with the mandated argv (DES-059, DES-019).
  Tests: byte-exact help and argv oracles updated, four --dev alias dispatch and fallback cases added, TST-032 README contract updated; npm test 77/77 pass.
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

- \[0.0.8\]: https://github.com/Ogekuri/GitHub-Template-NodeJS/releases/tag/v0.0.8

[0.0.8]: https://github.com/Ogekuri/GitHub-Template-NodeJS/releases/tag/v0.0.8
