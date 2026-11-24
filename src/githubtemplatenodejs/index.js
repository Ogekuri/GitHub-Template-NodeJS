"use strict";
/**
 * @file index.js
 * @brief Expose package-level metadata and public CLI entrypoint symbols.
 * @details Defines stable module exports for downstream `require`
 *          consumers and runtime version checks, mirroring the skeleton
 *          schema (DES-004). `version` equals the single version source
 *          consumed by `core.main`; `main` is the CLI dispatcher.
 * @satisfies DES-004
 */
const core = require("./core");

module.exports = {
    version: core.VERSION,
    main: core.main,
};
