#!/bin/bash
# -*- coding: utf-8 -*-
# VERSION: 0.0.7
# AUTHORS: Ogekuri

#/**
# * @file clean.sh
# * @brief Execution-artifact cleaner for githubtemplatenodejs.
# * @details Removes every repository-internal execution-generated
# *          temporary artifact: dependency trees (`node_modules/` at any
# *          depth), coverage output directories (`.nyc_output/`,
# *          `coverage/`), legacy build intermediates (`build/`), and
# *          coverage data files (`.coverage`, `.coverage.*`).
# *          Versioned release artifacts under `dist/` (DES-042),
# *          tracked files, untracked user files, and `$HOME` application
# *          data are never touched, and no destructive git command is
# *          executed (CTN-011). The cleanup is idempotent: absent targets
# *          are a successful no-op, so `scripts/build.sh` delegates the
# *          pre-build cleanup to this script (DES-051) and two consecutive
# *          builds start from the identical generated-path state
# *          (DES-052).
# * @pre The script executes inside the git repository (any working directory).
# * @post On success no execution-generated temporary artifact remains in
# *       the repository tree; on failure the exit status is non-zero.
# * @satisfies PRJ-009 DES-044 DES-045 DES-046 DES-047 DES-048 DES-049
# *            DES-050 CTN-011
# */

#/**
# * @brief Enable strict error semantics for the whole cleanup process.
# * @details `-E` propagates ERR traps into functions and subshells; `-e`
# *          aborts on the first failing command; `-u` rejects unset
# *          variables; `-o pipefail` fails a pipeline when any stage
# *          fails. No `|| true` or exit-code suppression is used anywhere.
# * @satisfies DES-049
# */
set -Eeuo pipefail

#/**
# * @brief Resolve the absolute path of the executing script.
# * @details Canonicalizes all symlinks and relative components via
# *          `readlink -f "$0"`, then extracts the containing directory.
# *          All expansions are quoted so invocation paths containing
# *          spaces are handled safely.
# * @satisfies DES-044
# */
FULL_PATH=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$FULL_PATH")

#/**
# * @brief Resolve and enter the repository root.
# * @details Uses `git -C "${SCRIPT_DIR}" rev-parse --show-toplevel` so the
# *          cleanup works from any working directory; fails fast with an
# *          explicit diagnostic when root detection fails. The explicit
# *          `if !` guard prevents `set -e` from aborting before the
# *          diagnostic is printed.
# * @satisfies DES-044
# */
if ! PROJECT_ROOT=$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null); then
    echo "ERROR: Unable to determine the project root." >&2
    exit 1
fi
cd "${PROJECT_ROOT}"
echo "==> [CLEAN] project root: ${PROJECT_ROOT}"

#/**
# * @brief Validate the mandatory clean toolchain.
# * @details Requires `git` (root resolution); `find`, `rm`, and `readlink`
# *          are covered by the POSIX toolchain implicit in any bash
# *          environment. A missing tool aborts before any removal with a
# *          named diagnostic.
# * @satisfies DES-045
# */
if ! command -v git > /dev/null 2>&1; then
    echo "ERROR: Required tool not found: git" >&2
    exit 1
fi

#/**
# * @brief Remove one cleanup target when present.
# * @details Absent targets are a successful no-op (idempotency); a failing
# *          `rm -rf` aborts the run non-zero with a diagnostic naming the
# *          target. Every handled target is logged.
# * @param[in] target $1: absolute path of the generated artifact.
# * @satisfies DES-049
# */
remove_target() {
    local target="$1"
    if [ ! -e "${target}" ] && [ ! -L "${target}" ]; then
        echo "==> [CLEAN] absent, skipping: ${target}"
        return 0
    fi
    if ! rm -rf -- "${target}"; then
        echo "ERROR: Unable to remove generated path: ${target}" >&2
        exit 1
    fi
    echo "==> [CLEAN] removed: ${target}"
}

#/**
# * @brief Remove the named coverage and build output directories.
# * @details Targets: `.nyc_output/`, `coverage/`, `build/`. All are fully
# *          re-creatable by the test runner and build tooling, so their
# *          removal restores the canonical startup state.
# * @satisfies DES-047
# */
for clean_target in .nyc_output coverage build; do
    remove_target "${PROJECT_ROOT}/${clean_target}"
done

#/**
# * @brief Remove coverage data files.
# * @details Targets `.coverage` and every `.coverage.*` sibling; the
# *          literal-pattern guard makes an unmatched glob a no-op instead
# *          of a failed expansion under `set -u`.
# * @satisfies DES-048
# */
for clean_coverage in "${PROJECT_ROOT}/.coverage" "${PROJECT_ROOT}/.coverage."*; do
    [ -e "${clean_coverage}" ] || continue
    remove_target "${clean_coverage}"
done

#/**
# * @brief Remove every dependency-tree directory at any depth.
# * @details `find` matches `node_modules/` directories at any depth;
# *          `-prune` yields matched directories without descending into
# *          them, keeping the removal list stable under deletion. The
# *          `./dist` prune guarantees that versioned release artifacts
# *          (DES-042) are never descended into, matched, or removed
# *          (DES-050). The whole inventory is collected before the first
# *          removal, so the traversal is never disturbed.
# * @satisfies DES-046 DES-050
# */
mapfile -d '' -t clean_cache_dirs < <(
    find . \
        -path ./dist -prune -o \
        -type d -name 'node_modules' -prune -print0
)
for clean_cache_dir in "${clean_cache_dirs[@]}"; do
    remove_target "${clean_cache_dir}"
done

#/**
# * @brief Print the cleanup summary and terminate successfully.
# * @details Generated release artifacts stay in `dist/` for distribution
# *          (DES-050); `$HOME` application data (version-check cache,
# *          configuration) is intentionally outside the cleanup scope.
# * @satisfies DES-049 DES-050
# */
echo "==> [CLEAN] repository-generated artifacts removed; dist/ release artifacts preserved."
exit 0
