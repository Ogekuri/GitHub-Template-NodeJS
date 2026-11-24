"use strict";
/**
 * @file main.js
 * @brief Execute the renamed skeleton CLI entry when invoked with
 *        `node src/templatenodejs/main.js`.
 * @details Launcher entry of the renamed skeleton copy (CTN-004,
 *          CTN-013): `scripts/templatenodejs.sh` delegates local
 *          execution through this file (PRJ-002), which forwards to the
 *          skeleton `core` module and propagates the dispatcher exit
 *          status to the process boundary. An unexpected dispatcher
 *          rejection terminates with status 1 and the diagnostic on
 *          stderr.
 * @satisfies PRJ-002 CTN-004 CTN-013
 */
const { main } = require("./core");

main(process.argv.slice(2)).then(
    (exitCode) => process.exit(exitCode),
    (error) => {
        console.error(String(error));
        process.exit(1);
    },
);
