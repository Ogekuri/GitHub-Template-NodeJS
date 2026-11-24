#!/bin/bash
# -*- coding: utf-8 -*-
# VERSION: 0.0.3
# AUTHORS: Ogekuri

#/**
# * @file build.sh
# * @brief Reproducible release-packaging builder for githubtemplatenodejs.
# * @details Validates the mandatory toolchain, restores the canonical
# *          pre-build startup state by delegating to `scripts/clean.sh`,
# *          removes every stale generated distribution artifact from
# *          `dist/` (first-level `*.tar.gz` and `*.tgz` files of any
# *          version) while preserving every other pre-existing file, runs
# *          the project-native build procedure
# *          `npm pack --pack-destination dist/` from the repository root,
# *          verifies that at least one package tarball was produced, and
# *          prints an artifact summary. The produced tarball lands under
# *          `dist/` as the release output and is the sole artifact source
# *          of `.github/workflows/release-npm.yml` (DES-042), which never
# *          executes this script (DES-043). No temporary build output is
# *          left anywhere else.
# * @pre The script executes inside the git repository (any working directory).
# * @post On success `dist/` holds the fresh package tarball and all stale
# *       generated artifacts are gone; on failure the exit status is non-zero.
# * @satisfies PRJ-007 DES-020 DES-021 DES-022 DES-023 DES-024 DES-025
# *            DES-051 DES-052 CTN-011
# */

#/**
# * @brief Enable strict error semantics for the whole build process.
# * @details `-E` propagates ERR traps into functions and subshells; `-e`
# *          aborts on the first failing command; `-u` rejects unset
# *          variables; `-o pipefail` fails a pipeline when any stage fails.
# *          No `|| true` or exit-code suppression is used anywhere.
# * @satisfies DES-021 DES-024
# */
set -Eeuo pipefail

#/**
# * @brief Resolve the absolute path of the executing script.
# * @details Canonicalizes all symlinks and relative components via
# *          `readlink -f "$0"`, then extracts the containing directory.
# *          All expansions are quoted so invocation paths containing spaces
# *          are handled safely.
# * @satisfies DES-020
# */
FULL_PATH=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$FULL_PATH")

#/**
# * @brief Resolve and enter the repository root.
# * @details Uses `git -C "${SCRIPT_DIR}" rev-parse --show-toplevel` so the
# *          build works from any working directory; fails fast with an
# *          explicit diagnostic when root detection fails. The explicit
# *          `if !` guard prevents `set -e` from aborting before the
# *          diagnostic is printed.
# * @satisfies DES-020
# */
if ! PROJECT_ROOT=$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null); then
    echo "ERROR: Unable to determine the project root." >&2
    exit 1
fi
cd "${PROJECT_ROOT}"
echo "==> [BUILD] project root: ${PROJECT_ROOT}"

#/**
# * @brief Validate the mandatory build toolchain.
# * @details Requires `git`, `node`, and `npm`; aborts non-zero naming the
# *          first missing tool before any build action runs.
# * @satisfies DES-021
# */
for build_tool in git node npm; do
    if ! command -v "${build_tool}" > /dev/null 2>&1; then
        echo "ERROR: Required tool not found: ${build_tool}" >&2
        exit 1
    fi
done

#/**
# * @brief Restore the canonical pre-build startup state via scripts/clean.sh.
# * @details Delegates the repository cleanup to the dedicated script so the
# *          build never starts from stale dependency trees, tool caches,
# *          build intermediates, coverage data, or test-run leftovers.
# *          Delegating to the single cleanup implementation guarantees that
# *          two consecutive builds execute from the identical generated-path
# *          state. A failing cleanup aborts the build non-zero before any
# *          build action.
# * @satisfies DES-051 DES-052
# */
if ! bash "${SCRIPT_DIR}/clean.sh"; then
    echo "ERROR: Pre-build cleanup failed: scripts/clean.sh" >&2
    exit 1
fi

#/**
# * @brief Remove stale generated distribution artifacts from dist/.
# * @details Deletes every first-level distribution artifact file under
# *          `<root>/dist/` matching `*.tar.gz` or `*.tgz`, so stale builds
# *          of any version are removed, printing each removed path; every
# *          other pre-existing file or directory is preserved. A missing
# *          `dist/` directory is not an error and is created by the build
# *          step.
# * @satisfies DES-023
# */
DIST_DIR="${PROJECT_ROOT}/dist"
mkdir -p "${DIST_DIR}"
if [ -d "${DIST_DIR}" ]; then
    find "${DIST_DIR}" -maxdepth 1 -type f \( -name '*.tar.gz' -o -name '*.tgz' \) -print -delete
fi

#/**
# * @brief Build the complete distribution with the project-native procedure.
# * @details Runs `npm pack --pack-destination dist/` from the repository
# *          root, matching the package tarball consumed by
# *          `.github/workflows/release-npm.yml`; the tarball name and
# *          content derive from `package.json`. A failing command aborts
# *          the script via `set -e`.
# * @satisfies DES-022
# */
npm pack --pack-destination "${DIST_DIR}"

#/**
# * @brief Verify that the build produced at least one package tarball.
# * @details Counts first-level `*.tgz` files in `dist/`; aborts non-zero
# *          when the count is zero so a failed or empty build is never
# *          presented as successful.
# * @satisfies DES-024
# */
TARBALL_COUNT=$(find "${DIST_DIR}" -maxdepth 1 -type f -name '*.tgz' | wc -l)
if [ "${TARBALL_COUNT}" -lt 1 ]; then
    echo "ERROR: Build verification failed: expected at least one package tarball in dist/." >&2
    exit 1
fi

#/**
# * @brief Print the artifact summary and terminate successfully.
# * @details Lists every file currently collected in `dist/`; the freshly
# *          generated package tarball remains in `dist/` as the build
# *          output location (PRJ-007).
# * @satisfies DES-025
# */
echo "==> [BUILD] artifacts in dist/:"
find "${DIST_DIR}" -maxdepth 1 -type f | sort
echo "==> [BUILD] build completed successfully."
exit 0
