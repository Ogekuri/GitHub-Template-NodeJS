# Files Structure
```
.
└── src
    ├── githubtemplatenodejs
    │   ├── colors.js
    │   ├── config_render.js
    │   ├── config.js
    │   ├── core.js
    │   ├── index.js
    │   ├── main.js
    │   ├── management.js
    │   └── version_check.js
    └── templatenodejs
        ├── core.js
        └── main.js
```

# colors.js | JavaScript | 80L | 4 symbols | 0 imports | 5 comments
> Path: `src/githubtemplatenodejs/colors.js`
- @brief Hardcoded notification-color registry embedded as one internal
JSON document.
- @details Single source of truth for every notification color (REQ-040):
the embedded JSON assigns the new-version and error color
tokens (REQ-041) and maps every color token to its ANSI SGR
prefix. No CLI option, file, or environment surface can alter
these values (CTN-008); parsing happens once at module load
and cannot fail at runtime because the embedded document is a
compile-time constant.

## Definitions

- const `const COLOR_CONFIG_JSON = (` (L27)
- @brief Embedded internal JSON document with the hardcoded color
configuration (REQ-040).
- @details Object shape: `notifications` maps `new_version_color` and
`error_color` to palette tokens (REQ-041 assignment:
`bright_green` / `bright_red`); `palette` maps every color
token to its ANSI SGR prefix `ESC [ <code> m`. Escape
sequences use the JSON `\\u001b` form so the source stays
pure printable ASCII. `JSON.parse` preserves object insertion
order, so palette iteration order equals declaration order.
- @satisfies REQ-040 REQ-041
- const `const COLOR_CONFIG = JSON.parse(COLOR_CONFIG_JSON);` (L51)
- @brief Parsed embedded color configuration (REQ-040).
- @details Shape: `{"notifications": {"new_version_color": string,
"error_color": string}, "palette": {token: ANSI SGR prefix}}`.
- @satisfies REQ-040
- const `const PALETTE = COLOR_CONFIG.palette;` (L60)
- @brief Ordered palette of color token to ANSI SGR prefix.
- @details Shared registry view of `COLOR_CONFIG.palette` consumed by the
renderer documentation tables; insertion order equals the
embedded JSON declaration order.
- @satisfies REQ-040
### fn `function notificationColors()` (L72-78)
- @brief Resolve the hardcoded ANSI prefixes for notifications.
- @details Selects `PALETTE` entries through the
`COLOR_CONFIG.notifications` assignment (REQ-041); hardcoded
values need no I/O and cannot fail (REQ-026). Complexity:
O(1) constant-time lookups.
- @return {{new_version_color: string, error_color: string}} Mapping with
`new_version_color` and `error_color` ANSI SGR prefix strings.
- @satisfies REQ-026 REQ-040 REQ-041

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`COLOR_CONFIG_JSON`|const||27||
|`COLOR_CONFIG`|const||51||
|`PALETTE`|const||60||
|`notificationColors`|fn||72-78|function notificationColors()|


---

# config.js | JavaScript | 1041L | 41 symbols | 0 imports | 45 comments
> Path: `src/githubtemplatenodejs/config.js`
- @brief Configuration subsystem: canonical schema, strict validation,
atomic JSON persistence, path resolution, and CLI handlers.
- @details Single source of truth driving parsing, validation, defaults,
path discovery, and configuration output (DES-010). State
persists as sparse JSON at `$HOME/.config/
githubtemplatenodejs/config.json`: only parameter values
differing from their schema defaults are stored (REQ-049),
default-valued parameters are removed at each save (REQ-050),
an emptied save deletes the file (REQ-051), and an absent
file reads as the schema-default configuration (REQ-052).
Version-check transport parameters (endpoint,
timeout, idle-delays) stay hardcoded (CTN-008) and are not
part of the schema; the automatic-check enable/disable switch
is schema state (REQ-042). Handlers emit valid output on
stdout only, report failures on stderr with exit status 1,
and never mutate state on rejected operations (REQ-023).

## Definitions

### mod `const fs = require("fs")` (L21-75)

### mod `const os = require("os")` (L22-75)
- @brief Global configuration directory segments relative to `$HOME`.
- @details Mirrors the version-check cache isolation policy (CTN-008).

### mod `const path = require("path")` (L23-75)
- @brief Global configuration directory segments relative to `$HOME`.
- @details Mirrors the version-check cache isolation policy (CTN-008).
- const `const CONFIG_DIR_SEGMENTS = [".config", "githubtemplatenodejs"]` (L29)
  - @brief Global configuration directory segments relative to `$HOME`.
  - @details Mirrors the version-check cache isolation policy (CTN-008).
- const `const CONFIG_FILE_NAME = "config.json"` (L36)
  - @brief Global configuration JSON file name.
  - @details Fixed file name under the configuration directory (DES-007
convention); no project-local configuration layer exists.
- const `const VERSION_CHECK_SECTION_TOKEN = "version_check"` (L43)
  - @brief Canonical token of the version-check schema section.
  - @details First-level CLI path token (REQ-022); case-sensitive.
  - @satisfies REQ-042
- const `const DISABLE_VERSION_CHECK_PARAM_TOKEN = "disable-version-check"` (L50)
  - @brief Canonical token of the automatic-check suppression parameter.
  - @details Second-level CLI path token (REQ-022); case-sensitive.
  - @satisfies REQ-042
- const `const DISABLE_VERSION_CHECK_ENUM = ["no", "yes"]` (L56)
  - @brief Ordered allowed values of the suppression parameter (Selection).
  - @satisfies REQ-042
- const `const DISABLE_VERSION_CHECK_ENABLED_VALUE = "yes"` (L62)
  - @brief Enum token suppressing the automatic online check (REQ-043).
  - @satisfies REQ-043
- const `const DISABLE_VERSION_CHECK_DEFAULT_VALUE = "no"` (L68)
  - @brief Schema default keeping the automatic online check enabled.
  - @satisfies REQ-042

### fn `function paramSpec(token, typeLabel, description, defaultValue, enumValues)` (L86-101)
- @brief Immutable schema descriptor of one configuration parameter.
- @details `token` equals the CLI path token byte for byte (REQ-022);
drives parsing, validation, defaults, display, and
documentation (DES-010). Instances are frozen after creation.
@property {string} token Canonical CLI path token of the parameter.
@property {string} typeLabel Schema type label rendered in `--info`
headings.
@property {string} description Concise English description rendered in
`--info`.
@property {string} default Schema default value restored by `--unset`
(REQ-018).
@property {string[]} enumValues Ordered allowed values for Selection
parameters.
- @satisfies DES-010

### fn `function sectionSpec(token, description, params)` (L115-136)
- @brief Immutable schema descriptor of one fixed-schema section.
- @details Fixed-schema dictionary branch; whole-section `--set`
replaces the branch with a schema-compatible JSON object and
`--unset` restores all parameter defaults (REQ-018).
Instances are frozen after creation.
@property {string} token Canonical CLI path token of the section.
@property {string} description Concise English description rendered in
`--print`/`--info`.
@property {Array} params Ordered parameter descriptors of the section.
- @satisfies DES-010

- const `const SCHEMA = Object.freeze([` (L148)
- @brief Canonical configuration schema (DES-010).
- @details Insertion order defines canonical display order. The schema
defines the `version_check` section holding the
`disable-version-check` Selection switch (REQ-042);
transport parameters stay hardcoded constants (CTN-008) and
notification colors stay hardcoded in the embedded internal
color JSON of `colors.js` (REQ-040).
- @satisfies DES-010 REQ-042 CTN-008
- const `const SECTIONS_BY_TOKEN = new Map(` (L172)
- @brief Schema token to SectionSpec map for O(1) path resolution.
- @details Module-private index; cross-module consumers MUST use the
public `section()` API (DES-058).
- @satisfies DES-058
### fn `function section(token)` (L186-190)
- @brief Look up one schema section descriptor by canonical token.
- @details Public schema access point (DES-058): cross-module consumers
(renderers, documentation builders) resolve sections through
this API instead of module-private indices; `token` equals
the CLI path token byte for byte (REQ-022). Complexity: O(1).
- @param {string} token Exact section path token (case-sensitive).
- @return {Object|null} Matching descriptor; null if absent.
- @satisfies DES-010 DES-058

### class `class ConfigError extends Error` : Error (L199-208)
- @brief Configuration error carrying a user-facing diagnostic.
- @brief Construct the error with its user-facing diagnostic.
- @details Raised for invalid paths, values, JSON, validation failures,
and unrecoverable filesystem conditions; handlers render the
message on stderr and exit 1 (REQ-023).
- @param {string} message Complete diagnostic message.
- @satisfies REQ-023

### fn `function configPath()` (L219-226)
- @brief Resolve the absolute global configuration file path.
- @details Prefers the `HOME` environment variable (CTN-008 consistency
with the version-check cache); falls back to `os.homedir()`
when unset. No project-local configuration layer exists.
Complexity: O(1).
- @return {string} Absolute path of the global configuration JSON file.
- @satisfies CTN-008

### fn `function defaultConfig()` (L236-246)
- @brief Build the schema-default configuration payload.
- @details Section token to parameter token to default value, in
canonical schema order. Complexity: O(sections * params).
- @return {Object<string, Object<string, string>>} Schema-default
configuration payload.
- @satisfies REQ-018 DES-010

### fn `function validateConfig(payload)` (L266-308)
- @brief Validate a sparse configuration payload against the schema.
- @details Strict sparse validation (REQ-055): JSON object root, every
present section key known, every present parameter key known
inside its section, and every present Selection value
restricted to the parameter enum. Sections and parameters
absent from the payload resolve to their schema defaults
(REQ-052) and are never rejected, so any schema-valid subset
is accepted. Throws without mutation; callers reject the
operation on error. Complexity: O(payload keys).
- @param {Object} payload Parsed JSON configuration payload (sparse or
complete).
- @return {undefined}
- @throws {ConfigError} On root-type, unknown-section, branch-type,
unknown-parameter, or enum-membership mismatch; message names
the offending path.
- @satisfies REQ-055 REQ-052 REQ-017 REQ-023 DES-010

### fn `function describeType(value)` (L317-325)
- @brief Describe the JSON type name of one value for diagnostics.
- @details Maps null, arrays, and plain objects to the vocabulary used by
validation messages. Complexity: O(1).
- @param {*} value Any JSON value.
- @return {string} Human-readable JSON type name.

### fn `function atomicWriteJson(filePath, payload)` (L344-400)
- @brief Persist a validated payload atomically (DES-014).
- @details Writes a same-directory temporary file, flushes and fsyncs
it, preserves the prior target file mode, atomically replaces
the target with `fs.renameSync`, and fsyncs the parent
directory where the platform supports it. The prior valid
file survives any failure before the replace; on failure the
temporary file is removed. Complexity: O(payload size).
- @param {string} filePath Target configuration file path.
- @param {Object} payload Schema-validated payload to store.
- @return {undefined}
- @throws {ConfigError} When directory creation or the write/replace
sequence fails; the original file stays untouched.
- @satisfies DES-014
- @post On success the file holds exactly the serialized payload with
two-space indentation and a trailing newline.

### fn `function sparseConfig(payload)` (L414-433)
- @brief Project a configuration payload onto its non-default subset.
- @details Sparse projection (REQ-049): walks the canonical schema order
and keeps only parameters whose value differs from the schema
default; sections without non-default parameters and keys
outside the schema are dropped. The input payload is never
mutated. Complexity: O(sections * params).
- @param {Object} payload Configuration payload (sparse or complete).
- @return {Object<string, Object<string, string>>} Sparse payload holding
only non-default parameter values in canonical schema order.
- @satisfies REQ-049

### fn `function removeConfigFile(filePath)` (L445-451)
- @brief Delete the global configuration file when present.
- @details Implements the empty-sparse-save rule (REQ-051): an absent
file is a successful no-op; any other filesystem failure
raises without partial state. Complexity: O(1).
- @param {string} filePath Configuration file path to remove.
- @return {undefined}
- @throws {ConfigError} When the removal fails.
- @satisfies REQ-051

### fn `function persistConfig(payload)` (L469-476)
- @brief Persist the non-default subset of a validated payload.
- @details Single configuration save gate (REQ-049, REQ-050, REQ-051,
DES-014): projects the payload onto its sparse non-default
subset via `sparseConfig`; a non-empty subset is written
atomically via `atomicWriteJson`, an empty subset deletes the
configuration file via `removeConfigFile`. Default-valued
parameters never reach the persisted document (REQ-050).
Complexity: O(sections * params + payload size).
- @param {Object} payload Schema-validated configuration payload.
- @return {undefined}
- @throws {ConfigError} When the write or the removal fails.
- @satisfies REQ-049 REQ-050 REQ-051 DES-014
- @post The configuration file holds exactly the non-default parameters,
or is absent when every parameter equals its schema default.

### fn `function ensureBootstrapped()` (L490-497)
- @brief Create the missing configuration directory hierarchy.
- @details Applicable configuration commands call this before executing.
Directory-only bootstrap (REQ-053): the configuration file is
never pre-created; an absent file reads as the schema-default
configuration (REQ-052) and is created by the first
non-default save (REQ-049). Complexity: O(1) filesystem-bound.
- @return {undefined}
- @throws {ConfigError} When directories cannot be created.
- @satisfies REQ-053 REQ-052 REQ-016 REQ-017 REQ-018 REQ-019 REQ-020
REQ-021

### fn `function readPayload()` (L510-526)
- @brief Read and parse the persisted sparse configuration JSON document.
- @details Resolves `configPath` and reads it as UTF-8 text; an absent
file yields the empty sparse payload `{}` (REQ-052), so every
reader sees the schema-default configuration; every other
failure raises without returning a partial result (REQ-023).
Complexity: O(file size).
- @return {Object} Parsed JSON payload; `{}` when the file is absent.
- @throws {ConfigError} When the file is unreadable or malformed JSON.
- @satisfies REQ-052 REQ-023

### fn `function loadStrict()` (L543-551)
- @brief Load the strictly validated effective global configuration.
- @details Reads the sparse persisted document, applies the strict
sparse `validateConfig` (REQ-055), and merges the result onto
the schema defaults (REQ-052): absent sections and parameters
resolve to their schema default, so the returned payload is
always schema-complete. Every invalid sparse document raises
instead of partially succeeding (REQ-022, REQ-023).
Complexity: O(file size + schema).
- @return {Object<string, Object<string, string>>} Effective validated
configuration payload (schema-complete).
- @throws {ConfigError} When the file is unreadable, malformed JSON, or
schema-invalid.
- @satisfies REQ-052 REQ-055 REQ-022 REQ-023

### fn `function loadDisplay()` (L573-597)
- @brief Load the schema-shaped display view of the configuration.
- @details Read-only loader of the schema-driven `--print` and `--info`
renderers (DES-010, DES-012): requires a JSON-object root,
then projects the sparse payload onto the schema (REQ-052).
Content persisted by an older schema version never blocks
rendering (TST-008): unknown sections and parameters are
dropped, an absent file yields the empty sparse payload, and
schema branches or parameters missing from the file fall back
to their schema defaults, so the result is always safe for
the renderers' direct payload indexing. Unreadable, malformed,
and non-object files remain hard failures (REQ-023).
Complexity: O(file size + schema).
- @return {Object<string, Object<string, string>>} Schema-shaped
payload: section token to parameter token to current value
(schema default when absent from the file).
- @throws {ConfigError} When the file is unreadable, malformed JSON, or
its root is not a JSON object.
- @satisfies DES-010 TST-008 REQ-052 REQ-019 REQ-023

### fn `function versionCheckDisabled()` (L613-629)
- @brief Report whether the automatic version check is disabled.
- @details Tolerant runtime reader (REQ-044): loads the schema-shaped
display view and compares the `disable-version-check` value
against the enabling enum token. An absent, unreadable,
malformed, or non-object configuration file yields false
(schema default: check enabled); unknown persisted keys are
dropped by the loader, so stale-schema content never enables
the suppression (REQ-042, TST-008). Complexity: O(file size).
- @return {boolean} True only when
`version_check:disable-version-check` equals the enabling enum
token; false otherwise.
- @satisfies REQ-042 REQ-043 REQ-044

### fn `function resolveSegments(rawPath)` (L646-686)
- @brief Resolve a canonical configuration path against the schema.
- @details Case-sensitive colon-separated tokens (REQ-022). This schema
defines exactly two depths: `Section` and
`Section:Parameter`; no array or map parameters exist, so
deeper segments and reserved operation tokens (`append`,
`+`, `insert`) are rejected as unknown or misplaced.
Complexity: O(path tokens).
- @param {string} rawPath Raw canonical path from the CLI.
- @return {string[]} One or two resolved path tokens.
- @throws {ConfigError} On empty paths, empty tokens, unknown section
or parameter tokens, and excessive depth; messages list valid
alternatives.
- @satisfies REQ-022

### fn `function getValue(payload, segments)` (L698-704)
- @brief Extract the JSON-serializable value at a resolved path.
- @details Depth 1 yields a shallow copy of the section object; depth 2
yields the parameter string. Complexity: O(branch size).
- @param {Object} payload Validated configuration payload.
- @param {string[]} segments Tokens from `resolveSegments`.
- @return {Object|string} Section dict copy for depth 1; parameter
string for depth 2.
- @satisfies REQ-016

### fn `function parseValue(spec, raw)` (L718-726)
- @brief Parse a raw CLI operand into the schema type of `spec`.
- @details Selection parameters accept exactly one enum token; JSON
quoting is not stripped, so quoted input is rejected
(REQ-017 typed parsing before write). Complexity: O(enum).
- @param {Object} spec Target parameter descriptor.
- @param {string} raw Raw operand string from the CLI.
- @return {string} Validated enum token.
- @throws {ConfigError} When `raw` is not an allowed value; the message
enumerates valid values.
- @satisfies REQ-017

### fn `function setValue(payload, rawPath, raw)` (L744-771)
- @brief Apply a validated `--set` mutation and return the result.
- @details Depth 1 replaces the whole section with a parsed
schema-compatible JSON object; depth 2 parses the operand
into the parameter schema type (REQ-017). The resulting
configuration is validated in full before returning; the
input payload is never mutated. Complexity: O(payload).
- @param {Object} payload Current validated configuration.
- @param {string} rawPath Raw canonical target path.
- @param {string} raw Raw value operand from the CLI.
- @return {Object<string, Object<string, string>>} New validated
configuration.
- @throws {ConfigError} On path, JSON, type, enum, or whole-config
validation failure; no persisted mutation occurs.
- @satisfies REQ-017

### fn `function unsetValue(payload, rawPath)` (L786-800)
- @brief Apply a `--unset` restore-to-default mutation.
- @details Depth 1 restores all section parameter defaults; depth 2
restores one parameter default (REQ-018). The resulting
configuration is validated before returning; the input
payload is never mutated. Complexity: O(payload).
- @param {Object} payload Current validated configuration.
- @param {string} rawPath Raw canonical target path.
- @return {Object<string, Object<string, string>>} New validated
configuration.
- @throws {ConfigError} On path resolution or validation failure.
- @satisfies REQ-018

### fn `function operandValues(args, flag, minimum, maximum)` (L817-830)
- @brief Extract the operand tokens following one CLI flag.
- @details Operands are every token after the first flag occurrence;
the count must lie within `[minimum, maximum]`, otherwise a
usage diagnostic with complete canonical path examples is
raised (REQ-022). Complexity: O(args).
- @param {string[]} args CLI argument tokens excluding program name.
- @param {string} flag Exact flag token to locate (e.g. `--set`).
- @param {number} minimum Minimum acceptable operand count.
- @param {number} maximum Maximum acceptable operand count.
- @return {string[]} Operand tokens in original order.
- @throws {ConfigError} When the operand count is out of range; the
message embeds schema-valid usage examples.
- @satisfies REQ-022

### fn `function usageExamples(flag)` (L843-876)
- @brief Build schema-valid usage examples for one config flag.
- @details Examples derive from the first schema section so they always
carry complete canonical paths and real schema-valid values
(REQ-022); with an empty schema the generic `<Path>`
placeholder documents that every path is rejected.
Complexity: O(1).
- @param {string} flag Exact flag token (e.g. `--set`).
- @return {string} Semicolon-separated example command tails.
- @satisfies REQ-022

### fn `function fail(error)` (L887-890)
- @brief Report a configuration failure and yield the exit status.
- @details Diagnostics go to stderr with an `Error:` prefix; stdout
stays untouched so no partial success output exists
(REQ-023). Side effect: one stderr write. Complexity: O(1).
- @param {ConfigError} error Failure carrying the diagnostic message.
- @return {number} Always 1.
- @satisfies REQ-023

### fn `function handleGet(args)` (L904-919)
- @brief Execute `--get Path` (REQ-016).
- @details Bootstraps storage, loads the effective validated
configuration (an absent file reads as the schema defaults,
REQ-052), resolves the canonical path, and prints the
resolved value as one valid JSON document on stdout without
decoration (JSON-quoted strings, objects for sections).
Complexity: O(file size).
- @param {string[]} args CLI argument tokens excluding program name.
- @return {number} 0 on success; 1 with a stderr diagnostic on failure.
- @satisfies REQ-016 REQ-052 REQ-023

### fn `function handleSet(args)` (L933-947)
- @brief Execute `--set Path Value` (REQ-017, DES-014).
- @details Parses Value into the schema type, validates the entire
resulting configuration, and persists its non-default subset
(REQ-049, REQ-050); a save whose subset is empty deletes the
configuration file (REQ-051). Success is silent and any
rejection leaves the stored file untouched. Complexity:
O(file size).
- @param {string[]} args CLI argument tokens excluding program name.
- @return {number} 0 on success; 1 with a stderr diagnostic on failure.
- @satisfies REQ-017 REQ-049 REQ-050 REQ-051 REQ-023 DES-014

### fn `function handleUnset(args)` (L960-974)
- @brief Execute `--unset Path` (REQ-018, DES-014).
- @details Restores the targeted parameter or section to schema defaults
and persists atomically; restored default-valued parameters
are removed from the file and the emptied file is deleted
(REQ-050, REQ-051); success is silent. Complexity:
O(file size).
- @param {string[]} args CLI argument tokens excluding program name.
- @return {number} 0 on success; 1 with a stderr diagnostic on failure.
- @satisfies REQ-018 REQ-049 REQ-050 REQ-051 REQ-023 DES-014

### fn `function handlePrintRaw(args)` (L988-1006)
- @brief Execute `--print-raw` (REQ-021).
- @details Emits the exact bytes of the global configuration JSON file
without parsing, reformatting, headings, or trailing text; no
tree formatting is ever applied (on-disk debugging view). The
file is absent in the all-default state (REQ-052, REQ-053);
absence fails with exit 1 and a stderr diagnostic (REQ-054).
Complexity: O(file size).
- @param {string[]} args CLI argument tokens excluding program name.
- @return {number} 0 on success; 1 with a stderr diagnostic on failure.
- @satisfies REQ-021 REQ-054 REQ-023

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`fs`|mod||21-75||
|`os`|mod||22-75||
|`path`|mod||23-75||
|`path.CONFIG_DIR_SEGMENTS`|const||29||
|`path.CONFIG_FILE_NAME`|const||36||
|`path.VERSION_CHECK_SECTION_TOKEN`|const||43||
|`path.DISABLE_VERSION_CHECK_PARAM_TOKEN`|const||50||
|`path.DISABLE_VERSION_CHECK_ENUM`|const||56||
|`path.DISABLE_VERSION_CHECK_ENABLED_VALUE`|const||62||
|`path.DISABLE_VERSION_CHECK_DEFAULT_VALUE`|const||68||
|`paramSpec`|fn||86-101|function paramSpec(token, typeLabel, description, default...|
|`sectionSpec`|fn||115-136|function sectionSpec(token, description, params)|
|`SCHEMA`|const||148||
|`SECTIONS_BY_TOKEN`|const||172||
|`section`|fn||186-190|function section(token)|
|`ConfigError`|class||199-208|class ConfigError extends Error|
|`configPath`|fn||219-226|function configPath()|
|`defaultConfig`|fn||236-246|function defaultConfig()|
|`validateConfig`|fn||266-308|function validateConfig(payload)|
|`describeType`|fn||317-325|function describeType(value)|
|`atomicWriteJson`|fn||344-400|function atomicWriteJson(filePath, payload)|
|`sparseConfig`|fn||414-433|function sparseConfig(payload)|
|`removeConfigFile`|fn||445-451|function removeConfigFile(filePath)|
|`persistConfig`|fn||469-476|function persistConfig(payload)|
|`ensureBootstrapped`|fn||490-497|function ensureBootstrapped()|
|`readPayload`|fn||510-526|function readPayload()|
|`loadStrict`|fn||543-551|function loadStrict()|
|`loadDisplay`|fn||573-597|function loadDisplay()|
|`versionCheckDisabled`|fn||613-629|function versionCheckDisabled()|
|`resolveSegments`|fn||646-686|function resolveSegments(rawPath)|
|`getValue`|fn||698-704|function getValue(payload, segments)|
|`parseValue`|fn||718-726|function parseValue(spec, raw)|
|`setValue`|fn||744-771|function setValue(payload, rawPath, raw)|
|`unsetValue`|fn||786-800|function unsetValue(payload, rawPath)|
|`operandValues`|fn||817-830|function operandValues(args, flag, minimum, maximum)|
|`usageExamples`|fn||843-876|function usageExamples(flag)|
|`fail`|fn||887-890|function fail(error)|
|`handleGet`|fn||904-919|function handleGet(args)|
|`handleSet`|fn||933-947|function handleSet(args)|
|`handleUnset`|fn||960-974|function handleUnset(args)|
|`handlePrintRaw`|fn||988-1006|function handlePrintRaw(args)|


---

# config_render.js | JavaScript | 626L | 28 symbols | 0 imports | 27 comments
> Path: `src/githubtemplatenodejs/config_render.js`
- @brief Deterministic tree renderer and table formatter for the
configuration CLI `--print` and `--info` commands.
- @details One shared data-driven renderer (DES-012) emits UTF-8
box-drawing trees from typed ConfigNode values for both
display commands; only heading and detail formatters differ.
Structural edges (`|-- `, `` -- `` box glyphs) mark real
configuration nodes only; metadata and tables are attached
detail lines carrying the owning node continuation prefix
(DES-013). Tree topology never depends on text width. Tables
use exclusively the glyphs `─ │ ╭ ╮ ╰ ╯ ├ ┤ ┬ ┴ ┼ ═ ╞ ╪ ╡`
with rounded outer corners, a double-line header separator,
and single-line row separators (DES-053..DES-056).

## Definitions

### mod `const config = require("./config")` (L17-62)
- @brief Ancestor continuation segment: vertical bar plus three spaces.

### mod `const colors = require("./colors")` (L18-62)
- @brief Ancestor continuation segment: vertical bar plus three spaces.
- const `const PREFIX_CONTINUE = "\u2502   "` (L23)
  - @brief Ancestor continuation segment: vertical bar plus three spaces.
- const `const PREFIX_INDENT = "    "` (L28)
  - @brief Ancestor indent segment: exactly four ASCII spaces.
- const `const EDGE_BRANCH = "\u251c\u2500\u2500 "` (L33)
  - @brief Tree edge marker for a node with a later real sibling.
- const `const EDGE_LAST = "\u2514\u2500\u2500 "` (L38)
  - @brief Tree edge marker for the final real sibling at a depth.
- const `const ROOT_HEADING_PRINT = "Application_Configuration - Current configuration"` (L45)
  - @brief Display heading of the virtual whole-tree root (never a CLI
path) in `--print` mode.
  - @satisfies REQ-019
- const `const ROOT_HEADING_INFO = (` (L51)
  - @brief Display heading of the virtual root in `--info` mode.
  - @satisfies REQ-020

### fn `function configNode(token, canonicalPath, kind, heading, details, children)` (L75-84)
- @brief Typed tree node of one real configuration element.
- @details `kind` distinguishes section/dictionary branches from
parameters; `children` holds only real configuration nodes
while metadata and tables live in `details` as logical text
lines (never rendered with structural edge markers).
Complexity: O(1) per node.
- @param {string} token Canonical schema/CLI token, byte-exact (REQ-022).
- @param {string|null} canonicalPath Full canonical path; null for the
virtual display root.
- @param {string} kind Node kind: `virtual-root`, `section`, or
`parameter`.
- @param {string} heading Fully formatted heading line (no tree prefix).
- @param {string[]} [details] Attached detail logical lines, in display
order.
- @param {Array} [children] Ordered real child nodes.
- @return {Object} ConfigNode record with fields `token`,
`canonicalPath`, `kind`, `heading`, `details`, `children`.
- @satisfies DES-012

### fn `function displayWidth(text)` (L95-105)
- @brief Measure the terminal display width of a string.
- @details Combining marks (Unicode category M) count zero; East Asian
wide and fullwidth code points count two; all others count
one. Complexity: O(code points).
- @param {string} text Text to measure.
- @return {number} Display width in terminal cells.
- @satisfies DES-013

### fn `function isCombiningCodePoint(codePoint)` (L114-120)
- @brief Report whether one code point is a combining mark.
- @details Covers the Unicode Mark property plus the Zero Width
Joiner/Non-Joiner control range. Complexity: O(1).
- @param {number} codePoint Unicode code point to classify.
- @return {boolean} True when the code point renders zero cells wide.

### fn `function isWideCodePoint(codePoint)` (L129-152)
- @brief Report whether one code point is East Asian wide or fullwidth.
- @details Covers the double-width ranges of the Unicode East Asian
Width property (W and F). Complexity: O(1) range scan.
- @param {number} codePoint Unicode code point to classify.
- @return {boolean} True when the code point renders two cells wide.

### fn `function formatTable(headers, rows)` (L171-219)
- @brief Render a rectangular box-drawing table (DES-013).
- @details Column widths derive from the maximum display width of the
header and all cells plus one space of padding on each side;
every border and row shares identical column boundaries, so
`┬`, `┼`, and `┴` align vertically with the `│` separators.
Glyph contract (DES-053..DES-056): rounded outer corners
`╭`/`╮`/`╰`/`╯`; single-line borders built from `─` with
`┬`/`┴` top/bottom junctions and `├`/`┼`/`┤` row-separator
junctions; double-line header separator `╞═..╪..═╡` between
the header row and the content rows. Complexity:
O(rows * columns).
- @param {string[]} headers Column header cells.
- @param {string[][]} rows Data rows, each with headers.length cells.
- @return {string[]} Physical table lines (borders and rows).
- @satisfies DES-013 DES-053 DES-054 DES-055 DES-056

### fn `const border = (left, horizontal, middle, right) =>` (L189-192)
- @brief Render one horizontal border line.
- @param {string} left Left corner glyph.
- @param {string} horizontal Horizontal fill glyph: `─` for single
lines, `═` for the double header separator.
- @param {string} middle Column junction glyph.
- @param {string} right Right corner glyph.
- @return {string} Complete border line.

### fn `const dataRow = (cells) =>` (L199-204)
- @brief Render one padded data row line.
- @param {string[]} cells Row cells; display-padded to column width.
- @return {string} Complete row line sharing the border boundaries.

### fn `function renderTree(root)` (L239-253)
- @brief Render a node hierarchy with the canonical prefix algorithm.
- @details Implements the normative traversal: the display root prints
without a marker and its attached details use a four-space
indent; every real child receives exactly one `├── `/`└── `
edge preceded by one four-character segment per ancestor that
has a later sibling; attached details prepend the same
ancestor segments plus exactly one own continuation segment
(`│ ` when the node has a later sibling, four spaces
otherwise). Detail lines never carry structural edge markers
and never add structural depth (DES-012). Complexity:
O(nodes + detail lines).
- @param {Object} root Display root (virtual root or requested subtree
root).
- @return {string} Complete multi-line rendering without trailing
newline.
- @satisfies DES-012 REQ-019

### fn `function emitNode(node, ancestorHasNext, isLast, lines)` (L269-288)
- @brief Emit one real node, its details, then its child nodes.
- @details Recursive worker of `renderTree`; `ancestorHasNext` holds one
entry per actual ancestor recording whether that ancestor has
a later sibling (REQ-019 connector grammar). Complexity:
O(subtree).
- @param {Object} node Real configuration node to emit.
- @param {boolean[]} ancestorHasNext Later-sibling flags of ancestors.
- @param {boolean} isLast True when `node` is the final sibling at
depth.
- @param {string[]} lines Output accumulator, mutated in place.
- @return {undefined}
- @satisfies DES-012 REQ-019

### fn `function selectionRows(param, current)` (L299-304)
- @brief Build `Sel | Value` rows with exactly one active marker.
- @details One `[*]` row for the current value and `[ ]` rows for the
remaining enum tokens, in enum order. Complexity: O(enum).
- @param {Object} param Selection parameter descriptor.
- @param {string} current Active value token.
- @return {string[][]} One `[*]` row and `[ ]` rows in enum order.
- @satisfies REQ-019

### fn `function colorMeaning(token)` (L318-325)
- @brief Build the Meaning cell text for one enum token.
- @details Tokens present in `colors.PALETTE` (REQ-040) render the ANSI
SGR code and color name; non-palette tokens degrade to a
neutral `-` cell so the Allowed Values table stays
schema-generic for every Selection parameter (DES-010).
Complexity: O(1).
- @param {string} token Selection enum token of the documented parameter.
- @return {string} `ANSI SGR <code> (<color name>)` for palette tokens;
`-` otherwise.
- @satisfies DES-010 REQ-042

### fn `function buildPrintSection(schemaSection, payload)` (L336-350)
- @brief Build a `--print` node for one section with parameter children.
- @details Heading carries the `[Path: <canonical path>]` marker mandated
by REQ-019. Complexity: O(params).
- @param {Object} schemaSection Section schema descriptor.
- @param {Object} payload Current configuration values.
- @return {Object} Section ConfigNode carrying parameter child nodes.
- @satisfies REQ-019 DES-012

### fn `function buildPrintParameter(schemaSection, schemaParam, value)` (L364-379)
- @brief Build a `--print` node for one selection parameter.
- @details Heading shows `Token = <JSON value>` plus `(default)` or
`(custom | default: <JSON default>)`; the attached
`Sel | Value` table lists exactly one `[*]` active row
(REQ-019). Complexity: O(enum).
- @param {Object} schemaSection Owning section descriptor.
- @param {Object} schemaParam Parameter schema descriptor.
- @param {string} value Current value token.
- @return {Object} Parameter ConfigNode with table detail lines.
- @satisfies REQ-019 DES-012

### fn `function buildInfoSection(schemaSection)` (L390-409)
- @brief Build an `--info` node for one fixed-schema section.
- @details Metadata precedes real children: a complete `Full overwrite`
command with a schema-valid sample object and a complete
`Reset block` command (REQ-020). Complexity: O(params).
- @param {Object} schemaSection Section schema descriptor.
- @return {Object} Section ConfigNode with metadata details and children.
- @satisfies REQ-020 DES-012

### fn `function buildInfoParameter(schemaSection, schemaParam)` (L423-450)
- @brief Build an `--info` node for one selection parameter.
- @details Heading reads `Token - [Type: constraints] description`;
attached details are the Default line with its restore
command, a complete shell-valid `Set cmd` using a real
schema-valid example value, and the `Allowed Values` table
(REQ-020). Complexity: O(enum).
- @param {Object} schemaSection Owning section descriptor.
- @param {Object} schemaParam Parameter schema descriptor.
- @return {Object} Parameter ConfigNode with documentation details.
- @satisfies REQ-020 DES-012

### fn `function buildPrintRoot(payload, rawPath)` (L466-498)
- @brief Build the display root for `--print`.
- @details Without a path the virtual `Application_Configuration` root
carries the schema sections as children; with a canonical
path the requested node becomes the unconnected display root
followed by its real descendants, without invented ancestors
(REQ-019). Complexity: O(schema).
- @param {Object} payload Current validated configuration.
- @param {string|null} rawPath Raw canonical path or null for whole tree.
- @return {Object} Display root ConfigNode.
- @throws {config.ConfigError} When the path resolves to no schema
section or parameter.
- @satisfies DES-058 REQ-019

### fn `function buildInfoRoot(payload, rawPath)` (L514-540)
- @brief Build the display root for `--info`.
- @details Same node set as `--print` with documentation heading and
detail formatters; a requested path renders that node as the
unconnected display root with its descendants (REQ-020).
Complexity: O(schema).
- @param {Object} payload Current validated configuration.
- @param {string|null} rawPath Raw canonical path or null for whole
schema.
- @return {Object} Display root ConfigNode.
- @throws {config.ConfigError} When the path resolves to no schema
section or parameter.
- @satisfies DES-058 REQ-020

### fn `function fail(error)` (L551-554)
- @brief Report a rendering-command failure on stderr.
- @details Diagnostic carries the `Error:` prefix; stdout stays
untouched (REQ-023). Side effect: one stderr write.
Complexity: O(1).
- @param {config.ConfigError} error Failure carrying the diagnostic.
- @return {number} Always 1 (REQ-023).
- @satisfies REQ-023

### fn `function handlePrint(args)` (L570-585)
- @brief Execute `--print [Path]` (REQ-019).
- @details Bootstraps storage, loads the schema-shaped display view via
`config.loadDisplay` so content persisted by an older schema
version never blocks rendering (DES-010, TST-008), builds the
display tree, and prints the rendering on stdout; genuine
failures (absent, unreadable, malformed JSON, or non-object
file; invalid operands or paths) print nothing on stdout and
report one stderr diagnostic with exit 1 (REQ-023).
Complexity: O(file size + schema).
- @param {string[]} args CLI argument tokens excluding program name.
- @return {number} 0 on success; 1 on failure.
- @satisfies REQ-019 REQ-023 DES-010 DES-012

### fn `function handleInfo(args)` (L600-615)
- @brief Execute `--info [Path]` (REQ-020).
- @details Shares the renderer with `--print` and loads the same
schema-shaped display view via `config.loadDisplay` so
content persisted by an older schema version never blocks
rendering (DES-010, TST-008); renders schema documentation
with defaults and complete command examples; genuine failures
print nothing on stdout and report one stderr diagnostic with
exit 1 (REQ-023). Complexity: O(file size + schema).
- @param {string[]} args CLI argument tokens excluding program name.
- @return {number} 0 on success; 1 on failure.
- @satisfies REQ-020 REQ-023 DES-010 DES-012

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`config`|mod||17-62||
|`colors`|mod||18-62||
|`colors.PREFIX_CONTINUE`|const||23||
|`colors.PREFIX_INDENT`|const||28||
|`colors.EDGE_BRANCH`|const||33||
|`colors.EDGE_LAST`|const||38||
|`colors.ROOT_HEADING_PRINT`|const||45||
|`colors.ROOT_HEADING_INFO`|const||51||
|`configNode`|fn||75-84|function configNode(token, canonicalPath, kind, heading, ...|
|`displayWidth`|fn||95-105|function displayWidth(text)|
|`isCombiningCodePoint`|fn||114-120|function isCombiningCodePoint(codePoint)|
|`isWideCodePoint`|fn||129-152|function isWideCodePoint(codePoint)|
|`formatTable`|fn||171-219|function formatTable(headers, rows)|
|`border`|fn||189-192|const border = (left, horizontal, middle, right) =>|
|`dataRow`|fn||199-204|const dataRow = (cells) =>|
|`renderTree`|fn||239-253|function renderTree(root)|
|`emitNode`|fn||269-288|function emitNode(node, ancestorHasNext, isLast, lines)|
|`selectionRows`|fn||299-304|function selectionRows(param, current)|
|`colorMeaning`|fn||318-325|function colorMeaning(token)|
|`buildPrintSection`|fn||336-350|function buildPrintSection(schemaSection, payload)|
|`buildPrintParameter`|fn||364-379|function buildPrintParameter(schemaSection, schemaParam, ...|
|`buildInfoSection`|fn||390-409|function buildInfoSection(schemaSection)|
|`buildInfoParameter`|fn||423-450|function buildInfoParameter(schemaSection, schemaParam)|
|`buildPrintRoot`|fn||466-498|function buildPrintRoot(payload, rawPath)|
|`buildInfoRoot`|fn||514-540|function buildInfoRoot(payload, rawPath)|
|`fail`|fn||551-554|function fail(error)|
|`handlePrint`|fn||570-585|function handlePrint(args)|
|`handleInfo`|fn||600-615|function handleInfo(args)|


---

# core.js | JavaScript | 110L | 7 symbols | 0 imports | 3 comments
> Path: `src/githubtemplatenodejs/core.js`
- @brief Core command dispatch and githubtemplatenodejs CLI runtime
orchestration.
- @details Runs the automatic online version check before argument
dispatch (REQ-007), then routes management and configuration
commands to dedicated handlers and propagates exit codes to
the process boundary.

## Definitions

### mod `const path = require("path")` (L11-56)

### mod `const config = require("./config")` (L12-56)

### mod `const configRender = require("./config_render")` (L13-56)

### mod `const management = require("./management")` (L14-56)
- @brief Installed package version (single version source).
- @details Read once from the packaging metadata `package.json` at the repository/package root (two directory levels above this module); the same constant feeds the CLI usage line (A-01), the version report (REQ-002), and the availability comparison (REQ-012). Resolution works identically inside the repository and inside an installed `node_modules` package because npm always ships `package.json` at the package root.
- @satisfies A-01 DES-001

### mod `const versionCheck = require("./version_check")` (L15-56)
- @brief Installed package version (single version source).
- @details Read once from the packaging metadata `package.json` at the repository/package root (two directory levels above this module); the same constant feeds the CLI usage line (A-01), the version report (REQ-002), and the availability comparison (REQ-012). Resolution works identically inside the repository and inside an installed `node_modules` package because npm always ships `package.json` at the package root.
- @satisfies A-01 DES-001
- const `const VERSION = require(path.join(__dirname, "..", "..", "package.json")).version` (L28)
  - @brief Installed package version (single version source).
  - @details Read once from the packaging metadata `package.json` at the
repository/package root (two directory levels above this
module); the same constant feeds the CLI usage line (A-01),
the version report (REQ-002), and the availability comparison
(REQ-012). Resolution works identically inside the repository
and inside an installed `node_modules` package because npm
always ships `package.json` at the package root.
  - @satisfies A-01 DES-001

### fn `async function main(argv)` (L67-108)
- @brief Execute the gated version check, then dispatch commands.
- @details Dispatch order: `--help` or no arguments -> help screen;
`--ver` / `--version` -> aligned three-row version report
fetching npm and GitHub with the gate bypassed (REQ-002,
REQ-027..REQ-031); then `--upgrade`, optionally with the
`--develop` (or its `--dev` alias, REQ-048) source modifier
selecting the GitHub develop branch (REQ-032..REQ-034) and
the `--force` auxiliary modifier forcing the full
re-download and reinstallation (REQ-035..REQ-038); then
`--uninstall`; then the additive
configuration CLI commands `--get`, `--set`, `--unset`,
`--print-raw`, `--print`, `--info` (PRJ-006); unknown input
falls back to the help screen. Non-forced invocations
execute the gated npm check before dispatch (REQ-007),
suppressed entirely when the configuration switch
`version_check:disable-version-check` is enabled (REQ-043)
and always restored when the configuration is unreadable or
missing (REQ-044); `--ver` / `--version` bypass both the
gate and the switch (REQ-045). Existing management dispatch
and observable behavior are unchanged by the configuration
branches (REQ-016..REQ-021). The `--develop` / `--dev`
(REQ-034, REQ-048) and `--force` (REQ-038) modifiers
dispatch no upgrade on their own and fall back to the help
screen. Complexity:
O(args + network) network-bound.
- @param {string[]} [argv] CLI arguments excluding the program name;
undefined resolves to `process.argv.slice(2)`.
- @return {Promise<number>} Process exit code: 0 on handled dispatch, or
the return code of the spawned `npm` subprocess for
`--upgrade` / `--uninstall`, or 1 for configuration CLI
failures (REQ-023).
- @satisfies REQ-001 REQ-002 REQ-007 REQ-016 REQ-017 REQ-018 REQ-019
REQ-020 REQ-021 REQ-027 REQ-028 REQ-029 REQ-030 REQ-031
REQ-032 REQ-033 REQ-034 REQ-035 REQ-036 REQ-037 REQ-038
REQ-042 REQ-043 REQ-044 REQ-045 REQ-048 A-06 PRJ-006

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`path`|mod||11-56||
|`config`|mod||12-56||
|`configRender`|mod||13-56||
|`management`|mod||14-56||
|`versionCheck`|mod||15-56||
|`versionCheck.VERSION`|const||28||
|`main`|fn||67-108|async function main(argv)|


---

# index.js | JavaScript | 16L | 1 symbols | 0 imports | 1 comments
> Path: `src/githubtemplatenodejs/index.js`
- @brief Expose package-level metadata and public CLI entrypoint symbols.
- @details Defines stable module exports for downstream `require`
consumers and runtime version checks, mirroring the skeleton
schema (DES-004). `version` equals the single version source
consumed by `core.main`; `main` is the CLI dispatcher.
- @satisfies DES-004

## Definitions

### mod `const core = require("./core")` (L11-16)

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`core`|mod||11-16||


---

# main.js | JavaScript | 22L | 0 symbols | 0 imports | 1 comments
> Path: `src/githubtemplatenodejs/main.js`
- @brief Execute githubtemplatenodejs CLI as the npm `bin` entry point.
- @details Invoked by the `githubtemplatenodejs` executable created by
`npm install -g` and `npx` (PRJ-001, DES-003); imports the
canonical `main` dispatcher and forwards the resolved exit
status to the process boundary. An unexpected dispatcher
rejection terminates with status 1 and the diagnostic on
stderr.
- @satisfies PRJ-001 DES-003 DES-004


---

# management.js | JavaScript | 362L | 15 symbols | 0 imports | 16 comments
> Path: `src/githubtemplatenodejs/management.js`
- @brief Management commands of githubtemplatenodejs, isolated from core
dispatch logic (DES-005).
- @details Implements exact help-screen rendering (REQ-001, REQ-039),
`npm` global install and uninstall lifecycle with Linux-only
execution gating (CTN-009), and the manual-command fallback
for non-Linux platforms (REQ-004, REQ-006, REQ-033). Every
upgrading argv is exported as a byte-exact constant so tests
can assert the literal strings mandated by the SRS.

## Definitions

- const `const PROGRAM_NAME = "githubtemplatenodejs";` (L21)
- @brief Canonical program name used across help text and npm commands.
- @details Equals the npm package name and the single `bin` entry point
name (A-11); drives every help-screen line (REQ-001) and the
npm operand of every management argv (REQ-003, REQ-005).
- const `const UPGRADE_COMMAND = [` (L33)
- @brief Exact `npm install -g` argv executed on Linux by `--upgrade`
without `--force` (REQ-003).
- @details `UPGRADE_COMMAND.join(" ")` equals the literal string mandated
by REQ-003 and is printed verbatim as the manual command on
non-Linux platforms (REQ-004). Source resolves from the npm
registry; the standard upgrade applies no forcing option
(REQ-037).
- @satisfies REQ-003 REQ-004 REQ-037
- const `const UPGRADE_FORCE_COMMAND = [` (L50)
- @brief Exact forced `npm install -g` argv executed on Linux by
`--upgrade --force` (REQ-035).
- @details `UPGRADE_FORCE_COMMAND.join(" ")` equals the literal string
mandated by REQ-035 and is printed verbatim as the manual
command on non-Linux platforms (REQ-004). The `--force`
option forces the full re-download and complete
reinstallation of the package from the npm registry (REQ-037).
- @satisfies REQ-035 REQ-037
- const `const UPGRADE_DEVELOP_COMMAND = [` (L69)
- @brief Exact develop-source `npm install -g` argv executed on Linux by
`--upgrade --develop` / `--upgrade --dev` without `--force`
(REQ-032, REQ-048).
- @details `UPGRADE_DEVELOP_COMMAND.join(" ")` equals the literal string
mandated by REQ-032 and is printed verbatim as the manual
command on non-Linux platforms (REQ-033). The `#develop`
fragment pins the source to the tip of the `develop` branch;
no `--force` applies to the non-forced variant (REQ-037).
- @satisfies REQ-032 REQ-033 REQ-037 REQ-048
- const `const UPGRADE_DEVELOP_FORCE_COMMAND = [` (L88)
- @brief Exact forced develop-source `npm install -g` argv executed on
Linux by `--upgrade --develop --force` / `--upgrade --dev
--force` (REQ-036, REQ-048).
- @details `UPGRADE_DEVELOP_FORCE_COMMAND.join(" ")` equals the literal
string mandated by REQ-036 and is printed verbatim as the
manual command on non-Linux platforms (REQ-033). The
`#develop` fragment pins the source to the tip of the
`develop` branch; `--force` forces the full re-download and
complete reinstallation (REQ-037).
- @satisfies REQ-036 REQ-037 REQ-048
- const `const UNINSTALL_COMMAND = [` (L104)
- @brief Exact `npm uninstall -g` argv executed on Linux by `--uninstall`
(REQ-005).
- @details `UNINSTALL_COMMAND.join(" ")` equals the literal string
mandated by REQ-005 and is printed verbatim as the manual
command on non-Linux platforms (REQ-006).
- @satisfies REQ-005 REQ-006
- const `const FLAG_COLUMN_WIDTH = "--uninstall".length;` (L118)
- @brief Flag column width keeping management help lines aligned.
- @details Equals the length of the longest documented flag
`--uninstall` (11 characters); every entry line pads its flag
to this width before the ` - ` separator (REQ-001 alignment).
- @satisfies REQ-001
### fn `function isLinux()` (L127-129)
- @brief Report whether the current operating system is Linux.
- @details `process.platform` identity check; all other platforms take
the manual-command branch (A-09). Complexity: O(1).
- @return {boolean} True on Linux, false otherwise.
- @satisfies A-09 CTN-009

### fn `function managementEntry(flag, description)` (L141-144)
- @brief Render one aligned help-screen entry line.
- @details Flag is padded with trailing spaces to `FLAG_COLUMN_WIDTH`,
then ` - ` and the description follow (REQ-001 template).
Complexity: O(width + description length).
- @param {string} flag Command or option flag (e.g. `--upgrade`).
- @param {string} description Description text placed after the dash.
- @return {string} Line matching the REQ-001 template alignment.
- @satisfies REQ-001 REQ-039

### fn `function upgradeCommand(develop, force)` (L161-166)
- @brief Select the exact upgrade argv for the requested variant.
- @details Mapping mandated by the SRS: `(false, false)` ->
UPGRADE_COMMAND (REQ-003), `(false, true)` ->
UPGRADE_FORCE_COMMAND (REQ-035), `(true, false)` ->
UPGRADE_DEVELOP_COMMAND (REQ-032), `(true, true)` ->
UPGRADE_DEVELOP_FORCE_COMMAND (REQ-036). Forcing options are
applied only when `force` is true; non-forced variants
upgrade without `--force` (REQ-037). Complexity: O(1).
- @param {boolean} develop True selects the GitHub develop-branch source
(`--develop` / `--dev` alias, REQ-048).
- @param {boolean} force True selects the forced reinstallation variant.
- @return {string[]} Exact argv of the requested upgrade variant.
- @satisfies REQ-003 REQ-032 REQ-035 REQ-036 REQ-037 REQ-048

### fn `function buildHelpText(version)` (L183-256)
- @brief Render the full help screen text (REQ-001 template).
- @details The literal `(x.y.z)` slot of the template receives the
installed version (A-01); the `Management Commands:` section
lists every management command, the
`Configuration Commands:` section lists every configuration
command (REQ-039, A-02), and the `Options:` section documents
the `--develop` / `--dev` (REQ-048) and `--force` modifiers
of `--upgrade`.
Complexity: O(lines) over the fixed template.
- @param {string} version Installed version in `x.y.z` format.
- @return {string} Help text without trailing newline; the caller prints
it.
- @satisfies REQ-001 REQ-039 A-01 A-02

### fn `function printHelp(version)` (L267-270)
- @brief Print the full help screen to stdout.
- @details Emits exactly one trailing newline after the help text;
stdout carries no other content. Side effect: one stdout
write. Complexity: O(help text length).
- @param {string} version Installed version in `x.y.z` format.
- @return {number} Always 0.
- @satisfies REQ-001 PRJ-005

### fn `function runCommand(argv)` (L284-291)
- @brief Execute one external command argv synchronously, inheriting the
standard streams.
- @details Delegates to `child_process.spawnSync` with `stdio:
"inherit"` so the child writes directly to the terminal.
Test seam: dispatches through `module.exports`, so unit tests
replace this function with `mock.method` to capture the exact
argv without spawning a process.
- @param {string[]} argv Exact command argv; element 0 is the program.
- @return {number} Child exit status; 1 when the child could not spawn.
- @satisfies REQ-003 REQ-005 REQ-032 REQ-035 REQ-036 CTN-009

### fn `function cmdUpgrade(develop, force)` (L317-327)
- @brief Upgrade the tool via the installed `npm` CLI on Linux.
- @details On Linux the exact argv selected by `develop` and `force`
executes synchronously with inherited streams and its exit
code propagates: UPGRADE_COMMAND for the npm registry upgrade
(REQ-003), UPGRADE_FORCE_COMMAND for the forced npm registry
reinstallation (REQ-035), UPGRADE_DEVELOP_COMMAND for the
GitHub development reinstall (REQ-032), and
UPGRADE_DEVELOP_FORCE_COMMAND for the forced development
reinstallation (REQ-036); forcing options apply only when
`force` is true (REQ-037). On any other OS no process spawns;
a warning plus the matching manual command print instead
(REQ-004, REQ-033). Complexity: O(1) on the fallback path.
- @param {boolean} develop True selects the GitHub develop-branch source
(`--upgrade --develop` / `--upgrade --dev`, REQ-048); false
selects the npm registry source (default).
- @param {boolean} force True selects the forced full re-download and
reinstallation variant (`--upgrade --force`, REQ-037); false
executes the standard process without any forcing option.
- @return {number} 0 on manual fallback or successful subprocess;
otherwise the `npm` process exit code.
- @satisfies REQ-003 REQ-004 REQ-032 REQ-033 REQ-035 REQ-036 REQ-037
REQ-048 CTN-009

### fn `function cmdUninstall()` (L340-347)
- @brief Uninstall the tool via `npm uninstall -g` on Linux.
- @details On Linux the exact UNINSTALL_COMMAND argv executes
synchronously with inherited streams and its exit code
propagates. On any other OS no process spawns; a warning plus
the manual command print instead (REQ-006). Complexity: O(1)
on the fallback path.
- @return {number} 0 on manual fallback or successful subprocess;
otherwise the `npm` process exit code.
- @satisfies REQ-005 REQ-006 CTN-009

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PROGRAM_NAME`|const||21||
|`UPGRADE_COMMAND`|const||33||
|`UPGRADE_FORCE_COMMAND`|const||50||
|`UPGRADE_DEVELOP_COMMAND`|const||69||
|`UPGRADE_DEVELOP_FORCE_COMMAND`|const||88||
|`UNINSTALL_COMMAND`|const||104||
|`FLAG_COLUMN_WIDTH`|const||118||
|`isLinux`|fn||127-129|function isLinux()|
|`managementEntry`|fn||141-144|function managementEntry(flag, description)|
|`upgradeCommand`|fn||161-166|function upgradeCommand(develop, force)|
|`buildHelpText`|fn||183-256|function buildHelpText(version)|
|`printHelp`|fn||267-270|function printHelp(version)|
|`runCommand`|fn||284-291|function runCommand(argv)|
|`cmdUpgrade`|fn||317-327|function cmdUpgrade(develop, force)|
|`cmdUninstall`|fn||340-347|function cmdUninstall()|


---

# version_check.js | JavaScript | 618L | 33 symbols | 0 imports | 29 comments
> Path: `src/githubtemplatenodejs/version_check.js`
- @brief Online new-version check and dual-source version report executed
before CLI argument parsing.
- @details Queries the npm registry JSON API with a hardcoded 2 s timeout
(CTN-006) for the gated availability check, throttled through an
idle-time JSON cache under `$HOME` (CTN-008, DES-007), and
renders the aligned three-row report (`--ver`) fetching both the
npm registry and the GitHub releases API (REQ-002, REQ-027).
Notifications use the hardcoded ANSI colors of the embedded
internal color JSON (`colors.notificationColors`, REQ-026,
REQ-040). Success refreshes the cache with a 3600 s idle-delay;
any failure backs off 86400 s (CTN-007). Cache persistence is
best effort and never aborts dispatch (REQ-046).

## Definitions

### mod `const fs = require("fs")` (L17-28)

### mod `const https = require("https")` (L18-28)

### mod `const os = require("os")` (L19-28)

### mod `const path = require("path")` (L20-28)

### mod `const colors = require("./colors")` (L21-28)

- const `const NPM_JSON_ENDPOINT = "https://registry.npmjs.org/githubtemplatenodejs/latest";` (L32)
- @brief npm registry JSON API endpoint returning the latest published
version metadata (REQ-009, REQ-028).
- @details Payload shape: the version manifest of the latest published
release, carrying the latest version at the top-level
`version` field (`{"name": ..., "version": "x.y.z", ...}`);
hardcoded constant, not configurable (CTN-008).
- @satisfies REQ-009 REQ-028
- const `const GITHUB_RELEASES_ENDPOINT = (` (L41)
- @brief GitHub API endpoint returning the latest release metadata.
- @details Source of the report `Latest @ GitHub` row (REQ-029) and of
the `--upgrade --develop` download source (REQ-032);
hardcoded constant, not configurable (CTN-008).
- @satisfies REQ-029
- const `const HTTP_TIMEOUT_SECONDS = 2;` (L50)
- @brief HTTPS request timeout in seconds, hardcoded (CTN-006).
- @satisfies CTN-006
- const `const IDLE_DELAY_SUCCESS_SECONDS = 3600;` (L56)
- @brief Idle-delay in seconds after every successful check (CTN-007).
- @satisfies CTN-007 REQ-011 REQ-013
- const `const IDLE_DELAY_FAILURE_SECONDS = 86400;` (L62)
- @brief Idle-delay in seconds after any failed check (CTN-007).
- @satisfies CTN-007 REQ-011 REQ-015
- const `const CACHE_RELATIVE_SEGMENTS = [` (L68)
- @brief Cache file location segments relative to `$HOME` (DES-007).
- @satisfies DES-007 CTN-008
- const `const ANSI_RESET = "\u001b[0m";` (L81)
- @brief ANSI SGR reset suffix closing colored notifications.
- @details Notification prefix colors come from the hardcoded embedded
color JSON (`colors.notificationColors`, REQ-026); only the
reset suffix stays local.
- @satisfies REQ-026 DES-008
- const `const REPORT_LABEL_INSTALLED = "Current Installed";` (L87)
- @brief Report row label for the installed version (REQ-027).
- @satisfies REQ-027
- const `const REPORT_LABEL_NPM = "Latest @ npm";` (L93)
- @brief Report row label for the npm registry latest version (REQ-027).
- @satisfies REQ-027 REQ-028
- const `const REPORT_LABEL_GITHUB = "Latest @ GitHub";` (L99)
- @brief Report row label for the GitHub latest release version (REQ-027).
- @satisfies REQ-027 REQ-029
- const `const REPORT_LABEL_WIDTH = REPORT_LABEL_INSTALLED.length;` (L107)
- @brief Label pad width keeping report version columns aligned (REQ-027).
- @details Equals the length of the longest label
`Current Installed` (17 characters).
- @satisfies REQ-027
- const `const REPORT_UNKNOWN = "unknown";` (L114)
- @brief Placeholder replacing the version of a failed report source
before the reason suffix is appended (REQ-030).
- @satisfies REQ-030
### fn `function cachePath()` (L124-129)
- @brief Resolve the absolute cache file path from `$HOME`.
- @details Prefers the `HOME` environment variable (CTN-008); falls back
to `os.homedir()` when unset. Does not create directories.
Complexity: O(1).
- @return {string} Absolute cache file path.
- @satisfies DES-007 CTN-008

### fn `function readCache(cacheFile)` (L140-149)
- @brief Load the idle-time cache JSON document.
- @details Returns null when the file is absent, unreadable, unparsable,
or not a JSON object; callers treat null as cache-miss.
Complexity: O(file size).
- @param {string} cacheFile Cache file path.
- @return {Object|null} Parsed cache payload or null.
- @satisfies REQ-008

### fn `function humanTimestamp(epochSeconds)` (L158-161)
- @brief Format an epoch value as UTC ISO-8601.
- @details Renders `YYYY-MM-DDTHH:MM:SSZ` by stripping the millisecond
fraction from `Date.toISOString`. Complexity: O(1).
- @param {number} epochSeconds Epoch seconds to render.
- @return {string} Timestamp shaped `YYYY-MM-DDTHH:MM:SSZ`.

### fn `function writeCache(cacheFile, checkEpoch, idleDelaySeconds)` (L182-197)
- @brief Persist the four-field idle-time cache document.
- @details Creates missing parent directories. Field names follow A-03.
Persistence is best effort (REQ-046): any filesystem error
from directory creation or the file write is swallowed
silently, so a failing cache write never aborts the CLI,
never prints, and never changes the dispatch path; the next
gate evaluation simply treats the cache as a miss.
Complexity: O(payload size).
- @param {string} cacheFile Cache file path.
- @param {number} checkEpoch Epoch seconds of the check attempt.
- @param {number} idleDelaySeconds Idle-delay applied after this check.
- @return {undefined}
- @satisfies REQ-010 REQ-011 REQ-046 DES-007 A-03
- @post On write success the file holds exactly four fields:
last_check_epoch, last_check_human, idle_time_epoch,
idle_time_human; on write failure the prior cache state survives
as-is and callers continue normally.

### fn `function gateAllowsRequest(cache, nowEpoch)` (L209-218)
- @brief Evaluate the idle-time request gate.
- @details Gate opens on cache-miss (null), non-numeric
`idle_time_epoch`, or `nowEpoch >= idleTimeEpoch`; otherwise
it stays closed. Complexity: O(1).
- @param {Object|null} cache Parsed cache payload or null.
- @param {number} nowEpoch Current epoch seconds.
- @return {boolean} True when an HTTPS request is permitted.
- @satisfies REQ-008

### fn `function parseVersion(version)` (L233-251)
- @brief Parse a dotted version string into a comparable component array.
- @details Strips one leading `v`/`V` prefix, then maps every
dot-separated component to its leading ASCII-digit value
(REQ-047): `0.0.1rc1` -> `[0, 0, 1]`; a component without
leading digits evaluates as 0. Tolerant parsing never throws,
so no published version string is ever reported as a check
failure. Complexity: O(len(version)).
- @param {string} version Version or release tag (e.g. `v1.2.3rc1`).
- @return {number[]} Comparable component array; missing components
compare as zero through `compareVersions`.
- @satisfies REQ-047

### fn `function compareVersions(left, right)` (L264-274)
- @brief Compare two version component arrays element-wise.
- @details Missing components compare as zero (REQ-047), so `[0, 0, 1]`
< `[0, 0, 1, 0]` is false and `[0, 0, 7]` < `[0, 0, 7, 1]` is
true. Complexity: O(max(len(a), len(b))).
- @param {number[]} left Left component array from `parseVersion`.
- @param {number[]} right Right component array from `parseVersion`.
- @return {number} Negative when left < right, positive when
left > right, 0 when equal.
- @satisfies REQ-047

### fn `function fetchJson(url, headers, timeoutSeconds)` (L299-338)
- @brief GET one HTTPS URL and resolve its JSON payload.
- @details Uses the Node.js standard library `https` module (A-08); no
third-party HTTP library. Applies `timeoutSeconds` via the
socket timeout: on expiry the request is destroyed and the
promise rejects with a timeout Error naming the configured
seconds. HTTP status codes >= 400 reject with an Error naming
the status code (e.g. `HTTP Error 503: Service Unavailable`).
Unparsable bodies reject with an invalid-JSON Error. Test
seam: dispatches through `module.exports`, so unit tests
replace this function with `mock.method` to inject static
payloads or failures without any network I/O.
Complexity: O(body size).
- @param {string} url Absolute HTTPS URL to fetch.
- @param {Object} [headers] Additional request headers (optional).
- @param {number} [timeoutSeconds] Timeout in seconds; defaults to
`HTTP_TIMEOUT_SECONDS` (CTN-006).
- @return {Promise<Object|string>} Parsed JSON payload.
- @throws {Error} On network failure, timeout expiry, HTTP status >= 400,
or unparsable JSON payload; the message names the encountered
error.
- @satisfies A-08 CTN-006

### fn `async function fetchLatestNpmVersion()` (L353-364)
- @brief GET the npm registry payload and extract the latest version.
- @details Sends a plain GET to the npm registry JSON API; no Accept
header is required. The `/latest` endpoint responds with the
version manifest of the latest published release, carrying
the latest version at the top-level `version` field.
Complexity: O(body size).
- @return {Promise<string>} Latest published version in `x.y.z` format.
- @throws {Error} On HTTP and network failures (e.g. HTTP 429, 503),
on the 2-second timeout expiry, or on unparsable payload or
missing version.
- @satisfies REQ-009 REQ-028 CTN-006

### fn `async function fetchLatestGithubVersion()` (L381-397)
- @brief GET the latest GitHub release payload and extract its version.
- @details Sends the GitHub-mandatory `User-Agent` header next to the
`Accept` header; the GitHub API rejects requests without a
`User-Agent` header with HTTP 403 Forbidden. Strips one
leading `v`/`V` prefix from `tag_name`; the returned value is
exactly the version downloaded by `--upgrade --develop`
(REQ-032) regardless of the branch the release was tagged on.
Complexity: O(body size).
- @return {Promise<string>} Latest release version in `x.y.z` format.
- @throws {Error} On HTTP and network failures (e.g. HTTP 429, 503),
on the 2-second timeout expiry, or on unparsable payload or
missing tag_name.
- @satisfies REQ-029 CTN-006

### fn `function formatReportRow(label, value)` (L409-412)
- @brief Render one report row with the label padded to 17 columns.
- @details Label is padded with trailing spaces to
`REPORT_LABEL_WIDTH` (REQ-027). Complexity: O(17 + value).
- @param {string} label Row label (e.g. `Latest @ npm`).
- @param {string} value Version string or `unknown (<reason>)`
placeholder.
- @return {string} Row shaped `<label padded to 17> : <value>` (REQ-027).
- @satisfies REQ-027

### fn `function unknownValue(reason)` (L425-430)
- @brief Render the failed-source placeholder with its reason.
- @details REQ-030 mandates the `unknown (<reason>)` shape, where
`<reason>` names the actually encountered error (e.g. an HTTP
429/503 response or a timeout); an empty reason degrades to
the bare `unknown` placeholder. Complexity: O(reason).
- @param {string} reason String rendering of the encountered error.
- @return {string} `unknown (<reason>)`, or `unknown` when reason is
empty.
- @satisfies REQ-030

### fn `function printColored(color, message)` (L441-443)
- @brief Print a message wrapped in an ANSI color prefix and reset.
- @details Exactly one stdout line: prefix + message + `ANSI_RESET` +
newline. Side effect: one stdout write. Complexity: O(message).
- @param {string} color ANSI SGR prefix (bright green or bright red).
- @param {string} message Plain-text message content.
- @return {undefined}
- @satisfies DES-008 REQ-026

### fn `function reportFailure(checkEpoch, error, color)` (L455-462)
- @brief Emit the failure note and write the 86400 s cache.
- @details The note renders with the hardcoded error color (REQ-026);
the cache write is best effort (REQ-046). Complexity: O(1).
- @param {number} checkEpoch Epoch seconds of the failed attempt.
- @param {Error} error Encountered error rendered in the note.
- @param {string} color ANSI SGR prefix for the failure note.
- @return {undefined}
- @satisfies REQ-014 REQ-015 REQ-026 REQ-046 A-05

### fn `async function runVersionCheck(installedVersion, force)` (L486-514)
- @brief Execute the gated (or forced) online version check on npm.
- @details Flow: cache read -> gate evaluation (skipped when `force`) ->
npm registry fetch -> version compare -> notify -> cache
write. Notification colors come from the hardcoded embedded
color JSON (REQ-026, REQ-040). Success always refreshes the
cache with the 3600 s idle-delay (REQ-013, A-04); fetch or
parse failures print the hardcoded error note and back off
86400 s (REQ-014, REQ-015, A-05). The promise always resolves
normally; callers continue parsing (A-06). Complexity:
O(body size) network-bound.
- @param {string} installedVersion Installed version in `x.y.z` format.
- @param {boolean} [force] True bypasses the idle-time gate (REQ-002,
REQ-007).
- @return {Promise<undefined>} Resolves regardless of the check outcome.
- @note The caller in `core.main` suppresses this call when the
configuration switch `version_check:disable-version-check` is
enabled (REQ-043); `--ver` / `--version` run the report instead
and stay active regardless of the switch (REQ-045).
- @satisfies REQ-007 REQ-008 REQ-009 REQ-010 REQ-011 REQ-012 REQ-013
REQ-014 REQ-015 REQ-026 REQ-046 REQ-047

### fn `async function runVersionReport(installedVersion)` (L537-590)
- @brief Execute the forced dual-source version report (`--ver`).
- @details Flow: fetch npm registry -> fetch GitHub releases -> emit the
three aligned rows. Each failed fetch emits one bright red
note naming the failed source with the hardcoded error color
(REQ-030) and its row prints `unknown (<reason>)`, carrying
the actually encountered error, in place of the version
(REQ-030). Rows print in order: installed, npm, GitHub;
version columns aligned via a 17-character label pad
(REQ-027). The GitHub row shows the latest release tag
stripped of its `v` prefix, exactly the version downloaded by
`--upgrade --develop` (REQ-029). The idle-time gate and cache
file are bypassed for the fetches (REQ-002); the cache write
follows the npm outcome only: 3600 s on success, 86400 s on
failure (REQ-031). The promise always resolves normally
(A-06). Complexity: O(body sizes) network-bound.
- @param {string} installedVersion Installed version in `x.y.z` format.
- @return {Promise<undefined>} Resolves after the report printed.
- @satisfies REQ-002 REQ-026 REQ-027 REQ-028 REQ-029 REQ-030 REQ-031
REQ-045 REQ-046

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`fs`|mod||17-28||
|`https`|mod||18-28||
|`os`|mod||19-28||
|`path`|mod||20-28||
|`colors`|mod||21-28||
|`NPM_JSON_ENDPOINT`|const||32||
|`GITHUB_RELEASES_ENDPOINT`|const||41||
|`HTTP_TIMEOUT_SECONDS`|const||50||
|`IDLE_DELAY_SUCCESS_SECONDS`|const||56||
|`IDLE_DELAY_FAILURE_SECONDS`|const||62||
|`CACHE_RELATIVE_SEGMENTS`|const||68||
|`ANSI_RESET`|const||81||
|`REPORT_LABEL_INSTALLED`|const||87||
|`REPORT_LABEL_NPM`|const||93||
|`REPORT_LABEL_GITHUB`|const||99||
|`REPORT_LABEL_WIDTH`|const||107||
|`REPORT_UNKNOWN`|const||114||
|`cachePath`|fn||124-129|function cachePath()|
|`readCache`|fn||140-149|function readCache(cacheFile)|
|`humanTimestamp`|fn||158-161|function humanTimestamp(epochSeconds)|
|`writeCache`|fn||182-197|function writeCache(cacheFile, checkEpoch, idleDelaySeconds)|
|`gateAllowsRequest`|fn||209-218|function gateAllowsRequest(cache, nowEpoch)|
|`parseVersion`|fn||233-251|function parseVersion(version)|
|`compareVersions`|fn||264-274|function compareVersions(left, right)|
|`fetchJson`|fn||299-338|function fetchJson(url, headers, timeoutSeconds)|
|`fetchLatestNpmVersion`|fn||353-364|async function fetchLatestNpmVersion()|
|`fetchLatestGithubVersion`|fn||381-397|async function fetchLatestGithubVersion()|
|`formatReportRow`|fn||409-412|function formatReportRow(label, value)|
|`unknownValue`|fn||425-430|function unknownValue(reason)|
|`printColored`|fn||441-443|function printColored(color, message)|
|`reportFailure`|fn||455-462|function reportFailure(checkEpoch, error, color)|
|`runVersionCheck`|fn||486-514|async function runVersionCheck(installedVersion, force)|
|`runVersionReport`|fn||537-590|async function runVersionReport(installedVersion)|


---

# core.js | JavaScript | 13L | 0 symbols | 0 imports | 1 comments
> Path: `src/templatenodejs/core.js`
- @brief Skeleton-schema core bridge of the renamed skeleton copy.
- @details Keeps the skeleton schema imports (`require("./core")`)
resolvable (CTN-004, CTN-005) while delegating the CLI
dispatch to the distributed application core under
`src/githubtemplatenodejs/`, so local launcher execution
(PRJ-002, CTN-013) runs the full CLI instead of a
placeholder. Complexity: O(1) re-export.
- @satisfies PRJ-002 CTN-004 CTN-005 CTN-013


---

# main.js | JavaScript | 23L | 0 symbols | 0 imports | 1 comments
> Path: `src/templatenodejs/main.js`
- @brief Execute the renamed skeleton CLI entry when invoked with
`node src/templatenodejs/main.js`.
- @details Launcher entry of the renamed skeleton copy (CTN-004,
CTN-013): `scripts/templatenodejs.sh` delegates local
execution through this file (PRJ-002), which forwards to the
skeleton `core` module and propagates the dispatcher exit
status to the process boundary. An unexpected dispatcher
rejection terminates with status 1 and the diagnostic on
stderr.
- @satisfies PRJ-002 CTN-004 CTN-013

