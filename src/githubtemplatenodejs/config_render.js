"use strict";
/**
 * @file config_render.js
 * @brief Deterministic tree renderer and table formatter for the
 *        configuration CLI `--print` and `--info` commands.
 * @details One shared data-driven renderer (DES-012) emits UTF-8
 *          box-drawing trees from typed ConfigNode values for both
 *          display commands; only heading and detail formatters differ.
 *          Structural edges (`|-- `, `` -- `` box glyphs) mark real
 *          configuration nodes only; metadata and tables are attached
 *          detail lines carrying the owning node continuation prefix
 *          (DES-013). Tree topology never depends on text width. Tables
 *          use exclusively the glyphs `─ │ ╭ ╮ ╰ ╯ ├ ┤ ┬ ┴ ┼ ═ ╞ ╪ ╡`
 *          with rounded outer corners, a double-line header separator,
 *          and single-line row separators (DES-053..DES-056).
 */
const config = require("./config");
const colors = require("./colors");

/**
 * @brief Ancestor continuation segment: vertical bar plus three spaces.
 */
const PREFIX_CONTINUE = "\u2502   ";

/**
 * @brief Ancestor indent segment: exactly four ASCII spaces.
 */
const PREFIX_INDENT = "    ";

/**
 * @brief Tree edge marker for a node with a later real sibling.
 */
const EDGE_BRANCH = "\u251c\u2500\u2500 ";

/**
 * @brief Tree edge marker for the final real sibling at a depth.
 */
const EDGE_LAST = "\u2514\u2500\u2500 ";

/**
 * @brief Display heading of the virtual whole-tree root (never a CLI
 *        path) in `--print` mode.
 * @satisfies REQ-019
 */
const ROOT_HEADING_PRINT = "Application_Configuration - Current configuration";

/**
 * @brief Display heading of the virtual root in `--info` mode.
 * @satisfies REQ-020
 */
const ROOT_HEADING_INFO = (
    "Application_Configuration - Configuration schema and command reference"
);

/**
 * @brief Typed tree node of one real configuration element.
 * @details `kind` distinguishes section/dictionary branches from
 *          parameters; `children` holds only real configuration nodes
 *          while metadata and tables live in `details` as logical text
 *          lines (never rendered with structural edge markers).
 *          Complexity: O(1) per node.
 * @param {string} token Canonical schema/CLI token, byte-exact (REQ-022).
 * @param {string|null} canonicalPath Full canonical path; null for the
 *        virtual display root.
 * @param {string} kind Node kind: `virtual-root`, `section`, or
 *        `parameter`.
 * @param {string} heading Fully formatted heading line (no tree prefix).
 * @param {string[]} [details] Attached detail logical lines, in display
 *        order.
 * @param {Array} [children] Ordered real child nodes.
 * @return {Object} ConfigNode record with fields `token`,
 *         `canonicalPath`, `kind`, `heading`, `details`, `children`.
 * @satisfies DES-012
 */
function configNode(token, canonicalPath, kind, heading, details, children) {
    return {
        token,
        canonicalPath,
        kind,
        heading,
        details: details === undefined ? [] : details,
        children: children === undefined ? [] : children,
    };
}

/**
 * @brief Measure the terminal display width of a string.
 * @details Combining marks (Unicode category M) count zero; East Asian
 *          wide and fullwidth code points count two; all others count
 *          one. Complexity: O(code points).
 * @param {string} text Text to measure.
 * @return {number} Display width in terminal cells.
 * @satisfies DES-013
 */
function displayWidth(text) {
    let width = 0;
    for (const character of text) {
        const codePoint = character.codePointAt(0);
        if (isCombiningCodePoint(codePoint)) {
            continue;
        }
        width += isWideCodePoint(codePoint) ? 2 : 1;
    }
    return width;
}

/**
 * @brief Report whether one code point is a combining mark.
 * @details Covers the Unicode Mark property plus the Zero Width
 *          Joiner/Non-Joiner control range. Complexity: O(1).
 * @param {number} codePoint Unicode code point to classify.
 * @return {boolean} True when the code point renders zero cells wide.
 */
function isCombiningCodePoint(codePoint) {
    if (codePoint === 0x200c || codePoint === 0x200d) {
        return true;
    }
    const combiningPattern = /\p{M}/u;
    return combiningPattern.test(String.fromCodePoint(codePoint));
}

/**
 * @brief Report whether one code point is East Asian wide or fullwidth.
 * @details Covers the double-width ranges of the Unicode East Asian
 *          Width property (W and F). Complexity: O(1) range scan.
 * @param {number} codePoint Unicode code point to classify.
 * @return {boolean} True when the code point renders two cells wide.
 */
function isWideCodePoint(codePoint) {
    const wideRanges = [
        [0x1100, 0x115f],
        [0x2e80, 0x303e],
        [0x3041, 0x33ff],
        [0x3400, 0x4dbf],
        [0x4e00, 0x9fff],
        [0xa000, 0xa4cf],
        [0xa960, 0xa97f],
        [0xac00, 0xd7a3],
        [0xf900, 0xfaff],
        [0xfe10, 0xfe19],
        [0xfe30, 0xfe6f],
        [0xff01, 0xff60],
        [0xffe0, 0xffe6],
        [0x1f300, 0x1f64f],
        [0x1f900, 0x1f9ff],
        [0x20000, 0x2fffd],
        [0x30000, 0x3fffd],
    ];
    return wideRanges.some(
        ([low, high]) => codePoint >= low && codePoint <= high,
    );
}

/**
 * @brief Render a rectangular box-drawing table (DES-013).
 * @details Column widths derive from the maximum display width of the
 *          header and all cells plus one space of padding on each side;
 *          every border and row shares identical column boundaries, so
 *          `┬`, `┼`, and `┴` align vertically with the `│` separators.
 *          Glyph contract (DES-053..DES-056): rounded outer corners
 *          `╭`/`╮`/`╰`/`╯`; single-line borders built from `─` with
 *          `┬`/`┴` top/bottom junctions and `├`/`┼`/`┤` row-separator
 *          junctions; double-line header separator `╞═..╪..═╡` between
 *          the header row and the content rows. Complexity:
 *          O(rows * columns).
 * @param {string[]} headers Column header cells.
 * @param {string[][]} rows Data rows, each with headers.length cells.
 * @return {string[]} Physical table lines (borders and rows).
 * @satisfies DES-013 DES-053 DES-054 DES-055 DES-056
 */
function formatTable(headers, rows) {
    const widths = headers.map((headerCell, column) => {
        let width = displayWidth(headerCell);
        for (const row of rows) {
            width = Math.max(width, displayWidth(row[column]));
        }
        return width;
    });

    /**
     * @brief Render one horizontal border line.
     * @param {string} left Left corner glyph.
     * @param {string} horizontal Horizontal fill glyph: `─` for single
     *        lines, `═` for the double header separator.
     * @param {string} middle Column junction glyph.
     * @param {string} right Right corner glyph.
     * @return {string} Complete border line.
     */
    const border = (left, horizontal, middle, right) => {
        const segments = widths.map((width) => horizontal.repeat(width + 2));
        return left + segments.join(middle) + right;
    };

    /**
     * @brief Render one padded data row line.
     * @param {string[]} cells Row cells; display-padded to column width.
     * @return {string} Complete row line sharing the border boundaries.
     */
    const dataRow = (cells) => {
        const padded = cells
            .map((cell, column) => cell + " ".repeat(widths[column] - displayWidth(cell)))
            .join(" \u2502 ");
        return "\u2502 " + padded + " \u2502";
    };

    const lines = [
        border("\u256d", "\u2500", "\u252c", "\u256e"),
        dataRow(headers),
        border("\u255e", "\u2550", "\u256a", "\u2561"),
    ];
    for (let index = 0; index < rows.length; index += 1) {
        if (index > 0) {
            lines.push(border("\u251c", "\u2500", "\u253c", "\u2524"));
        }
        lines.push(dataRow(rows[index]));
    }
    lines.push(border("\u2570", "\u2500", "\u2534", "\u256f"));
    return lines;
}

/**
 * @brief Render a node hierarchy with the canonical prefix algorithm.
 * @details Implements the normative traversal: the display root prints
 *          without a marker and its attached details use a four-space
 *          indent; every real child receives exactly one `├── `/`└── `
 *          edge preceded by one four-character segment per ancestor that
 *          has a later sibling; attached details prepend the same
 *          ancestor segments plus exactly one own continuation segment
 *          (`│   ` when the node has a later sibling, four spaces
 *          otherwise). Detail lines never carry structural edge markers
 *          and never add structural depth (DES-012). Complexity:
 *          O(nodes + detail lines).
 * @param {Object} root Display root (virtual root or requested subtree
 *        root).
 * @return {string} Complete multi-line rendering without trailing
 *         newline.
 * @satisfies DES-012 REQ-019
 */
function renderTree(root) {
    const lines = [root.heading];
    for (const detail of root.details) {
        lines.push(PREFIX_INDENT + detail);
    }
    for (let index = 0; index < root.children.length; index += 1) {
        emitNode(
            root.children[index],
            [],
            index === root.children.length - 1,
            lines,
        );
    }
    return lines.join("\n");
}

/**
 * @brief Emit one real node, its details, then its child nodes.
 * @details Recursive worker of `renderTree`; `ancestorHasNext` holds one
 *          entry per actual ancestor recording whether that ancestor has
 *          a later sibling (REQ-019 connector grammar). Complexity:
 *          O(subtree).
 * @param {Object} node Real configuration node to emit.
 * @param {boolean[]} ancestorHasNext Later-sibling flags of ancestors.
 * @param {boolean} isLast True when `node` is the final sibling at
 *        depth.
 * @param {string[]} lines Output accumulator, mutated in place.
 * @return {undefined}
 * @satisfies DES-012 REQ-019
 */
function emitNode(node, ancestorHasNext, isLast, lines) {
    let prefix = "";
    for (const hasNext of ancestorHasNext) {
        prefix += hasNext ? PREFIX_CONTINUE : PREFIX_INDENT;
    }
    const edge = isLast ? EDGE_LAST : EDGE_BRANCH;
    lines.push(prefix + edge + node.heading);
    const detailPrefix = prefix + (isLast ? PREFIX_INDENT : PREFIX_CONTINUE);
    for (const detail of node.details) {
        lines.push(detailPrefix + detail);
    }
    for (let index = 0; index < node.children.length; index += 1) {
        emitNode(
            node.children[index],
            ancestorHasNext.concat([!isLast]),
            index === node.children.length - 1,
            lines,
        );
    }
}

/**
 * @brief Build `Sel | Value` rows with exactly one active marker.
 * @details One `[*]` row for the current value and `[ ]` rows for the
 *          remaining enum tokens, in enum order. Complexity: O(enum).
 * @param {Object} param Selection parameter descriptor.
 * @param {string} current Active value token.
 * @return {string[][]} One `[*]` row and `[ ]` rows in enum order.
 * @satisfies REQ-019
 */
function selectionRows(param, current) {
    return param.enum.map((token) => [
        token === current ? "[*]" : "[ ]",
        JSON.stringify(token),
    ]);
}

/**
 * @brief Build the Meaning cell text for one enum token.
 * @details Tokens present in `colors.PALETTE` (REQ-040) render the ANSI
 *          SGR code and color name; non-palette tokens degrade to a
 *          neutral `-` cell so the Allowed Values table stays
 *          schema-generic for every Selection parameter (DES-010).
 *          Complexity: O(1).
 * @param {string} token Selection enum token of the documented parameter.
 * @return {string} `ANSI SGR <code> (<color name>)` for palette tokens;
 *         `-` otherwise.
 * @satisfies DES-010 REQ-042
 */
function colorMeaning(token) {
    const paletteEntry = colors.PALETTE[token];
    if (paletteEntry === undefined) {
        return "-";
    }
    const sgr = paletteEntry.slice(2, -1);
    return "ANSI SGR " + sgr + " (" + token.replace(/_/g, " ") + ")";
}

/**
 * @brief Build a `--print` node for one section with parameter children.
 * @details Heading carries the `[Path: <canonical path>]` marker mandated
 *          by REQ-019. Complexity: O(params).
 * @param {Object} schemaSection Section schema descriptor.
 * @param {Object} payload Current configuration values.
 * @return {Object} Section ConfigNode carrying parameter child nodes.
 * @satisfies REQ-019 DES-012
 */
function buildPrintSection(schemaSection, payload) {
    const branch = payload[schemaSection.token];
    const children = schemaSection.params.map((schemaParam) => (
        buildPrintParameter(schemaSection, schemaParam, branch[schemaParam.token])
    ));
    return configNode(
        schemaSection.token,
        schemaSection.token,
        "section",
        schemaSection.token + " - [Path: " + schemaSection.token + "] "
        + schemaSection.description,
        [],
        children,
    );
}

/**
 * @brief Build a `--print` node for one selection parameter.
 * @details Heading shows `Token = <JSON value>` plus `(default)` or
 *          `(custom | default: <JSON default>)`; the attached
 *          `Sel | Value` table lists exactly one `[*]` active row
 *          (REQ-019). Complexity: O(enum).
 * @param {Object} schemaSection Owning section descriptor.
 * @param {Object} schemaParam Parameter schema descriptor.
 * @param {string} value Current value token.
 * @return {Object} Parameter ConfigNode with table detail lines.
 * @satisfies REQ-019 DES-012
 */
function buildPrintParameter(schemaSection, schemaParam, value) {
    const canonicalPath = schemaSection.token + ":" + schemaParam.token;
    const status = value === schemaParam.default
        ? "(default)"
        : "(custom | default: " + JSON.stringify(schemaParam.default) + ")";
    const heading = (
        schemaParam.token + " = " + JSON.stringify(value) + " " + status
    );
    return configNode(
        schemaParam.token,
        canonicalPath,
        "parameter",
        heading,
        formatTable(["Sel", "Value"], selectionRows(schemaParam, value)),
    );
}

/**
 * @brief Build an `--info` node for one fixed-schema section.
 * @details Metadata precedes real children: a complete `Full overwrite`
 *          command with a schema-valid sample object and a complete
 *          `Reset block` command (REQ-020). Complexity: O(params).
 * @param {Object} schemaSection Section schema descriptor.
 * @return {Object} Section ConfigNode with metadata details and children.
 * @satisfies REQ-020 DES-012
 */
function buildInfoSection(schemaSection) {
    const defaults = config.defaultConfig()[schemaSection.token];
    const overwriteSample = JSON.stringify(defaults);
    const details = [
        "Full overwrite : --set " + schemaSection.token + " '" + overwriteSample + "'",
        "Reset block : --unset " + schemaSection.token,
    ];
    const children = schemaSection.params.map(
        (schemaParam) => buildInfoParameter(schemaSection, schemaParam),
    );
    return configNode(
        schemaSection.token,
        schemaSection.token,
        "section",
        schemaSection.token + " - [Path: " + schemaSection.token + "] "
        + schemaSection.description,
        details,
        children,
    );
}

/**
 * @brief Build an `--info` node for one selection parameter.
 * @details Heading reads `Token - [Type: constraints] description`;
 *          attached details are the Default line with its restore
 *          command, a complete shell-valid `Set cmd` using a real
 *          schema-valid example value, and the `Allowed Values` table
 *          (REQ-020). Complexity: O(enum).
 * @param {Object} schemaSection Owning section descriptor.
 * @param {Object} schemaParam Parameter schema descriptor.
 * @return {Object} Parameter ConfigNode with documentation details.
 * @satisfies REQ-020 DES-012
 */
function buildInfoParameter(schemaSection, schemaParam) {
    const canonicalPath = schemaSection.token + ":" + schemaParam.token;
    const heading = (
        schemaParam.token + " - [" + schemaParam.typeLabel + ": "
        + schemaParam.constraints + "] " + schemaParam.description
    );
    const allowedRows = schemaParam.enum.map((token) => [
        token,
        token === schemaParam.default ? "default" : "",
        colorMeaning(token),
    ]);
    const details = [
        "Default : " + JSON.stringify(schemaParam.default)
        + " (restored via: --unset " + canonicalPath + ")",
        "Set cmd : --set " + canonicalPath + " " + schemaParam.default,
        "Allowed Values:",
    ];
    for (const line of formatTable(["Value", "Default", "Meaning"], allowedRows)) {
        details.push(line);
    }
    return configNode(
        schemaParam.token,
        canonicalPath,
        "parameter",
        heading,
        details,
    );
}

/**
 * @brief Build the display root for `--print`.
 * @details Without a path the virtual `Application_Configuration` root
 *          carries the schema sections as children; with a canonical
 *          path the requested node becomes the unconnected display root
 *          followed by its real descendants, without invented ancestors
 *          (REQ-019). Complexity: O(schema).
 * @param {Object} payload Current validated configuration.
 * @param {string|null} rawPath Raw canonical path or null for whole tree.
 * @return {Object} Display root ConfigNode.
 * @throws {config.ConfigError} When the path resolves to no schema
 *         section or parameter.
 * @satisfies DES-058 REQ-019
 */
function buildPrintRoot(payload, rawPath) {
    if (rawPath === null || rawPath === undefined) {
        return configNode(
            "Application_Configuration",
            null,
            "virtual-root",
            ROOT_HEADING_PRINT,
            [],
            config.SCHEMA.map(
                (schemaSection) => buildPrintSection(schemaSection, payload),
            ),
        );
    }
    const segments = config.resolveSegments(rawPath);
    const schemaSection = config.section(segments[0]);
    if (schemaSection === null) {
        throw new config.ConfigError(
            "unknown configuration section " + JSON.stringify(segments[0]),
        );
    }
    if (segments.length === 1) {
        return buildPrintSection(schemaSection, payload);
    }
    const schemaParam = schemaSection.param(segments[1]);
    if (schemaParam === null) {
        throw new config.ConfigError("unknown parameter in path " + JSON.stringify(rawPath));
    }
    return buildPrintParameter(
        schemaSection,
        schemaParam,
        payload[schemaSection.token][schemaParam.token],
    );
}

/**
 * @brief Build the display root for `--info`.
 * @details Same node set as `--print` with documentation heading and
 *          detail formatters; a requested path renders that node as the
 *          unconnected display root with its descendants (REQ-020).
 *          Complexity: O(schema).
 * @param {Object} payload Current validated configuration.
 * @param {string|null} rawPath Raw canonical path or null for whole
 *        schema.
 * @return {Object} Display root ConfigNode.
 * @throws {config.ConfigError} When the path resolves to no schema
 *         section or parameter.
 * @satisfies DES-058 REQ-020
 */
function buildInfoRoot(payload, rawPath) {
    if (rawPath === null || rawPath === undefined) {
        return configNode(
            "Application_Configuration",
            null,
            "virtual-root",
            ROOT_HEADING_INFO,
            [],
            config.SCHEMA.map((schemaSection) => buildInfoSection(schemaSection)),
        );
    }
    const segments = config.resolveSegments(rawPath);
    const schemaSection = config.section(segments[0]);
    if (schemaSection === null) {
        throw new config.ConfigError(
            "unknown configuration section " + JSON.stringify(segments[0]),
        );
    }
    if (segments.length === 1) {
        return buildInfoSection(schemaSection);
    }
    const schemaParam = schemaSection.param(segments[1]);
    if (schemaParam === null) {
        throw new config.ConfigError("unknown parameter in path " + JSON.stringify(rawPath));
    }
    return buildInfoParameter(schemaSection, schemaParam);
}

/**
 * @brief Report a rendering-command failure on stderr.
 * @details Diagnostic carries the `Error:` prefix; stdout stays
 *          untouched (REQ-023). Side effect: one stderr write.
 *          Complexity: O(1).
 * @param {config.ConfigError} error Failure carrying the diagnostic.
 * @return {number} Always 1 (REQ-023).
 * @satisfies REQ-023
 */
function fail(error) {
    console.error("Error: " + error.message);
    return 1;
}

/**
 * @brief Execute `--print [Path]` (REQ-019).
 * @details Bootstraps storage, loads the schema-shaped display view via
 *          `config.loadDisplay` so content persisted by an older schema
 *          version never blocks rendering (DES-010, TST-008), builds the
 *          display tree, and prints the rendering on stdout; genuine
 *          failures (absent, unreadable, malformed JSON, or non-object
 *          file; invalid operands or paths) print nothing on stdout and
 *          report one stderr diagnostic with exit 1 (REQ-023).
 *          Complexity: O(file size + schema).
 * @param {string[]} args CLI argument tokens excluding program name.
 * @return {number} 0 on success; 1 on failure.
 * @satisfies REQ-019 REQ-023 DES-010 DES-012
 */
function handlePrint(args) {
    let root;
    try {
        const operands = config.operandValues(args, "--print", 0, 1);
        config.ensureBootstrapped();
        const payload = config.loadDisplay();
        root = buildPrintRoot(payload, operands.length > 0 ? operands[0] : null);
    } catch (error) {
        if (error instanceof config.ConfigError) {
            return fail(error);
        }
        throw error;
    }
    console.log(renderTree(root));
    return 0;
}

/**
 * @brief Execute `--info [Path]` (REQ-020).
 * @details Shares the renderer with `--print` and loads the same
 *          schema-shaped display view via `config.loadDisplay` so
 *          content persisted by an older schema version never blocks
 *          rendering (DES-010, TST-008); renders schema documentation
 *          with defaults and complete command examples; genuine failures
 *          print nothing on stdout and report one stderr diagnostic with
 *          exit 1 (REQ-023). Complexity: O(file size + schema).
 * @param {string[]} args CLI argument tokens excluding program name.
 * @return {number} 0 on success; 1 on failure.
 * @satisfies REQ-020 REQ-023 DES-010 DES-012
 */
function handleInfo(args) {
    let root;
    try {
        const operands = config.operandValues(args, "--info", 0, 1);
        config.ensureBootstrapped();
        const payload = config.loadDisplay();
        root = buildInfoRoot(payload, operands.length > 0 ? operands[0] : null);
    } catch (error) {
        if (error instanceof config.ConfigError) {
            return fail(error);
        }
        throw error;
    }
    console.log(renderTree(root));
    return 0;
}

module.exports = {
    configNode,
    displayWidth,
    formatTable,
    renderTree,
    buildPrintRoot,
    buildInfoRoot,
    handlePrint,
    handleInfo,
};
