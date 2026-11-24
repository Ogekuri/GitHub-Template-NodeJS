"use strict";
/**
 * @file config.js
 * @brief Configuration subsystem: canonical schema, strict validation,
 *        atomic JSON persistence, path resolution, and CLI handlers.
 * @details Single source of truth driving parsing, validation, defaults,
 *          path discovery, and configuration output (DES-010). State
 *          persists as JSON at `$HOME/.config/githubtemplatenodejs/
 *          config.json`. Version-check transport parameters (endpoint,
 *          timeout, idle-delays) stay hardcoded (CTN-008) and are not
 *          part of the schema; the automatic-check enable/disable switch
 *          is schema state (REQ-042). Handlers emit valid output on
 *          stdout only, report failures on stderr with exit status 1,
 *          and never mutate state on rejected operations (REQ-023).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * @brief Global configuration directory segments relative to `$HOME`.
 * @details Mirrors the version-check cache isolation policy (CTN-008).
 */
const CONFIG_DIR_SEGMENTS = [".config", "githubtemplatenodejs"];

/**
 * @brief Global configuration JSON file name.
 * @details Fixed file name under the configuration directory (DES-007
 *          convention); no project-local configuration layer exists.
 */
const CONFIG_FILE_NAME = "config.json";

/**
 * @brief Canonical token of the version-check schema section.
 * @details First-level CLI path token (REQ-022); case-sensitive.
 * @satisfies REQ-042
 */
const VERSION_CHECK_SECTION_TOKEN = "version_check";

/**
 * @brief Canonical token of the automatic-check suppression parameter.
 * @details Second-level CLI path token (REQ-022); case-sensitive.
 * @satisfies REQ-042
 */
const DISABLE_VERSION_CHECK_PARAM_TOKEN = "disable-version-check";

/**
 * @brief Ordered allowed values of the suppression parameter (Selection).
 * @satisfies REQ-042
 */
const DISABLE_VERSION_CHECK_ENUM = ["no", "yes"];

/**
 * @brief Enum token suppressing the automatic online check (REQ-043).
 * @satisfies REQ-043
 */
const DISABLE_VERSION_CHECK_ENABLED_VALUE = "yes";

/**
 * @brief Schema default keeping the automatic online check enabled.
 * @satisfies REQ-042
 */
const DISABLE_VERSION_CHECK_DEFAULT_VALUE = "no";

/**
 * @brief Immutable schema descriptor of one configuration parameter.
 * @details `token` equals the CLI path token byte for byte (REQ-022);
 *          drives parsing, validation, defaults, display, and
 *          documentation (DES-010). Instances are frozen after creation.
 * @property {string} token Canonical CLI path token of the parameter.
 * @property {string} typeLabel Schema type label rendered in `--info`
 *           headings.
 * @property {string} description Concise English description rendered in
 *           `--info`.
 * @property {string} default Schema default value restored by `--unset`
 *           (REQ-018).
 * @property {string[]} enumValues Ordered allowed values for Selection
 *           parameters.
 * @satisfies DES-010
 */
function paramSpec(token, typeLabel, description, defaultValue, enumValues) {
    return Object.freeze({
        token,
        typeLabel,
        description,
        "default": defaultValue,
        "enum": Object.freeze([...enumValues]),
        /**
         * @brief Constraints fragment rendered after the type label.
         * @return {string} Constraint summary, e.g. `2 allowed values`.
         */
        get constraints() {
            return this.enum.length + " allowed values";
        },
    });
}

/**
 * @brief Immutable schema descriptor of one fixed-schema section.
 * @details Fixed-schema dictionary branch; whole-section `--set`
 *          replaces the branch with a schema-compatible JSON object and
 *          `--unset` restores all parameter defaults (REQ-018).
 *          Instances are frozen after creation.
 * @property {string} token Canonical CLI path token of the section.
 * @property {string} description Concise English description rendered in
 *           `--print`/`--info`.
 * @property {Array} params Ordered parameter descriptors of the section.
 * @satisfies DES-010
 */
function sectionSpec(token, description, params) {
    return Object.freeze({
        token,
        description,
        params: Object.freeze([...params]),
        /**
         * @brief Look up a parameter descriptor by canonical token.
         * @details Case-sensitive byte-exact token match (REQ-022).
         *          Complexity: O(params).
         * @param {string} paramToken Exact parameter path token.
         * @return {Object|null} Matching descriptor; null if absent.
         */
        param(paramToken) {
            for (const candidate of this.params) {
                if (candidate.token === paramToken) {
                    return candidate;
                }
            }
            return null;
        },
    });
}

/**
 * @brief Canonical configuration schema (DES-010).
 * @details Insertion order defines canonical display order. The schema
 *          defines the `version_check` section holding the
 *          `disable-version-check` Selection switch (REQ-042);
 *          transport parameters stay hardcoded constants (CTN-008) and
 *          notification colors stay hardcoded in the embedded internal
 *          color JSON of `colors.js` (REQ-040).
 * @satisfies DES-010 REQ-042 CTN-008
 */
const SCHEMA = Object.freeze([
    sectionSpec(
        VERSION_CHECK_SECTION_TOKEN,
        "Online version check executed before argument parsing.",
        [
            paramSpec(
                DISABLE_VERSION_CHECK_PARAM_TOKEN,
                "Selection",
                "Disable the automatic online version check executed"
                + " before argument parsing; --ver and --version stay"
                + " active.",
                DISABLE_VERSION_CHECK_DEFAULT_VALUE,
                DISABLE_VERSION_CHECK_ENUM,
            ),
        ],
    ),
]);

/**
 * @brief Schema token to SectionSpec map for O(1) path resolution.
 * @details Module-private index; cross-module consumers MUST use the
 *          public `section()` API (DES-058).
 * @satisfies DES-058
 */
const SECTIONS_BY_TOKEN = new Map(
    SCHEMA.map((schemaSection) => [schemaSection.token, schemaSection]),
);

/**
 * @brief Look up one schema section descriptor by canonical token.
 * @details Public schema access point (DES-058): cross-module consumers
 *          (renderers, documentation builders) resolve sections through
 *          this API instead of module-private indices; `token` equals
 *          the CLI path token byte for byte (REQ-022). Complexity: O(1).
 * @param {string} token Exact section path token (case-sensitive).
 * @return {Object|null} Matching descriptor; null if absent.
 * @satisfies DES-010 DES-058
 */
function section(token) {
    return SECTIONS_BY_TOKEN.get(token) === undefined
        ? null
        : SECTIONS_BY_TOKEN.get(token);
}

/**
 * @brief Configuration error carrying a user-facing diagnostic.
 * @details Raised for invalid paths, values, JSON, validation failures,
 *          and unrecoverable filesystem conditions; handlers render the
 *          message on stderr and exit 1 (REQ-023).
 * @satisfies REQ-023
 */
class ConfigError extends Error {
    /**
     * @brief Construct the error with its user-facing diagnostic.
     * @param {string} message Complete diagnostic message.
     */
    constructor(message) {
        super(message);
        this.name = "ConfigError";
    }
}

/**
 * @brief Resolve the absolute global configuration file path.
 * @details Prefers the `HOME` environment variable (CTN-008 consistency
 *          with the version-check cache); falls back to `os.homedir()`
 *          when unset. No project-local configuration layer exists.
 *          Complexity: O(1).
 * @return {string} Absolute path of the global configuration JSON file.
 * @satisfies CTN-008
 */
function configPath() {
    const base = (
        process.env.HOME !== undefined && process.env.HOME !== ""
        ? process.env.HOME
        : os.homedir()
    );
    return path.join(base, ...CONFIG_DIR_SEGMENTS, CONFIG_FILE_NAME);
}

/**
 * @brief Build the schema-default configuration payload.
 * @details Section token to parameter token to default value, in
 *          canonical schema order. Complexity: O(sections * params).
 * @return {Object<string, Object<string, string>>} Schema-default
 *         configuration payload.
 * @satisfies REQ-018 DES-010
 */
function defaultConfig() {
    const payload = {};
    for (const schemaSection of SCHEMA) {
        const branch = {};
        for (const schemaParam of schemaSection.params) {
            branch[schemaParam.token] = schemaParam.default;
        }
        payload[schemaSection.token] = branch;
    }
    return payload;
}

/**
 * @brief Validate a complete configuration against the schema.
 * @details Strict validation: JSON object root, exact section key set,
 *          exact parameter key set per section, and Selection values
 *          restricted to the parameter enum. Throws without mutation;
 *          callers reject the operation on error. Complexity:
 *          O(sections * params).
 * @param {Object} payload Parsed JSON configuration payload.
 * @return {undefined}
 * @throws {ConfigError} On root-type, section-key, parameter-key, or
 *         enum-membership mismatch; message names the offending path.
 * @satisfies DES-010 REQ-017 REQ-023
 */
function validateConfig(payload) {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new ConfigError(
            "configuration root must be a JSON object; got "
            + describeType(payload),
        );
    }
    const expectedSections = [...SECTIONS_BY_TOKEN.keys()];
    const actualSections = Object.keys(payload);
    const unknownSections = sortedDifference(actualSections, expectedSections);
    const missingSections = sortedDifference(expectedSections, actualSections);
    if (unknownSections.length > 0 || missingSections.length > 0) {
        throw new ConfigError(
            "configuration sections mismatch"
            + (unknownSections.length > 0
                ? "; unknown sections: " + JSON.stringify(unknownSections)
                : "")
            + (missingSections.length > 0
                ? "; missing sections: " + JSON.stringify(missingSections)
                : ""),
        );
    }
    for (const schemaSection of SCHEMA) {
        const branch = payload[schemaSection.token];
        if (branch === null || typeof branch !== "object" || Array.isArray(branch)) {
            throw new ConfigError(
                "section " + schemaSection.token + " must be a JSON object; got "
                + describeType(branch),
            );
        }
        const expectedParams = schemaSection.params.map((schemaParam) => schemaParam.token);
        const actualParams = Object.keys(branch);
        const unknownParams = sortedDifference(actualParams, expectedParams);
        const missingParams = sortedDifference(expectedParams, actualParams);
        if (unknownParams.length > 0 || missingParams.length > 0) {
            throw new ConfigError(
                "section " + schemaSection.token + " parameters mismatch"
                + (unknownParams.length > 0
                    ? "; unknown: " + JSON.stringify(unknownParams)
                    : "")
                + (missingParams.length > 0
                    ? "; missing: " + JSON.stringify(missingParams)
                    : ""),
            );
        }
        for (const schemaParam of schemaSection.params) {
            const value = branch[schemaParam.token];
            if (typeof value !== "string" || !schemaParam.enum.includes(value)) {
                throw new ConfigError(
                    "invalid value for " + schemaSection.token + ":"
                    + schemaParam.token + ": " + JSON.stringify(value)
                    + "; allowed values: " + schemaParam.enum.join(", "),
                );
            }
        }
    }
}

/**
 * @brief Describe the JSON type name of one value for diagnostics.
 * @details Maps null, arrays, and plain objects to the vocabulary used by
 *          validation messages. Complexity: O(1).
 * @param {*} value Any JSON value.
 * @return {string} Human-readable JSON type name.
 */
function describeType(value) {
    if (value === null) {
        return "null";
    }
    if (Array.isArray(value)) {
        return "array";
    }
    return typeof value;
}

/**
 * @brief Compute the sorted symmetric difference fragment of two arrays.
 * @details Returns the sorted elements of `left` absent from `right`.
 *          Complexity: O(n log n).
 * @param {string[]} left Candidate tokens.
 * @param {string[]} right Expected tokens.
 * @return {string[]} Sorted tokens present in left but not in right.
 */
function sortedDifference(left, right) {
    const rightSet = new Set(right);
    return left.filter((token) => !rightSet.has(token)).sort();
}

/**
 * @brief Persist a validated payload atomically (DES-014).
 * @details Writes a same-directory temporary file, flushes and fsyncs
 *          it, preserves the prior target file mode, atomically replaces
 *          the target with `fs.renameSync`, and fsyncs the parent
 *          directory where the platform supports it. The prior valid
 *          file survives any failure before the replace; on failure the
 *          temporary file is removed. Complexity: O(payload size).
 * @param {string} filePath Target configuration file path.
 * @param {Object} payload Schema-validated payload to store.
 * @return {undefined}
 * @throws {ConfigError} When directory creation or the write/replace
 *         sequence fails; the original file stays untouched.
 * @post On success the file holds exactly the serialized payload with
 *       two-space indentation and a trailing newline.
 * @satisfies DES-014
 */
function atomicWriteJson(filePath, payload) {
    const text = JSON.stringify(payload, null, 2) + "\n";
    const targetDir = path.dirname(filePath);
    let priorMode = null;
    let descriptor = -1;
    let temporaryName;
    try {
        fs.mkdirSync(targetDir, { recursive: true });
        try {
            priorMode = fs.statSync(filePath).mode & 0o777;
        } catch (statError) {
            priorMode = null;
        }
        temporaryName = path.join(
            targetDir,
            path.basename(filePath) + "." + process.pid + "."
            + Date.now() + ".tmp",
        );
        descriptor = fs.openSync(temporaryName, "wx", 0o600);
    } catch (error) {
        throw new ConfigError("cannot prepare configuration write: " + error.message);
    }
    try {
        fs.writeFileSync(descriptor, text, "utf8");
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = -1;
        if (priorMode !== null) {
            fs.chmodSync(temporaryName, priorMode);
        }
        fs.renameSync(temporaryName, filePath);
    } catch (error) {
        if (descriptor >= 0) {
            try {
                fs.closeSync(descriptor);
            } catch (closeError) {
                /* descriptor already closed */
            }
        }
        try {
            fs.unlinkSync(temporaryName);
        } catch (unlinkError) {
            /* temporary file already gone */
        }
        throw new ConfigError("cannot persist configuration: " + error.message);
    }
    try {
        const directoryDescriptor = fs.openSync(targetDir, "r");
        try {
            fs.fsyncSync(directoryDescriptor);
        } finally {
            fs.closeSync(directoryDescriptor);
        }
    } catch (error) {
        /* directory fsync is platform-dependent; persistence already succeeded */
    }
}

/**
 * @brief Create missing directories and initialize missing defaults.
 * @details Applicable configuration commands call this before
 *          executing. Never overwrites an existing file, valid or not;
 *          strict loaders surface invalid files as errors.
 *          Complexity: O(1) filesystem-bound.
 * @return {undefined}
 * @throws {ConfigError} When directories cannot be created or the
 *         default file cannot be written.
 * @satisfies REQ-016 REQ-017 REQ-018 REQ-019 REQ-020 REQ-021
 */
function ensureBootstrapped() {
    const filePath = configPath();
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        if (!fs.existsSync(filePath)) {
            atomicWriteJson(filePath, defaultConfig());
        }
    } catch (error) {
        if (error instanceof ConfigError) {
            throw error;
        }
        throw new ConfigError("cannot initialize configuration: " + error.message);
    }
}

/**
 * @brief Read and parse the persisted configuration JSON document.
 * @details Resolves `configPath`, requires an existing file, reads it as
 *          UTF-8 text, and parses the JSON document; every failure
 *          raises without returning a partial result (REQ-023).
 *          Complexity: O(file size).
 * @return {Object} Parsed JSON payload.
 * @throws {ConfigError} When the file is absent, unreadable, or
 *         malformed JSON.
 * @satisfies REQ-023
 */
function readPayload() {
    const filePath = configPath();
    if (!fs.existsSync(filePath)) {
        throw new ConfigError("configuration file not found: " + filePath);
    }
    let text;
    try {
        text = fs.readFileSync(filePath, "utf8");
    } catch (error) {
        throw new ConfigError("cannot read configuration file: " + error.message);
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new ConfigError("invalid JSON in " + filePath + ": " + error.message);
    }
}

/**
 * @brief Load and strictly validate the global configuration.
 * @details Reads the file selected by `configPath`, parses JSON, and
 *          applies `validateConfig`; every failure raises instead of
 *          partially succeeding (REQ-022, REQ-023). Complexity:
 *          O(file size + schema).
 * @return {Object<string, Object<string, string>>} Validated
 *         configuration payload.
 * @throws {ConfigError} When the file is absent, unreadable, malformed
 *         JSON, or schema-invalid.
 * @satisfies REQ-022 REQ-023
 */
function loadStrict() {
    const payload = readPayload();
    validateConfig(payload);
    return payload;
}

/**
 * @brief Load the schema-shaped display view of the configuration.
 * @details Read-only loader of the schema-driven `--print` and `--info`
 *          renderers (DES-010, DES-012): requires a JSON-object root,
 *          then projects the payload onto the schema. Content persisted
 *          by an older schema version never blocks rendering (TST-008):
 *          unknown sections and parameters are dropped, and schema
 *          branches or parameters missing from the file fall back to
 *          their schema defaults, so the result is always safe for the
 *          renderers' direct payload indexing. Unreadable, malformed,
 *          and non-object files remain hard failures (REQ-023).
 *          Complexity: O(file size + schema).
 * @return {Object<string, Object<string, string>>} Schema-shaped
 *         payload: section token to parameter token to current value
 *         (schema default when absent from the file).
 * @throws {ConfigError} When the file is absent, unreadable, malformed
 *         JSON, or its root is not a JSON object.
 * @satisfies DES-010 TST-008 REQ-019 REQ-023
 */
function loadDisplay() {
    const payload = readPayload();
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        throw new ConfigError(
            "configuration root must be a JSON object; got "
            + describeType(payload),
        );
    }
    const display = {};
    for (const schemaSection of SCHEMA) {
        let branch = payload[schemaSection.token];
        if (branch === null || typeof branch !== "object" || Array.isArray(branch)) {
            branch = {};
        }
        const displayBranch = {};
        for (const schemaParam of schemaSection.params) {
            const value = branch[schemaParam.token];
            displayBranch[schemaParam.token] = (
                value === undefined ? schemaParam.default : value
            );
        }
        display[schemaSection.token] = displayBranch;
    }
    return display;
}

/**
 * @brief Report whether the automatic version check is disabled.
 * @details Tolerant runtime reader (REQ-044): loads the schema-shaped
 *          display view and compares the `disable-version-check` value
 *          against the enabling enum token. An absent, unreadable,
 *          malformed, or non-object configuration file yields false
 *          (schema default: check enabled); unknown persisted keys are
 *          dropped by the loader, so stale-schema content never enables
 *          the suppression (REQ-042, TST-008). Complexity: O(file size).
 * @return {boolean} True only when
 *         `version_check:disable-version-check` equals the enabling enum
 *         token; false otherwise.
 * @satisfies REQ-042 REQ-043 REQ-044
 */
function versionCheckDisabled() {
    let payload;
    try {
        payload = loadDisplay();
    } catch (error) {
        return false;
    }
    const versionCheckBranch = (
        payload[VERSION_CHECK_SECTION_TOKEN] !== undefined
        ? payload[VERSION_CHECK_SECTION_TOKEN]
        : {}
    );
    return (
        versionCheckBranch[DISABLE_VERSION_CHECK_PARAM_TOKEN]
        === DISABLE_VERSION_CHECK_ENABLED_VALUE
    );
}

/**
 * @brief Resolve a canonical configuration path against the schema.
 * @details Case-sensitive colon-separated tokens (REQ-022). This schema
 *          defines exactly two depths: `Section` and
 *          `Section:Parameter`; no array or map parameters exist, so
 *          deeper segments and reserved operation tokens (`append`,
 *          `+`, `insert`) are rejected as unknown or misplaced.
 *          Complexity: O(path tokens).
 * @param {string} rawPath Raw canonical path from the CLI.
 * @return {string[]} One or two resolved path tokens.
 * @throws {ConfigError} On empty paths, empty tokens, unknown section
 *         or parameter tokens, and excessive depth; messages list valid
 *         alternatives.
 * @satisfies REQ-022
 */
function resolveSegments(rawPath) {
    if (rawPath === undefined || rawPath === null || rawPath === "") {
        throw new ConfigError("configuration path must not be empty");
    }
    const segments = String(rawPath).split(":");
    if (segments.some((segment) => segment === "")) {
        throw new ConfigError(
            "invalid configuration path " + JSON.stringify(rawPath)
            + ": empty path token",
        );
    }
    const schemaSection = section(segments[0]);
    if (schemaSection === null) {
        const valid = SECTIONS_BY_TOKEN.size > 0
            ? [...SECTIONS_BY_TOKEN.keys()].join(", ")
            : "none (the schema defines no sections)";
        throw new ConfigError(
            "unknown configuration section " + JSON.stringify(segments[0])
            + " in path " + JSON.stringify(rawPath)
            + "; valid sections: " + valid,
        );
    }
    if (segments.length === 1) {
        return segments;
    }
    if (segments.length === 2) {
        if (schemaSection.param(segments[1]) === null) {
            throw new ConfigError(
                "unknown parameter " + JSON.stringify(segments[1])
                + " in section " + schemaSection.token + "; valid parameters: "
                + schemaSection.params.map((schemaParam) => schemaParam.token).join(", "),
            );
        }
        return segments;
    }
    throw new ConfigError(
        "invalid configuration path " + JSON.stringify(rawPath)
        + ": the schema defines at most Section:Parameter; array, map, and"
        + " index tokens are not part of this schema",
    );
}

/**
 * @brief Extract the JSON-serializable value at a resolved path.
 * @details Depth 1 yields a shallow copy of the section object; depth 2
 *          yields the parameter string. Complexity: O(branch size).
 * @param {Object} payload Validated configuration payload.
 * @param {string[]} segments Tokens from `resolveSegments`.
 * @return {Object|string} Section dict copy for depth 1; parameter
 *         string for depth 2.
 * @satisfies REQ-016
 */
function getValue(payload, segments) {
    const branch = payload[segments[0]];
    if (segments.length === 1) {
        return Object.assign({}, branch);
    }
    return branch[segments[1]];
}

/**
 * @brief Parse a raw CLI operand into the schema type of `spec`.
 * @details Selection parameters accept exactly one enum token; JSON
 *          quoting is not stripped, so quoted input is rejected
 *          (REQ-017 typed parsing before write). Complexity: O(enum).
 * @param {Object} spec Target parameter descriptor.
 * @param {string} raw Raw operand string from the CLI.
 * @return {string} Validated enum token.
 * @throws {ConfigError} When `raw` is not an allowed value; the message
 *         enumerates valid values.
 * @satisfies REQ-017
 */
function parseValue(spec, raw) {
    if (!spec.enum.includes(raw)) {
        throw new ConfigError(
            "invalid value for " + spec.token + ": " + JSON.stringify(raw)
            + "; allowed values: " + spec.enum.join(", "),
        );
    }
    return raw;
}

/**
 * @brief Apply a validated `--set` mutation and return the result.
 * @details Depth 1 replaces the whole section with a parsed
 *          schema-compatible JSON object; depth 2 parses the operand
 *          into the parameter schema type (REQ-017). The resulting
 *          configuration is validated in full before returning; the
 *          input payload is never mutated. Complexity: O(payload).
 * @param {Object} payload Current validated configuration.
 * @param {string} rawPath Raw canonical target path.
 * @param {string} raw Raw value operand from the CLI.
 * @return {Object<string, Object<string, string>>} New validated
 *         configuration.
 * @throws {ConfigError} On path, JSON, type, enum, or whole-config
 *         validation failure; no persisted mutation occurs.
 * @satisfies REQ-017
 */
function setValue(payload, rawPath, raw) {
    const segments = resolveSegments(rawPath);
    const updated = {};
    for (const token of Object.keys(payload)) {
        updated[token] = Object.assign({}, payload[token]);
    }
    if (segments.length === 1) {
        const schemaSection = section(segments[0]);
        let replacement;
        try {
            replacement = JSON.parse(raw);
        } catch (error) {
            throw new ConfigError(
                "value for section " + schemaSection.token
                + " is not valid JSON: " + error.message,
            );
        }
        updated[schemaSection.token] = replacement;
    } else {
        const schemaParam = section(segments[0]).param(segments[1]);
        if (schemaParam === null) {
            throw new ConfigError("unknown parameter in path " + JSON.stringify(rawPath));
        }
        updated[segments[0]][schemaParam.token] = parseValue(schemaParam, raw);
    }
    validateConfig(updated);
    return updated;
}

/**
 * @brief Apply a `--unset` restore-to-default mutation.
 * @details Depth 1 restores all section parameter defaults; depth 2
 *          restores one parameter default (REQ-018). The resulting
 *          configuration is validated before returning; the input
 *          payload is never mutated. Complexity: O(payload).
 * @param {Object} payload Current validated configuration.
 * @param {string} rawPath Raw canonical target path.
 * @return {Object<string, Object<string, string>>} New validated
 *         configuration.
 * @throws {ConfigError} On path resolution or validation failure.
 * @satisfies REQ-018
 */
function unsetValue(payload, rawPath) {
    const segments = resolveSegments(rawPath);
    const updated = {};
    for (const token of Object.keys(payload)) {
        updated[token] = Object.assign({}, payload[token]);
    }
    const defaults = defaultConfig();
    if (segments.length === 1) {
        updated[segments[0]] = Object.assign({}, defaults[segments[0]]);
    } else {
        updated[segments[0]][segments[1]] = defaults[segments[0]][segments[1]];
    }
    validateConfig(updated);
    return updated;
}

/**
 * @brief Extract the operand tokens following one CLI flag.
 * @details Operands are every token after the first flag occurrence;
 *          the count must lie within `[minimum, maximum]`, otherwise a
 *          usage diagnostic with complete canonical path examples is
 *          raised (REQ-022). Complexity: O(args).
 * @param {string[]} args CLI argument tokens excluding program name.
 * @param {string} flag Exact flag token to locate (e.g. `--set`).
 * @param {number} minimum Minimum acceptable operand count.
 * @param {number} maximum Maximum acceptable operand count.
 * @return {string[]} Operand tokens in original order.
 * @throws {ConfigError} When the operand count is out of range; the
 *         message embeds schema-valid usage examples.
 * @satisfies REQ-022
 */
function operandValues(args, flag, minimum, maximum) {
    const index = args.indexOf(flag);
    const values = index === -1 ? [] : args.slice(index + 1);
    if (values.length < minimum || values.length > maximum) {
        const expected = minimum === maximum
            ? "exactly " + minimum
            : minimum + " or " + maximum;
        throw new ConfigError(
            flag + " expects " + expected + " operand(s); usage examples: "
            + usageExamples(flag),
        );
    }
    return values;
}

/**
 * @brief Build schema-valid usage examples for one config flag.
 * @details Examples derive from the first schema section so they always
 *          carry complete canonical paths and real schema-valid values
 *          (REQ-022); with an empty schema the generic `<Path>`
 *          placeholder documents that every path is rejected.
 *          Complexity: O(1).
 * @param {string} flag Exact flag token (e.g. `--set`).
 * @return {string} Semicolon-separated example command tails.
 * @satisfies REQ-022
 */
function usageExamples(flag) {
    const firstSection = SCHEMA.length > 0 ? SCHEMA[0] : null;
    if (firstSection === null) {
        if (["--print", "--info", "--print-raw"].includes(flag)) {
            return "'" + flag + "'";
        }
        return "'" + flag + " <Path>'; the schema defines no sections";
    }
    if (firstSection.params.length === 0) {
        if (flag === "--print" || flag === "--info") {
            return "'" + flag + "' or '" + flag + " " + firstSection.token + "'";
        }
        return "'" + flag + " " + firstSection.token + "'";
    }
    const parameterPath = (
        firstSection.token + ":" + firstSection.params[0].token
    );
    if (flag === "--get") {
        return (
            "'--get " + firstSection.token + "' or '--get " + parameterPath + "'"
        );
    }
    if (flag === "--set") {
        const sample = JSON.stringify(defaultConfig()[firstSection.token]);
        return (
            "'--set " + parameterPath + " " + firstSection.params[0].default
            + "' or '--set " + firstSection.token + " " + sample + "'"
        );
    }
    if (flag === "--unset") {
        return "'--unset " + parameterPath + "' or '--unset " + firstSection.token + "'";
    }
    return "'" + flag + "' or '" + flag + " " + firstSection.token + "'";
}

/**
 * @brief Report a configuration failure and yield the exit status.
 * @details Diagnostics go to stderr with an `Error:` prefix; stdout
 *          stays untouched so no partial success output exists
 *          (REQ-023). Side effect: one stderr write. Complexity: O(1).
 * @param {ConfigError} error Failure carrying the diagnostic message.
 * @return {number} Always 1.
 * @satisfies REQ-023
 */
function fail(error) {
    console.error("Error: " + error.message);
    return 1;
}

/**
 * @brief Execute `--get Path` (REQ-016).
 * @details Bootstraps storage, loads strictly, resolves the canonical
 *          path, and prints the resolved value as one valid JSON
 *          document on stdout without decoration (JSON-quoted strings,
 *          objects for sections). Complexity: O(file size).
 * @param {string[]} args CLI argument tokens excluding program name.
 * @return {number} 0 on success; 1 with a stderr diagnostic on failure.
 * @satisfies REQ-016 REQ-023
 */
function handleGet(args) {
    let value;
    try {
        const operands = operandValues(args, "--get", 1, 1);
        ensureBootstrapped();
        const payload = loadStrict();
        value = getValue(payload, resolveSegments(operands[0]));
    } catch (error) {
        if (error instanceof ConfigError) {
            return fail(error);
        }
        throw error;
    }
    console.log(JSON.stringify(value));
    return 0;
}

/**
 * @brief Execute `--set Path Value` (REQ-017, DES-014).
 * @details Parses Value into the schema type, validates the entire
 *          resulting configuration, and persists atomically; success is
 *          silent and any rejection leaves the stored file untouched.
 *          Complexity: O(file size).
 * @param {string[]} args CLI argument tokens excluding program name.
 * @return {number} 0 on success; 1 with a stderr diagnostic on failure.
 * @satisfies REQ-017 REQ-023 DES-014
 */
function handleSet(args) {
    try {
        const operands = operandValues(args, "--set", 2, 2);
        ensureBootstrapped();
        const payload = loadStrict();
        const updated = setValue(payload, operands[0], operands[1]);
        atomicWriteJson(configPath(), updated);
    } catch (error) {
        if (error instanceof ConfigError) {
            return fail(error);
        }
        throw error;
    }
    return 0;
}

/**
 * @brief Execute `--unset Path` (REQ-018, DES-014).
 * @details Restores the targeted parameter or section to schema
 *          defaults and persists atomically; success is silent.
 *          Complexity: O(file size).
 * @param {string[]} args CLI argument tokens excluding program name.
 * @return {number} 0 on success; 1 with a stderr diagnostic on failure.
 * @satisfies REQ-018 REQ-023 DES-014
 */
function handleUnset(args) {
    try {
        const operands = operandValues(args, "--unset", 1, 1);
        ensureBootstrapped();
        const payload = loadStrict();
        const updated = unsetValue(payload, operands[0]);
        atomicWriteJson(configPath(), updated);
    } catch (error) {
        if (error instanceof ConfigError) {
            return fail(error);
        }
        throw error;
    }
    return 0;
}

/**
 * @brief Execute `--print-raw` (REQ-021).
 * @details Emits the exact bytes of the global configuration JSON file
 *          without parsing, reformatting, headings, or trailing text; no
 *          tree formatting is ever applied (on-disk debugging view).
 *          Complexity: O(file size).
 * @param {string[]} args CLI argument tokens excluding program name.
 * @return {number} 0 on success; 1 with a stderr diagnostic on failure.
 * @satisfies REQ-021 REQ-023
 */
function handlePrintRaw(args) {
    let data;
    try {
        operandValues(args, "--print-raw", 0, 0);
        ensureBootstrapped();
        data = fs.readFileSync(configPath());
    } catch (error) {
        if (error instanceof ConfigError) {
            return fail(error);
        }
        return fail(new ConfigError("cannot read configuration file: " + error.message));
    }
    process.stdout.write(data);
    return 0;
}

module.exports = {
    CONFIG_DIR_SEGMENTS,
    CONFIG_FILE_NAME,
    VERSION_CHECK_SECTION_TOKEN,
    DISABLE_VERSION_CHECK_PARAM_TOKEN,
    DISABLE_VERSION_CHECK_ENABLED_VALUE,
    DISABLE_VERSION_CHECK_DEFAULT_VALUE,
    SCHEMA,
    paramSpec,
    sectionSpec,
    section,
    ConfigError,
    configPath,
    defaultConfig,
    validateConfig,
    atomicWriteJson,
    ensureBootstrapped,
    loadStrict,
    loadDisplay,
    versionCheckDisabled,
    resolveSegments,
    getValue,
    parseValue,
    setValue,
    unsetValue,
    operandValues,
    usageExamples,
    handleGet,
    handleSet,
    handleUnset,
    handlePrintRaw,
};
