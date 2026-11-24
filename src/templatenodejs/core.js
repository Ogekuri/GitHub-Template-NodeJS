"use strict";
/**
 * @file core.js
 * @brief Skeleton-schema core bridge of the renamed skeleton copy.
 * @details Keeps the skeleton schema imports (`require("./core")`)
 *          resolvable (CTN-004, CTN-005) while delegating the CLI
 *          dispatch to the distributed application core under
 *          `src/githubtemplatenodejs/`, so local launcher execution
 *          (PRJ-002, CTN-013) runs the full CLI instead of a
 *          placeholder. Complexity: O(1) re-export.
 * @satisfies PRJ-002 CTN-004 CTN-005 CTN-013
 */
module.exports = require("../githubtemplatenodejs/core");
