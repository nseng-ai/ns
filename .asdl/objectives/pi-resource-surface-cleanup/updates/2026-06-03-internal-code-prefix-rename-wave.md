# Internal-Code Prefix Rename Wave

## Summary

A second rename wave landed on `master` after the 2026-06-02 code/dev prefix resolution, completing the public-vs-internal split for the code/source-control skill family and retiring the last `dev-*` first-party skills.

Two landed commits advance this Objective beyond the previously recorded state:

- `c5e579b5` (2026-06-02 20:14) — renamed the repo-private code/source-control skills to the `internal-code-*` prefix and moved `/dev:cp` / `/dev:submit` into the `/code:*` namespace. Specifically: `code-checkpoint` → `internal-code-checkpoint`; `code-gt-restack-resolve` → `internal-code-gt-restack-resolve`; `code-gt-stackify-branch` → `internal-code-gt-stackify-branch`; `dev-gh` → `internal-code-gh`; `dev-gh-ci-debug` → `internal-code-gh-ci-debug`; `dev-just-fix` → `internal-code-just-fix`; `dev-stacker-agent` → `internal-code-stacker-agent`. `AGENTS.md`, `docs/agent-resource-catalog.md`, `docs/pi/README.md`, all `.agents/skills/` and `.claude/skills/` symlinks, skill frontmatter, cross-references, and `skills-lock.json` entries were updated to match. The commit also documents that skill visibility is controlled by `metadata.internal: true` rather than the prefix, and that `dev-` is reserved for the future `asdl-dev` namespace only.
- `acab3b17` (2026-06-02 22:05) — promoted two skills back to the public `code-*` prefix: `resolve-merge-conflicts` → `code-resolve-merge-conflicts` and `internal-code-gt-restack-resolve` → `code-gt-restack-resolve`, with symlinks, lock entries, catalog docs, and internal cross-references updated.

Net result in the current checkout (`master` at `acab3b17`, HEAD): no `dev-*` first-party skills remain. The code/source-control family is now split into public `code-*` (`code-gt-restack-resolve`, `code-resolve-merge-conflicts`) and repo-private `internal-code-*` (`internal-code-checkpoint`, `internal-code-gh`, `internal-code-gh-ci-debug`, `internal-code-gt-stackify-branch`, `internal-code-just-fix`, `internal-code-stacker-agent`). The former dev-prefixed internal skills (`dev-gh`, `dev-gh-ci-debug`, `dev-just-fix`, `dev-stacker-agent`) named as an Open Question and in the prior update now exist under `internal-code-*`.

Evidence: `git show` of `c5e579b5` and `acab3b17`; `master` HEAD at `acab3b17`. Working-tree changes touch only the unrelated `repo-ontology` Objective and were excluded. Current checkout: `skills/` has 42 first-party `SKILL.md` files (up from the 21 recorded in earlier phases, and confirming the 42 noted on 2026-06-02); `.agents/skills/` and `.claude/skills/` each expose 50 entries; `skills-lock.json` has 50 entries, of which 11 still carry `PENDING_REGEN`, including the renamed `internal-code-checkpoint`, `internal-code-gt-stackify-branch`, `code-gt-restack-resolve`, and `code-resolve-merge-conflicts`. PR evidence was not required; landed-commit and checkout evidence were sufficient. Verification for this Objective tracking edit: documentation-only change; `git diff --check` was not run as part of this tracking pass.

## Objective Impact

The code/source-control naming slice is now fully resolved at the prefix level. The prior Open Question about "remaining dev-prefixed internal skills" is no longer open as stated — those skills were renamed, not left as `dev-*` exceptions. The narrower remaining question is which `internal-code-*` skills should stay internal versus be promoted to public `code-*`, merged, or removed during the broader first-party audit.

The taxonomy and naming-policy rows are further advanced: the public-vs-internal distinction is now expressed through both the `code-*` / `internal-code-*` prefixes and `metadata.internal: true`. The first-party cluster audit, low-risk cleanup (including the 11 `PENDING_REGEN` lock entries), and the final stale-name closure pass remain open, so the Objective is not closure-ready.

## Follow-Ups

- Decide which `internal-code-*` skills should be promoted to public `code-*`, kept internal, merged, or removed as part of the broader first-party cluster audit.
- Settle or accept the remaining 11 `PENDING_REGEN` lock entries (several are the freshly renamed code/internal-code skills).
- Finish the first-party skill cluster audit for the remaining open clusters and explicitly accept or resolve each visible quality issue.
- Run a final stale-name pass across `CLAUDE.md`, skill docs, and catalog/docs before closure.
