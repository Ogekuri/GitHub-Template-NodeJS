#!/bin/bash
# -*- coding: utf-8 -*-
# VERSION: 0.0.8
# AUTHORS: Ogekuri

#/**
# * @file rename-me.sh
# * @brief One-shot template instantiation rename tool for copies of this
# *        GitHub template repository.
# * @details Substitutes the template identity strings (SRS Section 1.2
# *          rename-instantiation mapping) across the template copy: text
# *          file contents, file names, and directory names. The mandatory
# *          parameters `--description`, `--program`, `--shortname`,
# *          `--repository`, and `--publishname` replace the literal source
# *          strings; the optional `--author` and `--owner` default to the
# *          current template values, so their omission preserves them (a
# *          source string is active when its target value differs from
# *          it). Substitution rules are ordered so
# *          `githubtemplatenodejs` is replaced before its substring
# *          `templatenodejs` (DES-065). Binary files are detected via
# *          `grep -I` and skipped; `.git`, `node_modules`, caches, build
# *          outputs, and `temp/` working directories are pruned
# *          (DES-064). After the substitution the script renames every
# *          file and directory whose name carries an active source
# *          string, deepest-first (DES-066), verifies that no active
# *          source string survives in any processed content, filename, or
# *          path (DES-069), and finally removes itself so the renamed
# *          tree no longer contains any template source string. On any
# *          failure the script terminates non-zero with a diagnostic on
# *          stderr and keeps itself on disk (DES-068).
# * @note The publish-action pre-pass substitutes program-name occurrences
# *       inside `.github/workflows/release-npm.yml` with `--publishname`
# *       before the global `program` substitution (DES-067, A-15); the
# *       current workflow file carries no program-name occurrence, so the
# *       pre-pass is a no-op until one exists.
# * @note The script resolves the template root from its own location and
# *       never invokes git, so it also works on plain copies without a
# *       `.git` directory (DES-061). After a successful rename the
# *       `package-lock.json` hashes and names may be stale; refreshing it
# *       via `npm install` is a post-rename user step outside this script
# *       (A-14).
# * @pre GNU userland with bash, find, grep, sed, mv, rm, mktemp; the
# *      invocation directory is irrelevant.
# * @post On success the copy carries the new identity everywhere and
# *       this script no longer exists; on failure the exit status is
# *       non-zero, a diagnostic is printed on stderr, and this script is
# *       preserved unchanged.
# * @satisfies PRJ-010 DES-061 DES-062 DES-063 DES-064 DES-065 DES-066
# *            DES-067 DES-068 DES-069 CTN-014
# */

set -Eeuo pipefail

#/**
# * @brief Canonical template source strings and publish-action anchors.
# * @details `PROGRAM_SOURCE` anchors the publish-action pre-pass
# *          (DES-067); `PUBLISH_WORKFLOW` is the npm publish action file
# *          (A-15); the add_rule call order realizes DES-065.
# * @satisfies DES-065 DES-067
# */
PROGRAM_SOURCE="githubtemplatenodejs"
PUBLISH_WORKFLOW=".github/workflows/release-npm.yml"

#/**
# * @brief Print the parameter usage block on stdout.
# * @details Lists the five mandatory parameters, the two optional
# *          parameters with their template defaults, and the exit-status
# *          contract; used by `--help` and by every usage error.
# * @return {none} Prints on stdout; always returns 0.
# */
usage() {
    cat <<'EOF'
Usage: rename-me.sh --description <text> --program <name> --shortname <name>
                    --repository <name> --publishname <name>
                   [--author <name>] [--owner <name>]

Rename this copy of the template across file contents, filenames, and paths.

Mandatory parameters:
  --description  Replaces "GitHub template for NodeJS app".
  --program      Replaces "githubtemplatenodejs".
  --shortname    Replaces "templatenodejs".
  --repository   Replaces "GitHub-Template-NodeJS".
  --publishname  Replaces the program name inside the npm publish action
                 (.github/workflows/release-npm.yml).

Optional parameters:
  --author       Replaces "Francesco Rolando" (default: keep).
  --owner        Replaces "Ogekuri" (default: keep).

Exit status: 0 on success (this script removes itself); non-zero with a
stderr diagnostic on any usage, substitution, rename, or verification
failure (this script is kept).
EOF
}

#/**
# * @brief Enforce the value contract of one parsed parameter.
# * @details Rejects empty values and values carrying line-break characters;
# *          line-break values would break the line-oriented sed program
# *          and the NUL-delimited find/while path pipelines.
# * @param[in] flag $1: parameter flag as typed by the user (diagnostics).
# * @param[in] value $2: parsed parameter value to validate.
# * @return {none} Returns on a valid value; terminates with status 1 and a
# *          stderr diagnostic otherwise (DES-062, DES-068).
# * @satisfies DES-062 DES-068
# */
require_value() {
    local flag="$1"
    local value="$2"
    if [ -z "${value}" ]; then
        echo "ERROR: Parameter ${flag} requires a non-empty value." >&2
        exit 1
    fi
    case "${value}" in
        *$'\n'* | *$'\r'*)
            echo "ERROR: Parameter ${flag} must not contain line-break characters." >&2
            exit 1
            ;;
    esac
}

#/**
# * @brief Escape a literal string for use as a sed BRE pattern.
# * @details Backslashes are escaped first, then the regex metacharacters
# *          `]`, `[`, `^`, `$`, `*`, `.`, `|`, and `/`; the `#` character
# *          is the delimiter of the escaping expressions, so `/` can be
# *          escaped safely, and `|` is escaped because it delimits the
# *          generated substitution rules.
# * @param[in] text $1: literal source string to escape.
# * @return {str} Escaped pattern safe for `s|pattern|replacement|g`.
# */
escape_pattern() {
    printf '%s' "$1" \
        | sed -e 's/\\/\\\\/g' -e 's#[][^$*.|/]#\\&#g'
}

#/**
# * @brief Escape a literal string for use as a sed replacement.
# * @details Backslashes are escaped first, then the sed replacement
# *          metacharacter `&` and the `|` rule delimiter; every other
# *          character is emitted literally.
# * @param[in] text $1: literal target value to escape.
# * @return {str} Escaped replacement safe for `s|pattern|replacement|g`.
# */
escape_replacement() {
    printf '%s' "$1" \
        | sed -e 's/\\/\\\\/g' -e 's#[&|]#\\&#g'
}

#/**
# * @brief Append one ordered substitution rule to the sed program.
# * @details Inactive rules (source equal to target) are skipped so the
# *          residual verification enforces only active source strings.
# *          Rule order is the call order of the add_rule invocations
# *          (DES-065): description, repository, program, shortname,
# *          author, owner.
# * @param[in] source $1: literal template source string.
# * @param[in] target $2: replacement value typed by the user.
# * @param[out] SED_PROGRAM Appends one `s|...|...|g` rule line.
# * @param[out] ACTIVE_SOURCES Appends `source` when the rule is active.
# * @return {none}
# * @satisfies DES-063 DES-065
# */
add_rule() {
    local source="$1"
    local target="$2"
    if [ "${source}" = "${target}" ]; then
        return 0
    fi
    printf 's|%s|%s|g\n' \
        "$(escape_pattern "${source}")" \
        "$(escape_replacement "${target}")" >> "${SED_PROGRAM}"
    ACTIVE_SOURCES+=("${source}")
}

#/**
# * @brief Substitute the program name inside the npm publish action.
# * @details Pre-pass over `.github/workflows/release-npm.yml` replacing
# *          program-name occurrences with the `--publishname` value before
# *          the global `program` rule runs (DES-067); an absent file and
# *          absent occurrences are successful no-ops (A-15).
# * @return {none} Terminates non-zero when the in-place edit fails
# *          (DES-068).
# * @satisfies DES-067 DES-068
# */
apply_publishname_prepass() {
    if [ "${PUBLISHNAME_VALUE}" = "${PROGRAM_SOURCE}" ]; then
        return 0
    fi
    if [ ! -f "${PUBLISH_WORKFLOW}" ]; then
        return 0
    fi
    local rule_file="${TMP_WORK}/publish.sed"
    printf 's|%s|%s|g\n' \
        "$(escape_pattern "${PROGRAM_SOURCE}")" \
        "$(escape_replacement "${PUBLISHNAME_VALUE}")" > "${rule_file}"
    if ! sed -i -f "${rule_file}" -- "${PUBLISH_WORKFLOW}"; then
        echo "ERROR: Unable to substitute the publish-action program name in: ${PUBLISH_WORKFLOW}" >&2
        exit 1
    fi
}

#/**
# * @brief Report whether a file holds substitutable text content.
# * @details `grep -I` skips binary files; a non-matching or unreadable
# *          file (empty, binary, permission-denied) is reported as
# *          non-text so the caller skips it (DES-064).
# * @param[in] path $1: repository-relative file path (`./`-prefixed).
# * @return {bool} True when the file is readable text with content.
# * @satisfies DES-064
# */
is_text_file() {
    grep -I -q -e . -- "$1" 2>/dev/null
}

#/**
# * @brief Stream every substitutable file path of the template tree.
# * @details `find` inventory with `-print0` (NUL-delimited, safe for paths
# *          containing spaces); prunes `.git`, `node_modules`, `dist/`,
# *          `build/`, coverage outputs, and `temp/` working directories
# *          (DES-064). Consumed via process substitution so loop state
# *          stays in the main shell.
# * @param[out] stdout NUL-delimited `./`-prefixed file paths.
# * @return {none}
# * @satisfies DES-064
# */
find_template_files() {
    find . \
        \( -name .git \
           -o -name node_modules \
           -o -name dist \
           -o -name build \
           -o -name coverage \
           -o -name .nyc_output \
           -o -name temp \) -prune \
        -o -type f -print0
}

#/**
# * @brief Substitute all active source strings inside every text file.
# * @details Applies the ordered sed program (DES-065) in place to every
# *          text file of the pruned inventory; the running script itself
# *          is excluded so its substitution table stays intact
# *          (DES-064). GNU `sed -i` preserves file modes.
# * @return {none} Terminates non-zero when any in-place edit fails
# *          (DES-068).
# * @satisfies DES-064 DES-065 DES-068
# */
substitute_contents() {
    local file
    while IFS= read -r -d '' file; do
        if [ "${file}" = "${SCRIPT_RELATIVE_PATH}" ]; then
            continue
        fi
        if ! is_text_file "${file}"; then
            continue
        fi
        if ! sed -i -f "${SED_PROGRAM}" -- "${file}"; then
            echo "ERROR: Unable to substitute contents of: ${file}" >&2
            exit 1
        fi
    done < <(find_template_files)
}

#/**
# * @brief Rename every file and directory carrying an active source string.
# * @details `-depth` traversal emits children before parents, so each
# *          `mv` operates inside a not-yet-renamed parent and renaming a
# *          directory never invalidates earlier operations (DES-066). New
# *          basenames are computed by the same ordered sed program;
# *          `.git` paths are skipped because `-prune` is ineffective
# *          under `-depth`. An existing rename target aborts before any
# *          overwrite.
# * @return {none} Terminates non-zero when a rename fails or a target
# *          already exists (DES-068).
# * @satisfies DES-066 DES-068
# */
rename_paths() {
    local path
    local base
    local new_base
    local dir
    while IFS= read -r -d '' path; do
        case "${path}" in
            ./.git | ./.git/*) continue ;;
        esac
        base=$(basename -- "${path}")
        if ! new_base=$(printf '%s\n' "${base}" | sed -f "${SED_PROGRAM}"); then
            echo "ERROR: Unable to compute the new name of: ${path}" >&2
            exit 1
        fi
        if [ "${new_base}" = "${base}" ]; then
            continue
        fi
        dir=$(dirname -- "${path}")
        if [ -e "${dir}/${new_base}" ]; then
            echo "ERROR: Rename target already exists: ${dir}/${new_base}" >&2
            exit 1
        fi
        if ! mv -- "${path}" "${dir}/${new_base}"; then
            echo "ERROR: Unable to rename: ${path} -> ${dir}/${new_base}" >&2
            exit 1
        fi
        echo "==> [RENAME] ${path} -> ${dir}/${new_base}"
    done < <(find . -depth -print0)
}

#/**
# * @brief Verify that no active source string survived the rename.
# * @details Scans the pruned text-file inventory byte-wise per active
# *          source (binary archives stay excluded by the text filter,
# *          TST-034) and every file/directory basename; the running
# *          script itself is excluded from the content scan because it
# *          still carries the substitution table and is removed only
# *          after this verification succeeds (DES-069).
# * @return {int} 0 when the tree is residual-free; 1 with one stderr
# *          diagnostic per residual otherwise (DES-068).
# * @satisfies DES-069 DES-068
# */
verify_residuals() {
    local residual=0
    local file
    local path
    local base
    local source
    while IFS= read -r -d '' file; do
        if [ "${file}" = "${SCRIPT_RELATIVE_PATH}" ]; then
            continue
        fi
        if ! is_text_file "${file}"; then
            continue
        fi
        for source in "${ACTIVE_SOURCES[@]}"; do
            if grep -F -q -e "${source}" -- "${file}"; then
                echo "ERROR: Source string still present in: ${file}: ${source}" >&2
                residual=1
            fi
        done
    done < <(find_template_files)
    while IFS= read -r -d '' path; do
        case "${path}" in
            ./.git | ./.git/*) continue ;;
        esac
        base=$(basename -- "${path}")
        for source in "${ACTIVE_SOURCES[@]}"; do
            case "${base}" in
                *"${source}"*)
                    echo "ERROR: Source string still present in path: ${path}: ${source}" >&2
                    residual=1
                    ;;
            esac
        done
    done < <(find . -depth -print0)
    if [ "${residual}" -ne 0 ]; then
        return 1
    fi
    return 0
}

#/**
# * @brief Parse the CLI parameters before any mutation (DES-062).
# * @details Accepts the five mandatory value-taking parameters, the two
# *          optional value-taking parameters defaulting to their template
# *          source strings (DES-063), and `--help`; unknown flags and
# *          value-less flags terminate non-zero with the usage block.
# * @param[in] argv $@: raw CLI arguments.
# * @param[out] DESCRIPTION_VALUE PROGRAM_VALUE SHORTNAME_VALUE
# *             REPOSITORY_VALUE PUBLISHNAME_VALUE AUTHOR_VALUE
# *             OWNER_VALUE Parsed parameter values.
# * @return {none} Terminates non-zero on any usage error (DES-068).
# * @satisfies DES-062 DES-063 DES-068
# */
DESCRIPTION_VALUE=""
PROGRAM_VALUE=""
SHORTNAME_VALUE=""
REPOSITORY_VALUE=""
PUBLISHNAME_VALUE=""
AUTHOR_VALUE="Francesco Rolando"
OWNER_VALUE="Ogekuri"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --description)
            if [ "$#" -lt 2 ]; then
                echo "ERROR: Missing value for parameter: $1" >&2
                usage
                exit 1
            fi
            DESCRIPTION_VALUE="$2"
            shift 2
            ;;
        --program)
            if [ "$#" -lt 2 ]; then
                echo "ERROR: Missing value for parameter: $1" >&2
                usage
                exit 1
            fi
            PROGRAM_VALUE="$2"
            shift 2
            ;;
        --shortname)
            if [ "$#" -lt 2 ]; then
                echo "ERROR: Missing value for parameter: $1" >&2
                usage
                exit 1
            fi
            SHORTNAME_VALUE="$2"
            shift 2
            ;;
        --repository)
            if [ "$#" -lt 2 ]; then
                echo "ERROR: Missing value for parameter: $1" >&2
                usage
                exit 1
            fi
            REPOSITORY_VALUE="$2"
            shift 2
            ;;
        --publishname)
            if [ "$#" -lt 2 ]; then
                echo "ERROR: Missing value for parameter: $1" >&2
                usage
                exit 1
            fi
            PUBLISHNAME_VALUE="$2"
            shift 2
            ;;
        --author)
            if [ "$#" -lt 2 ]; then
                echo "ERROR: Missing value for parameter: $1" >&2
                usage
                exit 1
            fi
            AUTHOR_VALUE="$2"
            shift 2
            ;;
        --owner)
            if [ "$#" -lt 2 ]; then
                echo "ERROR: Missing value for parameter: $1" >&2
                usage
                exit 1
            fi
            OWNER_VALUE="$2"
            shift 2
            ;;
        --help | -h)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: Unknown parameter: $1" >&2
            usage
            exit 1
            ;;
    esac
done

require_value "--description" "${DESCRIPTION_VALUE}"
require_value "--program" "${PROGRAM_VALUE}"
require_value "--shortname" "${SHORTNAME_VALUE}"
require_value "--repository" "${REPOSITORY_VALUE}"
require_value "--publishname" "${PUBLISHNAME_VALUE}"

#/**
# * @brief Resolve the template root from the script location (DES-061).
# * @details `readlink -f` canonicalizes the invocation path (symlinks and
# *          relative components), the template root is the parent of the
# *          script directory, and the relative self path excludes the
# *          script from its own substitution; no git command is used, so
# *          plain copies without `.git` work identically. All expansions
# *          are quoted so invocation paths containing spaces are handled
# *          safely.
# * @param[out] FULL_PATH SCRIPT_DIR TEMPLATE_ROOT SCRIPT_RELATIVE_PATH
# *             Resolved absolute and repository-relative script paths.
# * @satisfies DES-061
# */
FULL_PATH=$(readlink -f -- "$0")
SCRIPT_DIR=$(dirname -- "${FULL_PATH}")
TEMPLATE_ROOT=$(dirname -- "${SCRIPT_DIR}")
SCRIPT_RELATIVE_PATH="./${FULL_PATH#"${TEMPLATE_ROOT}"/}"
cd -- "${TEMPLATE_ROOT}"
echo "==> [RENAME] template root: ${TEMPLATE_ROOT}"

#/**
# * @brief Allocate the run-scoped sed program workspace.
# * @details `mktemp -d` creates the workspace outside the template tree so
# *          the generated rule files are never part of the rename scope;
# *          the EXIT trap removes it on every termination path.
# * @param[out] TMP_WORK SED_PROGRAM ACTIVE_SOURCES Workspace path, sed
# *             program file, and ordered active-source registry.
# */
TMP_WORK=$(mktemp -d)
trap 'rm -rf -- "${TMP_WORK}"' EXIT
SED_PROGRAM="${TMP_WORK}/rename.sed"
: > "${SED_PROGRAM}"
ACTIVE_SOURCES=()

#/**
# * @brief Build the ordered substitution rules (DES-065).
# * @details Sequence: description, repository, program, shortname, author,
# *          owner; `githubtemplatenodejs` is always replaced before its
# *          substring `templatenodejs`, and omitted optional parameters
# *          add no rule (DES-063).
# * @satisfies DES-063 DES-065
# */
add_rule "GitHub template for NodeJS app" "${DESCRIPTION_VALUE}"
add_rule "GitHub-Template-NodeJS" "${REPOSITORY_VALUE}"
add_rule "${PROGRAM_SOURCE}" "${PROGRAM_VALUE}"
add_rule "templatenodejs" "${SHORTNAME_VALUE}"
add_rule "Francesco Rolando" "${AUTHOR_VALUE}"
add_rule "Ogekuri" "${OWNER_VALUE}"

#/**
# * @brief Execute the rename phases and finalize (DES-067..DES-069).
# * @details Order: publish-action pre-pass (DES-067), content
# *          substitution (DES-064/DES-065), deepest-first path renames
# *          (DES-066), residual verification (DES-069), self-removal
# *          (DES-069). Any failure exits non-zero with a stderr
# *          diagnostic and keeps the script on disk (DES-068).
# * @satisfies DES-067 DES-068 DES-069
# */
apply_publishname_prepass
substitute_contents
rename_paths
if ! verify_residuals; then
    echo "ERROR: Residual template strings detected; the rename is incomplete and this script is kept." >&2
    exit 1
fi
if ! rm -- "${FULL_PATH}"; then
    echo "ERROR: Unable to remove the rename script itself: ${FULL_PATH}" >&2
    exit 1
fi
echo "==> [RENAME] template renamed successfully; ${SCRIPT_RELATIVE_PATH} removed itself."
exit 0
