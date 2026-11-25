"use strict";
/**
 * @file version_check.js
 * @brief Online new-version check and dual-source version report executed
 *        before CLI argument parsing.
 * @details Queries the npm registry JSON API with a hardcoded 2 s timeout
 *        (CTN-006) for the gated availability check, throttled through an
 *        idle-time JSON cache under `$HOME` (CTN-008, DES-007), and
 *        renders the aligned three-row report (`--ver`) fetching both the
 *        npm registry and the GitHub releases API (REQ-002, REQ-027).
 *        Notifications use the hardcoded ANSI colors of the embedded
 *        internal color JSON (`colors.notificationColors`, REQ-026,
 *        REQ-040). Success refreshes the cache with a 3600 s idle-delay;
 *        any failure backs off 86400 s (CTN-007). Cache persistence is
 *        best effort and never aborts dispatch (REQ-046).
 */
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const colors = require("./colors");

/**
 * @brief npm registry JSON API endpoint returning the latest published
 *        version metadata (REQ-009, REQ-028).
 * @details Payload shape: the version manifest of the latest published
 *          release, carrying the latest version at the top-level
 *          `version` field (`{"name": ..., "version": "x.y.z", ...}`);
 *          hardcoded constant, not configurable (CTN-008).
 * @satisfies REQ-009 REQ-028
 */
const NPM_JSON_ENDPOINT = "https://registry.npmjs.org/githubtemplatenodejs/latest";

/**
 * @brief GitHub API endpoint returning the latest release metadata.
 * @details Source of the report `Latest @ GitHub` row (REQ-029) and of
 *          the `--upgrade --develop` download source (REQ-032);
 *          hardcoded constant, not configurable (CTN-008).
 * @satisfies REQ-029
 */
const GITHUB_RELEASES_ENDPOINT = (
    "https://api.github.com/repos/Ogekuri/"
    + "GitHub-Template-NodeJS/releases/latest"
);

/**
 * @brief HTTPS request timeout in seconds, hardcoded (CTN-006).
 * @satisfies CTN-006
 */
const HTTP_TIMEOUT_SECONDS = 2;

/**
 * @brief Idle-delay in seconds after every successful check (CTN-007).
 * @satisfies CTN-007 REQ-011 REQ-013
 */
const IDLE_DELAY_SUCCESS_SECONDS = 3600;

/**
 * @brief Idle-delay in seconds after any failed check (CTN-007).
 * @satisfies CTN-007 REQ-011 REQ-015
 */
const IDLE_DELAY_FAILURE_SECONDS = 86400;

/**
 * @brief Cache file location segments relative to `$HOME` (DES-007).
 * @satisfies DES-007 CTN-008
 */
const CACHE_RELATIVE_SEGMENTS = [
    ".cache",
    "githubtemplatenodejs",
    "check_version_idle-time.json",
];

/**
 * @brief ANSI SGR reset suffix closing colored notifications.
 * @details Notification prefix colors come from the hardcoded embedded
 *          color JSON (`colors.notificationColors`, REQ-026); only the
 *          reset suffix stays local.
 * @satisfies REQ-026 DES-008
 */
const ANSI_RESET = "\u001b[0m";

/**
 * @brief Report row label for the installed version (REQ-027).
 * @satisfies REQ-027
 */
const REPORT_LABEL_INSTALLED = "Current Installed";

/**
 * @brief Report row label for the npm registry latest version (REQ-027).
 * @satisfies REQ-027 REQ-028
 */
const REPORT_LABEL_NPM = "Latest @ npm";

/**
 * @brief Report row label for the GitHub latest release version (REQ-027).
 * @satisfies REQ-027 REQ-029
 */
const REPORT_LABEL_GITHUB = "Latest @ GitHub";

/**
 * @brief Label pad width keeping report version columns aligned (REQ-027).
 * @details Equals the length of the longest label
 *          `Current Installed` (17 characters).
 * @satisfies REQ-027
 */
const REPORT_LABEL_WIDTH = REPORT_LABEL_INSTALLED.length;

/**
 * @brief Placeholder replacing the version of a failed report source
 *        before the reason suffix is appended (REQ-030).
 * @satisfies REQ-030
 */
const REPORT_UNKNOWN = "unknown";

/**
 * @brief Resolve the absolute cache file path from `$HOME`.
 * @details Prefers the `HOME` environment variable (CTN-008); falls back
 *          to `os.homedir()` when unset. Does not create directories.
 *          Complexity: O(1).
 * @return {string} Absolute cache file path.
 * @satisfies DES-007 CTN-008
 */
function cachePath() {
    const base = process.env.HOME !== undefined && process.env.HOME !== ""
        ? process.env.HOME
        : os.homedir();
    return path.join(base, ...CACHE_RELATIVE_SEGMENTS);
}

/**
 * @brief Load the idle-time cache JSON document.
 * @details Returns null when the file is absent, unreadable, unparsable,
 *          or not a JSON object; callers treat null as cache-miss.
 *          Complexity: O(file size).
 * @param {string} cacheFile Cache file path.
 * @return {Object|null} Parsed cache payload or null.
 * @satisfies REQ-008
 */
function readCache(cacheFile) {
    let payload;
    try {
        payload = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    } catch (error) {
        return null;
    }
    return payload !== null && typeof payload === "object"
        && !Array.isArray(payload) ? payload : null;
}

/**
 * @brief Format an epoch value as UTC ISO-8601.
 * @details Renders `YYYY-MM-DDTHH:MM:SSZ` by stripping the millisecond
 *          fraction from `Date.toISOString`. Complexity: O(1).
 * @param {number} epochSeconds Epoch seconds to render.
 * @return {string} Timestamp shaped `YYYY-MM-DDTHH:MM:SSZ`.
 */
function humanTimestamp(epochSeconds) {
    return new Date(epochSeconds * 1000).toISOString()
        .replace(/\.\d{3}Z$/, "Z");
}

/**
 * @brief Persist the four-field idle-time cache document.
 * @details Creates missing parent directories. Field names follow A-03.
 *          Persistence is best effort (REQ-046): any filesystem error
 *          from directory creation or the file write is swallowed
 *          silently, so a failing cache write never aborts the CLI,
 *          never prints, and never changes the dispatch path; the next
 *          gate evaluation simply treats the cache as a miss.
 *          Complexity: O(payload size).
 * @param {string} cacheFile Cache file path.
 * @param {number} checkEpoch Epoch seconds of the check attempt.
 * @param {number} idleDelaySeconds Idle-delay applied after this check.
 * @return {undefined}
 * @post On write success the file holds exactly four fields:
 *       last_check_epoch, last_check_human, idle_time_epoch,
 *       idle_time_human; on write failure the prior cache state survives
 *       as-is and callers continue normally.
 * @satisfies REQ-010 REQ-011 REQ-046 DES-007 A-03
 */
function writeCache(cacheFile, checkEpoch, idleDelaySeconds) {
    const idleEpoch = Math.floor(checkEpoch) + idleDelaySeconds;
    const payload = {
        "last_check_epoch": Math.floor(checkEpoch),
        "last_check_human": humanTimestamp(checkEpoch),
        "idle_time_epoch": idleEpoch,
        "idle_time_human": humanTimestamp(idleEpoch),
    };
    try {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(payload), "utf8");
    } catch (error) {
        return undefined;
    }
    return undefined;
}

/**
 * @brief Evaluate the idle-time request gate.
 * @details Gate opens on cache-miss (null), non-numeric
 *          `idle_time_epoch`, or `nowEpoch >= idleTimeEpoch`; otherwise
 *          it stays closed. Complexity: O(1).
 * @param {Object|null} cache Parsed cache payload or null.
 * @param {number} nowEpoch Current epoch seconds.
 * @return {boolean} True when an HTTPS request is permitted.
 * @satisfies REQ-008
 */
function gateAllowsRequest(cache, nowEpoch) {
    if (cache === null || cache === undefined) {
        return true;
    }
    const idleEpoch = cache.idle_time_epoch;
    if (typeof idleEpoch !== "number") {
        return true;
    }
    return nowEpoch >= idleEpoch;
}

/**
 * @brief Parse a dotted version string into a comparable component array.
 * @details Strips one leading `v`/`V` prefix, then maps every
 *          dot-separated component to its leading ASCII-digit value
 *          (REQ-047): `0.0.1rc1` -> `[0, 0, 1]`; a component without
 *          leading digits evaluates as 0. Tolerant parsing never throws,
 *          so no published version string is ever reported as a check
 *          failure. Complexity: O(len(version)).
 * @param {string} version Version or release tag (e.g. `v1.2.3rc1`).
 * @return {number[]} Comparable component array; missing components
 *         compare as zero through `compareVersions`.
 * @satisfies REQ-047
 */
function parseVersion(version) {
    const text = (
        version !== undefined && (version.startsWith("v") || version.startsWith("V"))
        ? version.slice(1)
        : version
    );
    const components = [];
    for (const part of String(text).split(".")) {
        let value = 0;
        for (const character of part) {
            if (character < "0" || character > "9") {
                break;
            }
            value = value * 10 + (character.charCodeAt(0) - 48);
        }
        components.push(value);
    }
    return components;
}

/**
 * @brief Compare two version component arrays element-wise.
 * @details Missing components compare as zero (REQ-047), so `[0, 0, 1]`
 *          < `[0, 0, 1, 0]` is false and `[0, 0, 7]` < `[0, 0, 7, 1]` is
 *          true. Complexity: O(max(len(a), len(b))).
 * @param {number[]} left Left component array from `parseVersion`.
 * @param {number[]} right Right component array from `parseVersion`.
 * @return {number} Negative when left < right, positive when
 *         left > right, 0 when equal.
 * @satisfies REQ-047
 */
function compareVersions(left, right) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const leftValue = index < left.length ? left[index] : 0;
        const rightValue = index < right.length ? right[index] : 0;
        if (leftValue !== rightValue) {
            return leftValue < rightValue ? -1 : 1;
        }
    }
    return 0;
}

/**
 * @brief GET one HTTPS URL and resolve its JSON payload.
 * @details Uses the Node.js standard library `https` module (A-08); no
 *          third-party HTTP library. Applies `timeoutSeconds` via the
 *          socket timeout: on expiry the request is destroyed and the
 *          promise rejects with a timeout Error naming the configured
 *          seconds. HTTP status codes >= 400 reject with an Error naming
 *          the status code (e.g. `HTTP Error 503: Service Unavailable`).
 *          Unparsable bodies reject with an invalid-JSON Error. Test
 *          seam: dispatches through `module.exports`, so unit tests
 *          replace this function with `mock.method` to inject static
 *          payloads or failures without any network I/O.
 *          Complexity: O(body size).
 * @param {string} url Absolute HTTPS URL to fetch.
 * @param {Object} [headers] Additional request headers (optional).
 * @param {number} [timeoutSeconds] Timeout in seconds; defaults to
 *        `HTTP_TIMEOUT_SECONDS` (CTN-006).
 * @return {Promise<Object|string>} Parsed JSON payload.
 * @throws {Error} On network failure, timeout expiry, HTTP status >= 400,
 *         or unparsable JSON payload; the message names the encountered
 *         error.
 * @satisfies A-08 CTN-006
 */
function fetchJson(url, headers, timeoutSeconds) {
    const effectiveTimeout = (
        timeoutSeconds === undefined ? HTTP_TIMEOUT_SECONDS : timeoutSeconds
    );
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: headers === undefined ? {} : headers,
        });
        request.setTimeout(effectiveTimeout * 1000, () => {
            request.destroy(new Error(
                "HTTPS request timed out after "
                + effectiveTimeout + " seconds"
            ));
        });
        request.on("error", (error) => reject(error));
        request.on("response", (response) => {
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("error", (error) => reject(error));
            response.on("end", () => {
                if (response.statusCode >= 400) {
                    reject(new Error(
                        "HTTP Error " + response.statusCode + ": "
                        + response.statusMessage
                    ));
                    return;
                }
                const body = Buffer.concat(chunks).toString("utf8");
                let payload;
                try {
                    payload = JSON.parse(body);
                } catch (error) {
                    reject(new Error("invalid JSON payload: " + error.message));
                    return;
                }
                resolve(payload);
            });
        });
    });
}

/**
 * @brief GET the npm registry payload and extract the latest version.
 * @details Sends a plain GET to the npm registry JSON API; no Accept
 *          header is required. The `/latest` endpoint responds with the
 *          version manifest of the latest published release, carrying
 *          the latest version at the top-level `version` field.
 *          Complexity: O(body size).
 * @return {Promise<string>} Latest published version in `x.y.z` format.
 * @throws {Error} On HTTP and network failures (e.g. HTTP 429, 503),
 *         on the 2-second timeout expiry, or on unparsable payload or
 *         missing version.
 * @satisfies REQ-009 REQ-028 CTN-006
 */
async function fetchLatestNpmVersion() {
    const payload = await module.exports.fetchJson(NPM_JSON_ENDPOINT);
    const version = (
        payload !== null && typeof payload === "object"
        ? payload.version
        : undefined
    );
    if (typeof version !== "string" || version === "") {
        throw new Error("npm payload misses version");
    }
    return version;
}

/**
 * @brief GET the latest GitHub release payload and extract its version.
 * @details Sends the GitHub-mandatory `User-Agent` header next to the
 *          `Accept` header; the GitHub API rejects requests without a
 *          `User-Agent` header with HTTP 403 Forbidden. Strips one
 *          leading `v`/`V` prefix from `tag_name`; the returned value is
 *          exactly the version downloaded by `--upgrade --develop`
 *          (REQ-032) regardless of the branch the release was tagged on.
 *          Complexity: O(body size).
 * @return {Promise<string>} Latest release version in `x.y.z` format.
 * @throws {Error} On HTTP and network failures (e.g. HTTP 429, 503),
 *         on the 2-second timeout expiry, or on unparsable payload or
 *         missing tag_name.
 * @satisfies REQ-029 CTN-006
 */
async function fetchLatestGithubVersion() {
    const payload = await module.exports.fetchJson(GITHUB_RELEASES_ENDPOINT, {
        "Accept": "application/vnd.github+json",
        "User-Agent": "githubtemplatenodejs",
    });
    const tagName = (
        payload !== null && typeof payload === "object"
        ? payload.tag_name
        : undefined
    );
    if (typeof tagName !== "string" || tagName === "") {
        throw new Error("release payload misses tag_name");
    }
    return tagName.startsWith("v") || tagName.startsWith("V")
        ? tagName.slice(1)
        : tagName;
}

/**
 * @brief Render one report row with the label padded to 17 columns.
 * @details Label is padded with trailing spaces to
 *          `REPORT_LABEL_WIDTH` (REQ-027). Complexity: O(17 + value).
 * @param {string} label Row label (e.g. `Latest @ npm`).
 * @param {string} value Version string or `unknown (<reason>)`
 *        placeholder.
 * @return {string} Row shaped `<label padded to 17> : <value>` (REQ-027).
 * @satisfies REQ-027
 */
function formatReportRow(label, value) {
    const padding = " ".repeat(REPORT_LABEL_WIDTH - label.length);
    return label + padding + " : " + value;
}

/**
 * @brief Render the failed-source placeholder with its reason.
 * @details REQ-030 mandates the `unknown (<reason>)` shape, where
 *          `<reason>` names the actually encountered error (e.g. an HTTP
 *          429/503 response or a timeout); an empty reason degrades to
 *          the bare `unknown` placeholder. Complexity: O(reason).
 * @param {string} reason String rendering of the encountered error.
 * @return {string} `unknown (<reason>)`, or `unknown` when reason is
 *         empty.
 * @satisfies REQ-030
 */
function unknownValue(reason) {
    if (reason === undefined || reason === null || reason === "") {
        return REPORT_UNKNOWN;
    }
    return REPORT_UNKNOWN + " (" + reason + ")";
}

/**
 * @brief Print a message wrapped in an ANSI color prefix and reset.
 * @details Exactly one stdout line: prefix + message + `ANSI_RESET` +
 *          newline. Side effect: one stdout write. Complexity: O(message).
 * @param {string} color ANSI SGR prefix (bright green or bright red).
 * @param {string} message Plain-text message content.
 * @return {undefined}
 * @satisfies DES-008 REQ-026
 */
function printColored(color, message) {
    console.log(color + message + ANSI_RESET);
}

/**
 * @brief Emit the failure note and write the 86400 s cache.
 * @details The note renders with the hardcoded error color (REQ-026);
 *          the cache write is best effort (REQ-046). Complexity: O(1).
 * @param {number} checkEpoch Epoch seconds of the failed attempt.
 * @param {Error} error Encountered error rendered in the note.
 * @param {string} color ANSI SGR prefix for the failure note.
 * @return {undefined}
 * @satisfies REQ-014 REQ-015 REQ-026 REQ-046 A-05
 */
function reportFailure(checkEpoch, error, color) {
    printColored(color, "Version check failed: " + error.message);
    module.exports.writeCache(
        module.exports.cachePath(),
        checkEpoch,
        IDLE_DELAY_FAILURE_SECONDS,
    );
}

/**
 * @brief Execute the gated (or forced) online version check on npm.
 * @details Flow: cache read -> gate evaluation (skipped when `force`) ->
 *          npm registry fetch -> version compare -> notify -> cache
 *          write. Notification colors come from the hardcoded embedded
 *          color JSON (REQ-026, REQ-040). Success always refreshes the
 *          cache with the 3600 s idle-delay (REQ-013, A-04); fetch or
 *          parse failures print the hardcoded error note and back off
 *          86400 s (REQ-014, REQ-015, A-05). The promise always resolves
 *          normally; callers continue parsing (A-06). Complexity:
 *          O(body size) network-bound.
 * @param {string} installedVersion Installed version in `x.y.z` format.
 * @param {boolean} [force] True bypasses the idle-time gate (REQ-002,
 *        REQ-007).
 * @return {Promise<undefined>} Resolves regardless of the check outcome.
 * @note The caller in `core.main` suppresses this call when the
 *       configuration switch `version_check:disable-version-check` is
 *       enabled (REQ-043); `--ver` / `--version` run the report instead
 *       and stay active regardless of the switch (REQ-045).
 * @satisfies REQ-007 REQ-008 REQ-009 REQ-010 REQ-011 REQ-012 REQ-013
 *            REQ-014 REQ-015 REQ-026 REQ-046 REQ-047
 */
async function runVersionCheck(installedVersion, force) {
    const checkEpoch = Date.now() / 1000;
    const palette = colors.notificationColors();
    const cacheFile = module.exports.cachePath();
    const cache = module.exports.readCache(cacheFile);
    if (force !== true && !module.exports.gateAllowsRequest(cache, checkEpoch)) {
        return undefined;
    }
    let available;
    let installed;
    let latestVersion;
    try {
        latestVersion = await module.exports.fetchLatestNpmVersion();
        available = module.exports.parseVersion(latestVersion);
        installed = module.exports.parseVersion(installedVersion);
    } catch (error) {
        module.exports.reportFailure(checkEpoch, error, palette.error_color);
        return undefined;
    }
    if (module.exports.compareVersions(available, installed) > 0) {
        module.exports.printColored(
            palette.new_version_color,
            "New version available: " + latestVersion
            + " (installed version: " + installedVersion + ")",
        );
    }
    module.exports.writeCache(cacheFile, checkEpoch, IDLE_DELAY_SUCCESS_SECONDS);
    return undefined;
}

/**
 * @brief Execute the forced dual-source version report (`--ver`).
 * @details Flow: fetch npm registry -> fetch GitHub releases -> emit the
 *          three aligned rows. Each failed fetch emits one bright red
 *          note naming the failed source with the hardcoded error color
 *          (REQ-030) and its row prints `unknown (<reason>)`, carrying
 *          the actually encountered error, in place of the version
 *          (REQ-030). Rows print in order: installed, npm, GitHub;
 *          version columns aligned via a 17-character label pad
 *          (REQ-027). The GitHub row shows the latest release tag
 *          stripped of its `v` prefix, exactly the version downloaded by
 *          `--upgrade --develop` (REQ-029). The idle-time gate and cache
 *          file are bypassed for the fetches (REQ-002); the cache write
 *          follows the npm outcome only: 3600 s on success, 86400 s on
 *          failure (REQ-031). The promise always resolves normally
 *          (A-06). Complexity: O(body sizes) network-bound.
 * @param {string} installedVersion Installed version in `x.y.z` format.
 * @return {Promise<undefined>} Resolves after the report printed.
 * @satisfies REQ-002 REQ-026 REQ-027 REQ-028 REQ-029 REQ-030 REQ-031
 *            REQ-045 REQ-046
 */
async function runVersionReport(installedVersion) {
    const palette = colors.notificationColors();
    const checkEpoch = Date.now() / 1000;
    let npmVersion = null;
    let githubVersion = null;
    let npmReason = "";
    let githubReason = "";
    try {
        npmVersion = await module.exports.fetchLatestNpmVersion();
    } catch (error) {
        npmReason = error.message;
        module.exports.printColored(
            palette.error_color,
            "Version check failed @ npm: " + error.message,
        );
    }
    try {
        githubVersion = await module.exports.fetchLatestGithubVersion();
    } catch (error) {
        githubReason = error.message;
        module.exports.printColored(
            palette.error_color,
            "Version check failed @ GitHub: " + error.message,
        );
    }
    console.log(module.exports.formatReportRow(
        REPORT_LABEL_INSTALLED,
        installedVersion,
    ));
    console.log(module.exports.formatReportRow(
        REPORT_LABEL_NPM,
        npmVersion !== null ? npmVersion : module.exports.unknownValue(npmReason),
    ));
    console.log(module.exports.formatReportRow(
        REPORT_LABEL_GITHUB,
        githubVersion !== null
            ? githubVersion
            : module.exports.unknownValue(githubReason),
    ));
    if (npmVersion !== null) {
        module.exports.writeCache(
            module.exports.cachePath(),
            checkEpoch,
            IDLE_DELAY_SUCCESS_SECONDS,
        );
    } else {
        module.exports.writeCache(
            module.exports.cachePath(),
            checkEpoch,
            IDLE_DELAY_FAILURE_SECONDS,
        );
    }
    return undefined;
}

module.exports = {
    NPM_JSON_ENDPOINT,
    GITHUB_RELEASES_ENDPOINT,
    HTTP_TIMEOUT_SECONDS,
    IDLE_DELAY_SUCCESS_SECONDS,
    IDLE_DELAY_FAILURE_SECONDS,
    CACHE_RELATIVE_SEGMENTS,
    REPORT_LABEL_INSTALLED,
    REPORT_LABEL_NPM,
    REPORT_LABEL_GITHUB,
    cachePath,
    readCache,
    humanTimestamp,
    writeCache,
    gateAllowsRequest,
    parseVersion,
    compareVersions,
    fetchJson,
    fetchLatestNpmVersion,
    fetchLatestGithubVersion,
    formatReportRow,
    unknownValue,
    printColored,
    reportFailure,
    runVersionCheck,
    runVersionReport,
};
