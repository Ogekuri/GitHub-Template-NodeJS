#!/bin/bash
# -*- coding: utf-8 -*-
# VERSION: 0.0.10
# AUTHORS: Ogekuri

#/**
# * @file pre-release-check.sh
# * @brief Authoritative release-readiness verifier for githubtemplatenodejs.
# * @details Executes, fail-fast, every check applicable to this project:
# *          toolchain validation, tracked shell-script syntax validation
# *          (`bash -n`, plus ShellCheck when installed), JavaScript syntax
# *          checking of tracked sources and test files (`node --check`),
# *          the full Node.js test suite (`npm test`), a complete build
# *          into an out-of-tree temporary directory, and structural
# *          validation of the produced release artifacts. A trap-based
# *          cleanup removes every execution-generated path (untracked and
# *          ignored git-status entries absent from the pre-execution
# *          baseline) on success and on any failure, then verifies that
# *          the final repository state equals the baseline. Termination is
# *          non-zero when any check fails or when cleanup or integrity
# *          verification fails; cleanup never masks the original outcome.
# *          No destructive git command is ever executed.
# * @pre The script executes inside the git repository (any working directory).
# * @post On success the repository is exactly as clean as before the run and
# *       no build artifact remains; on failure the exit status is non-zero.
# * @satisfies PRJ-008 DES-026 DES-027 DES-028 DES-029 DES-030 DES-031 DES-032
# *            DES-033 DES-034 DES-035 DES-036 DES-037 DES-038 CTN-011
# */

#/**
# * @brief Enable strict error and trap semantics for the whole verification.
# * @details `-E` propagates ERR traps into functions and subshells; `-e`
# *          aborts on the first failing command (fail-fast); `-u` rejects
# *          unset variables; `-o pipefail` fails pipelines on any failing
# *          stage. No `|| true` or exit-code suppression is used anywhere.
# * @satisfies DES-026 DES-027
# */
set -Eeuo pipefail

#/**
# * @brief Resolve the repository root independently of the invocation cwd.
# * @details Canonicalizes the script path with `readlink -f` and resolves
# *          the git toplevel via `git -C ... rev-parse --show-toplevel`,
# *          then enters it so every later check runs from the root. All
# *          expansions are quoted so paths containing spaces are safe.
# * @satisfies DES-026
# */
FULL_PATH=$(readlink -f "$0")
SCRIPT_DIR=$(dirname "$FULL_PATH")
if ! PROJECT_ROOT=$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null); then
    echo "ERROR: Unable to determine the project root." >&2
    exit 1
fi
cd "${PROJECT_ROOT}"
echo "==> [PREFLIGHT] project root: ${PROJECT_ROOT}"

#/**
# * @brief Validate the mandatory toolchain before running any check.
# * @details Requires `git`, `node`, and `npm`; `bash` availability is
# *          implicit because this script runs under bash. A missing tool
# *          aborts the run before the baseline is captured, with a named
# *          diagnostic.
# * @satisfies DES-028
# */
for check_tool in git node npm; do
    if ! command -v "${check_tool}" > /dev/null 2>&1; then
        echo "ERROR: Required tool not found: ${check_tool}" >&2
        exit 1
    fi
done

#/**
# * @brief Create the run-scoped temporary work area outside the repository.
# * @details `mktemp -d` allocates a unique directory under the system
# *          temporary area; it hosts the git-status baseline, the current
# *          and final status snapshots, the out-of-tree build output, and
# *          the artifact validator script, so no check writes artifacts
# *          into the repository tree. Removed by the EXIT trap.
# * @satisfies DES-032 DES-034
# */
TMP_WORK_DIR=$(mktemp -d)
BASELINE_FILE="${TMP_WORK_DIR}/status-baseline.txt"
CURRENT_FILE="${TMP_WORK_DIR}/status-current.txt"
FINAL_FILE="${TMP_WORK_DIR}/status-final.txt"
BUILD_OUT_DIR="${TMP_WORK_DIR}/dist"
VALIDATOR_FILE="${TMP_WORK_DIR}/validate_artifacts.sh"
mkdir -p "${BUILD_OUT_DIR}"

#/**
# * @brief Install trap-based exit and signal handling.
# * @details `on_exit` preserves the original exit status, runs the cleanup
# *          and integrity verification, forces exit status 1 when cleanup
# *          fails (without ever masking a non-zero original status), prints
# *          the final summary, and exits. `SIGINT`/`SIGTERM`/`SIGHUP` are
# *          mapped to conventional exit statuses so interruptions still
# *          trigger the EXIT trap and full cleanup.
# * @satisfies DES-034 DES-035 DES-038
# */
on_exit() {
    local exit_code=$?
    trap - EXIT
    if cleanup_and_verify; then
        :
    else
        exit_code=1
    fi
    if [ "${exit_code}" -eq 0 ]; then
        echo "==> [SUMMARY] all pre-release checks passed; repository left clean."
    else
        echo "==> [SUMMARY] pre-release verification FAILED (see ERROR diagnostics above)." >&2
    fi
    exit "${exit_code}"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

#/**
# * @brief Capture the pre-execution repository state baseline.
# * @details Stores the full `git status --porcelain --ignored` output
# *          (tracked modifications, staged entries, untracked and ignored
# *          entries alike) so cleanup can distinguish run-generated paths
# *          from pre-existing content and the final integrity verification
# *          can require exact equality with the post-cleanup state.
# * @satisfies DES-036 DES-037
# */
if ! git -C "${PROJECT_ROOT}" -c core.quotepath=false status --porcelain --ignored > "${BASELINE_FILE}"; then
    echo "ERROR: Unable to capture the pre-execution repository baseline." >&2
    exit 1
fi

#/**
# * @brief Execute one named verification phase with fail-fast semantics.
# * @details Prints a phase banner, executes the given command with all
# *          remaining arguments, and on non-zero exit prints an explicit
# *          `ERROR:` diagnostic naming the failed check and exits 1; the
# *          EXIT trap then performs cleanup while preserving the failure.
# * @param[in] check_name $1: stable check identifier used in diagnostics.
# * @param[in] check_command $2..: command argv executed verbatim.
# * @satisfies DES-027 DES-038
# */
run_check() {
    local check_name="$1"
    shift
    echo "==> [CHECK] ${check_name}"
    if ! "$@"; then
        echo "ERROR: pre-release check failed: ${check_name}" >&2
        exit 1
    fi
}

#/**
# * @brief Validate syntax of every tracked shell script.
# * @details Enumerates tracked `*.sh` files via `git ls-files` and runs
# *          `bash -n` on each; runs ShellCheck on the same set only when
# *          the `shellcheck` binary is installed. Every sub-check reports
# *          its own diagnostic and returns non-zero on failure; the check
# *          is never silently skipped for tracked scripts.
# * @return Status 0 when all validations pass; status 1 naming the failing
# *         script otherwise.
# * @satisfies DES-029
# */
run_shell_syntax_checks() {
    local tracked_scripts script_file
    if ! tracked_scripts=$(git -C "${PROJECT_ROOT}" ls-files '*.sh'); then
        echo "ERROR: unable to enumerate tracked shell scripts." >&2
        return 1
    fi
    while IFS= read -r script_file; do
        [ -z "${script_file}" ] && continue
        if ! bash -n "${PROJECT_ROOT}/${script_file}"; then
            echo "ERROR: bash syntax validation failed: ${script_file}" >&2
            return 1
        fi
        echo "==> [OK] bash -n ${script_file}"
    done <<< "${tracked_scripts}"
    if command -v shellcheck > /dev/null 2>&1; then
        local shell_targets=()
        while IFS= read -r script_file; do
            [ -z "${script_file}" ] && continue
            shell_targets+=("${PROJECT_ROOT}/${script_file}")
        done <<< "${tracked_scripts}"
        if ! shellcheck "${shell_targets[@]}"; then
            echo "ERROR: ShellCheck validation failed." >&2
            return 1
        fi
        echo "==> [OK] shellcheck validation passed."
    else
        echo "==> [SKIP] shellcheck not installed; bash -n syntax validation already passed."
    fi
    return 0
}

#/**
# * @brief Validate syntax of every tracked JavaScript source and test file.
# * @details Enumerates tracked `*.js` files via `git ls-files` and runs
# *          `node --check` on each; any syntax error fails the check with
# *          a diagnostic naming the offending file.
# * @return Status 0 when every file parses; status 1 otherwise.
# * @satisfies DES-030
# */
run_javascript_syntax_checks() {
    local tracked_scripts script_file
    if ! tracked_scripts=$(git -C "${PROJECT_ROOT}" ls-files '*.js'); then
        echo "ERROR: unable to enumerate tracked JavaScript sources." >&2
        return 1
    fi
    while IFS= read -r script_file; do
        [ -z "${script_file}" ] && continue
        if ! node --check "${PROJECT_ROOT}/${script_file}"; then
            echo "ERROR: node --check syntax validation failed: ${script_file}" >&2
            return 1
        fi
        echo "==> [OK] node --check ${script_file}"
    done <<< "${tracked_scripts}"
    return 0
}

#/**
# * @brief Remove every execution-generated path, then verify integrity.
# * @details Snapshots the current `git status --porcelain --ignored`
# *          output and removes exactly the untracked (`??`) and ignored
# *          (`!!`) entries absent from the pre-execution baseline, so only
# *          run-generated paths are deleted and pre-existing user content,
# *          tracked files, and staged entries are never touched. Then it
# *          requires the final repository status to equal the baseline and
# *          removes the system temporary work area. Returns non-zero when
# *          any removal fails or the final state differs; callers compose
# *          this with the original exit status instead of masking it.
# * @return Status 0 when cleanup and integrity verification succeed;
# *         status 1 otherwise.
# * @satisfies DES-034 DES-035 DES-036 DES-037
# */
cleanup_and_verify() {
    local cleanup_rc=0
    local entry entry_path final_status
    if ! git -C "${PROJECT_ROOT}" -c core.quotepath=false status --porcelain --ignored > "${CURRENT_FILE}"; then
        echo "ERROR: unable to compute the repository status during cleanup." >&2
        return 1
    fi
    while IFS= read -r entry || [ -n "${entry}" ]; do
        case "${entry}" in
            '?? '*|'!! '*) ;;
            *) continue ;;
        esac
        entry_path="${entry:3}"
        if grep -Fxq -- "${entry}" "${BASELINE_FILE}"; then
            continue
        fi
        if [ -e "${PROJECT_ROOT}/${entry_path}" ] || [ -L "${PROJECT_ROOT}/${entry_path}" ]; then
            echo "==> [CLEANUP] removing generated path: ${entry_path}"
            rm -rf -- "${PROJECT_ROOT}/${entry_path}" || cleanup_rc=1
        fi
    done < "${CURRENT_FILE}"
    if ! git -C "${PROJECT_ROOT}" -c core.quotepath=false status --porcelain --ignored > "${FINAL_FILE}"; then
        echo "ERROR: unable to compute the final repository status." >&2
        return 1
    fi
    if ! cmp -s "${BASELINE_FILE}" "${FINAL_FILE}"; then
        {
            echo "ERROR: repository integrity verification failed: final state differs from the pre-execution baseline."
            echo "--- pre-execution baseline ---"
            diff "${BASELINE_FILE}" "${FINAL_FILE}" || true
        } >&2
        cleanup_rc=1
    else
        echo "==> [OK] repository integrity verified: no generated artifacts or modifications remain."
    fi
    rm -rf -- "${TMP_WORK_DIR}" || cleanup_rc=1
    return "${cleanup_rc}"
}

#/**
# * @brief Write the out-of-tree artifact validator script.
# * @details Generates a Bash validator inside the temporary work area
# *          (never inside the repository); it is executed after the build
# *          check and removed with the work area.
# * @satisfies DES-032 DES-033
# */
cat > "${VALIDATOR_FILE}" <<'VALIDATOR_EOF'
#!/bin/bash
# @file validate_artifacts.sh
# @brief Structural validator for generated release artifacts.
# @details Scans a target directory for first-level `*.tgz` package
#          tarballs, requires at least one, and verifies every tarball
#          opens as a readable gzip archive whose member listing is
#          non-empty (`tar -tzf`). Exits non-zero naming the first
#          invalid artifact; prints the validated artifact list on
#          success.
# @param argv[1] Target directory containing the built artifacts.
# @return Process exit status: 0 when all artifacts are valid; 1 otherwise.
# @satisfies DES-033

set -Eeuo pipefail

TARGET_DIR="$1"
shopt -s nullglob
TARBALLS=("${TARGET_DIR}"/*.tgz)
shopt -u nullglob

if [ "${#TARBALLS[@]}" -lt 1 ]; then
    echo "ERROR: artifact validation failed: missing package tarball in ${TARGET_DIR}" >&2
    exit 1
fi

for tarball in "${TARBALLS[@]}"; do
    if ! tar -tzf "${tarball}" > /dev/null 2>&1; then
        echo "ERROR: artifact validation failed: unreadable package tarball ${tarball}" >&2
        exit 1
    fi
done

echo "==> [OK] release artifacts valid: " "$(basename -- "${TARBALLS[0]}")" "... (${#TARBALLS[@]} tarballs)"
VALIDATOR_EOF

#/**
# * @brief Run the shell-script syntax phase.
# * @details `bash -n` on every tracked shell script; ShellCheck added when
# *          installed. Any failure aborts the whole verification.
# * @satisfies DES-029
# */
run_check "shell-script-syntax" run_shell_syntax_checks

#/**
# * @brief Run the JavaScript syntax-check phase.
# * @details `node --check` on every tracked JavaScript source and test
# *          file; a syntax error fails the run.
# * @satisfies DES-030
# */
run_check "javascript-syntax-check" run_javascript_syntax_checks

#/**
# * @brief Run the complete unit-test suite phase.
# * @details Executes the project-defined test command `npm test`
# *          (full suite, no selection); any failing test aborts the run.
# * @satisfies DES-031
# */
run_check "unit-test-suite" npm test

#/**
# * @brief Run the complete out-of-tree build phase.
# * @details Builds the full package tarball into the temporary work area
# *          with the release-workflow artifact procedure (`npm pack
# *          --pack-destination`); no artifact lands inside the repository
# *          tree.
# * @satisfies DES-032
# */
run_check "full-out-of-tree-build" npm pack --pack-destination "${BUILD_OUT_DIR}"

#/**
# * @brief Run the release-artifact structural validation phase.
# * @details Validates that the out-of-tree build produced readable package
# *          tarballs; any missing or corrupt artifact fails the run. The
# *          validator lives in the temporary work area.
# * @satisfies DES-033
# */
run_check "release-artifact-validation" bash "${VALIDATOR_FILE}" "${BUILD_OUT_DIR}"

exit 0
