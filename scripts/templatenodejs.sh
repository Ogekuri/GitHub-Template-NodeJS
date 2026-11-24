#!/bin/bash
# -*- coding: utf-8 -*-
# VERSION: 0.0.2
# AUTHORS: Ogekuri

#/**
# * @file templatenodejs.sh
# * @brief Local-run launcher for the githubtemplatenodejs CLI.
# * @details Validates the `node` runtime availability before delegation
# *          (CTN-012), resolves the canonical project root from the git
# *          repository, and delegates CLI execution to
# *          `node src/templatenodejs/main.js` forwarding all user
# *          arguments unchanged (CTN-013). The tracked `package-lock.json`
# *          is never modified because no npm command is executed.
# * @pre The script executes inside the git repository (any working directory).
# * @post On success the CLI exit status propagates; on failure the exit
# *       status is non-zero with a diagnostic naming the missing tool or
# *       the root-resolution failure.
# * @satisfies PRJ-002 CTN-012 CTN-013
# */

#/**
# * @brief Resolve absolute path of executing script.
# * @details Uses `readlink -f "$0"` to canonicalize all symlinks and
# *          relative components. Result is stored for directory and name
# *          extraction.
# */
FULL_PATH=$(readlink -f "$0")

#/**
# * @brief Extract directory component of resolved script path.
# * @details Derived from FULL_PATH via `dirname`. Used as SCRIPT_DIR base.
# */
SCRIPT_PATH=$(dirname "$FULL_PATH")

#/**
# * @brief Extract filename component of resolved script path.
# * @details Derived from FULL_PATH via `basename`. Available for diagnostics.
# */
SCRIPT_NAME=$(basename "$FULL_PATH")

#/**
# * @brief Extract base directory.
# * @details Derived from SCRIPT_PATH via `dirname`. Used as BASE_DIR base.
# */
BASE_DIR=$(dirname "$SCRIPT_PATH")

###############################################################################
## @brief Resolve project root from git repository.
## @details Uses `git -C "${BASE_DIR}" rev-parse --show-toplevel` to determine
##          canonical project root from launcher base directory.
##          Exits non-zero with explicit error when root detection fails.
## @satisfies PRJ-002
###############################################################################
PROJECT_ROOT=$(git -C "${BASE_DIR}" rev-parse --show-toplevel 2>/dev/null)
if [ -z "$PROJECT_ROOT" ]; then
    echo "ERROR: Unable to determine project root from launcher path."
    exit 1
fi

###############################################################################
## @brief Validate launcher base directory against resolved git root.
## @details Prevents mixed-root execution when script path and git root differ.
##          Fails fast with explicit diagnostics to preserve deterministic
##          runtime environment resolution for local CLI execution.
## @satisfies PRJ-002
###############################################################################
if [ "${PROJECT_ROOT}" != "${BASE_DIR}" ]; then
    echo "ERROR: Launcher base directory mismatch with git root."
    echo "git root: ${PROJECT_ROOT}"
    echo "launcher base: ${BASE_DIR}"
    exit 1
fi

###############################################################################
## @brief Resolve Node.js executable name.
## @details Stores canonical command token used for runtime delegation.
##          Launcher requires node to execute the JavaScript CLI entry.
###############################################################################
NODE_TOOL="node"

#/**
# * @brief Validate node availability before delegation.
# * @details Aborts non-zero with an explicit stderr diagnostic naming the
# *          missing tool when the Node.js runtime is not reachable on PATH.
# * @satisfies CTN-012
# */
if ! command -v node > /dev/null 2>&1; then
    echo "ERROR: Required tool not found: node" >&2
    exit 1
fi

###############################################################################
## @brief Delegate CLI execution to the Node.js runtime.
## @details Changes the working directory to the resolved project root and
##          executes `node src/templatenodejs/main.js`, forwarding all
##          user CLI arguments unchanged. No npm command runs here, so the
##          tracked `package-lock.json` is never rewritten.
## @satisfies PRJ-002 CTN-013
###############################################################################
cd "${PROJECT_ROOT}" || exit 1
exec "${NODE_TOOL}" src/templatenodejs/main.js "$@"
