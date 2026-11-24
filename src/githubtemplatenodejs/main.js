#!/usr/bin/env node
"use strict";
/**
 * @file main.js
 * @brief Execute githubtemplatenodejs CLI as the npm `bin` entry point.
 * @details Invoked by the `githubtemplatenodejs` executable created by
 *          `npm install -g` and `npx` (PRJ-001, DES-003); imports the
 *          canonical `main` dispatcher and forwards the resolved exit
 *          status to the process boundary. An unexpected dispatcher
 *          rejection terminates with status 1 and the diagnostic on
 *          stderr.
 * @satisfies PRJ-001 DES-003 DES-004
 */
const { main } = require("./core");

main(process.argv.slice(2)).then(
    (exitCode) => process.exit(exitCode),
    (error) => {
        console.error(String(error));
        process.exit(1);
    },
);
