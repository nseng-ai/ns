# Plan: Repo-Local Historical Semantic Update Cutoff

## Goal and Outcome

Implement a narrow compatibility rule for the selected Objective `retire-cmux-herdr-handoff-namespace` so `ns objective check retire-cmux-herdr-handoff-namespace` no longer applies title or required-section formatting checks to this repository's historical Semantic Updates at or before the agreed cutoff, while retaining strict format checks for later updates and for every other repository.

The cutoff is inclusive at `20260719T181812Z`. The known immutable update at the boundary is:

`.ns/objectives/retire-cmux-herdr-handoff-namespace/updates/20260719T181812Z-reference-based-herdr-handoff-launch.md`

The completed behavior must:

- recognize the ns source repository offline through a checked-in sentinel, not an absolute clone path or configured Git remote;
- scope the exception to Objective slug `retire-cmux-herdr-handoff-namespace`;
- quietly omit title and required-heading checks for qualifying historical updates;
- continue checking that qualifying update files are readable Markdown;
- continue enforcing title plus `## Summary`, `## Objective Impact`, and `## Follow-Ups` for post-cutoff updates, unparseable/non-timestamped update names, other Objective slugs, and non-ns repositories;
- leave every existing Semantic Update byte-for-byte unchanged;
- unblock normal Objective closure after focused and repository validation pass.

## Context and Discovered Facts

### Objective state

The explicitly selected Objective is `.ns/objectives/retire-cmux-herdr-handoff-namespace/`.

- All five semantic roadmap rows are `[x]`.
- `objective.md` says all substantive implementation, catalog, documentation, and validation criteria are complete.
- Closure is blocked only by the immutable update `20260719T181812Z-reference-based-herdr-handoff-launch.md`, which predates the current required update structure and lacks all three required `##` headings.
- The historical file was introduced by commit `4fbf08dbec77bebf5f8965ef4e786f9f7050ac11` (`2026-07-19T12:42:23-07:00`).
- Existing Semantic Updates must not be edited, normalized, moved, deleted, or recreated.
- At planning time, the repository was clean on branch `master`; the Objective Tracking Gate used `master...HEAD` and found no committed or uncommitted material changes.

### Current checker behavior

`ts/packages/capabilities/objectives/src/core/operations/check-objective.ts` defines:

- `requiredUpdateHeadings = ["## Summary", "## Objective Impact", "## Follow-Ups"]`;
- `checkObjective(...)`, which lists and reads every update;
- `updateMarkdownChecks(...)`, which always emits readability, title, and required-heading checks for every readable update.

`ns objective check retire-cmux-herdr-handoff-namespace --format json` currently reports exactly three errors, all for the boundary update's missing required headings. Its title and readability checks pass.

`ns objective check --all` is not the full-record checker: it is the Record Frontmatter edge sweep and is already green. The relevant regression command is the per-slug check.

### Platform/consumer boundary

`@nseng-ai/objectives` is published platform capability code under `ts/packages/capabilities/objectives/`, while `.ns/objectives/*` records are consumer instances. The user deliberately selected a hard-coded, temporary self-hosting exception in platform code rather than an `ns.toml` setting. Keep it as narrow and conspicuous as possible so it cannot become an accidental general compatibility mechanism.

Repository recognition must be offline and clone/worktree portable. Use the checked-in root `AGENTS.md` as the sentinel by reading it through the existing storage seam and requiring its exact first heading `# ns Agent Instructions`. Combine that identity check with the exact Objective slug and the timestamp cutoff. Do not match an absolute path, checkout directory basename, or Git remote.

A fork of the ns source tree retaining that sentinel is treated as the same source repository for this compatibility rule; this is preferable to remote dependence and is consistent with offline worktrees.

### Timestamp naming reality

Update names in this repository include multiple historical forms:

- compact UTC: `YYYYMMDDTHHMMSSZ-slug.md`;
- dashed UTC: `YYYY-MM-DDTHHMMSSZ-slug.md`;
- older date-only: `YYYY-MM-DD-slug.md`;
- some non-timestamped names.

The compatibility decision is a timestamp cutoff, not a one-file allowlist. Implement a small deterministic filename classifier that normalizes recognized timestamp prefixes to a comparable UTC key. Treat date-only names as midnight UTC on that date. A filename with no recognized prefix is not historical for this exception and remains strict. The inclusive cutoff is `20260719T181812Z`.

## Requirements Decisions from Grilling

- Use a timestamp cutoff, not a path manifest and not removal of update checks globally.
- Scope the compatibility behavior only to the ns repository.
- Hard-code the repository-specific policy in platform code rather than expose a configuration or CLI surface.
- Recognize the repository through a checked-in sentinel plus exact Objective scope, not Git remote identity.
- Quietly omit historical title/heading checks; do not emit per-heading or aggregate warnings.
- Preserve readability checks for historical updates.
- Keep strict checks for all updates outside the exception.

## Files, Symbols, Tests, and Documentation

### Primary implementation

`ts/packages/capabilities/objectives/src/core/operations/check-objective.ts`

Likely touched symbols:

- `requiredUpdateHeadings`
- `checkObjective(...)`
- `updateMarkdownChecks(...)`
- new private constants/functions colocated in this module for:
  - exact repo sentinel heading;
  - exact compatible Objective slug;
  - inclusive historical cutoff;
  - recognized update timestamp parsing/normalization;
  - repo/record/update eligibility judgment.

Prefer keeping this one-off rule private to the checker module. Do not add a public type, API export, Objective frontmatter key, storage schema, hidden database, or command option.

Use the existing `ObjectiveStorage.readMarkdownFile(...)` seam to read root `AGENTS.md`; do not add direct filesystem calls. Resolve the repository-compatibility fact once per per-slug check, not once per update.

### Focused tests

`ts/packages/capabilities/objectives/test/unit/check-objective.test.ts`

Add focused fake-storage scenarios covering at least:

1. ns sentinel + exact Objective slug + malformed update exactly at cutoff: checker succeeds, retains the update readability check, and emits no title/required-heading checks for that update.
2. ns sentinel + exact Objective slug + malformed update before cutoff, including a supported dashed/date-only historical filename: formatting checks are omitted.
3. ns sentinel + exact Objective slug + malformed update after cutoff: checker fails on title/headings as today.
4. ns sentinel + exact Objective slug + malformed non-timestamped update: checker remains strict.
5. missing or nonmatching sentinel + exact slug + at-cutoff malformed update: checker remains strict.
6. matching sentinel + different Objective slug + at-cutoff malformed update: checker remains strict.
7. unreadable qualifying historical update: readability failure is still reported and fails the check.
8. well-formed updates remain green on both sides of the cutoff.

The existing fake storage accepts arbitrary `files`, so seed root `AGENTS.md` there rather than weakening production identity checks or introducing ambient process mutation.

### Product/system documentation

`docs/objective-system.md`

Update the `ns objective check` contract to distinguish:

- required authoring shape for new Semantic Updates;
- the narrow ns self-hosting historical-cutoff exception;
- continued readability checking;
- inclusive cutoff and exact Objective scope;
- strict default behavior elsewhere.

Be explicit that this is compatibility for immutable history, not permission for future authors to omit headings.

`ts/packages/capabilities/objectives/CONTEXT.md`

Update the `Edge linting in ns objective check` or adjacent checker vocabulary only if needed to keep the package's stated checker behavior truthful. Do not broaden domain terminology or redefine Semantic Update, which remains canonical in root `CONTEXT.md`.

### Objective tracking and closure

After implementation and validation, use the `objective-update` workflow for `retire-cmux-herdr-handoff-namespace` rather than manually improvising tracking semantics.

Expected tracking outcome:

- do not edit any existing file under `updates/`;
- add a new timestamped Semantic Update recording the compatibility decision, implementation evidence, and the fact that the immutable legacy update was preserved;
- update `objective.md` to remove the now-stale closure blocker language and add concise `## Closure` evidence if the Closure Gate is clear;
- preserve completed roadmap rows, adjusting only stale blocker/evidence notes if needed;
- create `closed.md` when the Closure Gate passes;
- run `ns objective check retire-cmux-herdr-handoff-namespace` after tracking changes and confirm it passes.

Because the Objective's substantive work is complete and the compatibility failure is its sole recorded blocker, successful implementation and validation should make auto-closure clear. If any other completion criterion has regressed, leave it open and record the specific blocker rather than forcing closure.

## Implementation Steps

1. **Revalidate volatile state.**
   - Confirm branch and clean/dirty status.
   - Rerun `ns objective exec tracking-gate retire-cmux-herdr-handoff-namespace --format json`.
   - Rerun the failing per-slug check in JSON and verify the failure remains limited to the known historical update.
   - Do not edit or commit on `master`; if implementation will be committed, create/use a feature branch via the repository's Graphite workflow first.

2. **Add private compatibility constants and timestamp classification.**
   - Define the exact ns sentinel first heading, exact Objective slug, and inclusive cutoff near `requiredUpdateHeadings`.
   - Implement deterministic recognition of compact UTC, dashed UTC, and date-only prefixes.
   - Normalize to a lexically comparable compact UTC key or an equally explicit numeric representation.
   - Reject impossible calendar/time components rather than accepting a regex-only pseudo-date. Use built-in UTC date construction with round-trip component verification; do not add a dependency.
   - Return `null`/`undefined` for unrecognized names so they remain strict.

3. **Resolve ns repository identity once.**
   - In the per-slug checker path, read root `AGENTS.md` through `ObjectiveStorage.readMarkdownFile("AGENTS.md")`.
   - Treat the repository as ns only when the file is readable and its first Markdown heading is exactly `# ns Agent Instructions`.
   - Missing, unreadable, or nonmatching sentinel means no compatibility exception; it must not turn an otherwise valid Objective check into a storage error.
   - Avoid Git remote calls, absolute paths, cwd basename checks, environment variables, and direct `node:fs` access.

4. **Thread an explicit format-check decision into update checking.**
   - For each update, compute `skipHistoricalFormatChecks` only when all conditions hold: ns sentinel matches, selected slug matches exactly, filename timestamp is recognized, and timestamp is less than or equal to `20260719T181812Z`.
   - Keep `readableMarkdownChecks(...)` unchanged for every update.
   - If a qualifying historical update is readable, return only readability checks.
   - Otherwise preserve current title and required-heading checks exactly.
   - Do not produce warnings or synthetic compatibility check rows for omitted historical format checks.

5. **Add focused unit tests.**
   - Add compact test fixtures for valid and malformed update Markdown.
   - Assert not only exit status but the exact relevant check labels, proving omitted checks are absent and strict checks remain present where required.
   - Include the sentinel in arbitrary fake-storage `files`, not in Objective record content.
   - Keep tests fake-driven and avoid process/global/module mutation.

6. **Update checker documentation.**
   - Edit `docs/objective-system.md` precisely around `ns objective check` and Semantic Update authoring rules.
   - State that required headings remain mandatory for newly authored updates even where old immutable history is exempt from checker enforcement.
   - Update package context only if the existing checker description would otherwise be materially false.

7. **Run focused validation and inspect the real record.**
   - Run the Objectives package's focused checker unit tests.
   - Run package typecheck/check and formatting/lint checks appropriate to the touched files.
   - Run `ns objective check retire-cmux-herdr-handoff-namespace --format json` and inspect that:
     - status is `ok` before closure tracking;
     - the historical update still appears in the update inventory;
     - its readability check remains;
     - its title/required-heading rows are absent;
     - no historical update file changed.
   - Run `ns objective check --all` for the structural sweep.
   - Finish with repository `just`; if dprint fails, use `just dprint-fix` and rerun.

8. **Record meaningful Objective progress and close.**
   - Run `objective-update` for the exact selected slug.
   - Record a new Semantic Update and closure evidence without touching old updates.
   - Ensure all tracking changes stay under `.ns/objectives/retire-cmux-herdr-handoff-namespace/`.
   - Rerun the per-slug check after `closed.md` exists, ensuring `## Closure` is present and the closed record is structurally valid.

9. **Review the complete diff.**
   - Confirm no generic consumer configuration/API was introduced.
   - Confirm no compatibility behavior applies solely because a matching slug exists in an unrelated repo.
   - Confirm post-cutoff and non-timestamped malformed updates still fail.
   - Confirm no existing Semantic Update changed.
   - Confirm any kept changes are implementation, tests, truthful docs/context, and selected-Objective tracking only.

## Refactor Execution Strategy

This plan has a small number of semantic edits across approximately three platform/docs files plus selected-Objective tracking. Per `skills/enriched-plan-save/references/refactor-execution-strategy.md`, use direct reading and precise edits rather than a codemod, ad hoc `text.replace()` script, or `refactor-swarm`. The changes are not a broad same-shape refactor and require local semantic judgment at each site.

A final bounded grep should verify the cutoff/sentinel exception is declared in one implementation location and accurately documented, and that no accidental alternate compatibility mechanism was added. Suggested concepts to search: `20260719T181812Z`, `ns Agent Instructions`, `requiredUpdateHeadings`, and the selected Objective slug.

## Validation Guidance

Minimum focused commands should be derived from current package scripts, but are expected to include:

```sh
pnpm --dir ts --filter @nseng-ai/objectives test -- check-objective
pnpm --dir ts --filter @nseng-ai/objectives check
just ts-format-check
just ts-lint
just ts-test-typescript-style-guard
ns objective check retire-cmux-herdr-handoff-namespace --format json
ns objective check --all
just
```

If the package test script does not forward the Vitest filter as expected, run the package's declared test command or the workspace Vitest command targeted at `packages/capabilities/objectives/test/unit/check-objective.test.ts`; do not silently skip focused tests.

Also verify repository integrity directly:

```sh
git diff -- .ns/objectives/retire-cmux-herdr-handoff-namespace/updates/20260719T181812Z-reference-based-herdr-handoff-launch.md
git diff --name-status
git diff --check
```

The first command must produce no diff. After `objective-update`, only a newly added update file may appear under `updates/`; no pre-existing update may be modified.

## Risks, Assumptions, and Open Questions

### Risks

- **Platform leakage:** a consumer-specific hard-code in a published package is deliberately exceptional. Mitigate with exact sentinel, exact slug, exact cutoff, private symbols, and explicit documentation.
- **Sentinel false positive:** another repository could copy the ns root `AGENTS.md`. Requiring both the sentinel and exact Objective slug sharply narrows this; forks of ns are intentionally treated as ns source trees.
- **Timestamp parser overreach:** permissive regex matching could exempt malformed future names. Validate recognized date/time components and keep unrecognized names strict.
- **Cutoff boundary error:** the cutoff must be inclusive so the exact known file qualifies. Cover equality in tests.
- **Silent weakening:** quiet omission is intentional only for qualifying history. Tests must prove post-cutoff, other-slug, non-ns, and unparseable-name strictness.
- **Immutability violation:** do not repair the historical file itself, even though adding headings would be simpler.
- **Closure masking regression:** closure is appropriate only if the compatibility implementation passes and no substantive completion criterion has regressed.

### Assumptions

- Root `AGENTS.md` retains the first heading `# ns Agent Instructions` as a stable source-tree sentinel.
- Filename timestamps represent UTC when suffixed with `Z`; date-only historical names can be normalized to midnight UTC for cutoff comparison.
- No user-visible warning is desired for ignored historical formatting debt.
- Required Semantic Update headings remain an authoring contract enforced by skills and strict post-cutoff checking.

### Open questions

No material requirements remain open after grilling. The exact private helper names and code arrangement are implementation details, provided the behavioral boundaries above remain intact.

## Review and Remediation Checklist

- [ ] Exception requires exact ns sentinel match.
- [ ] Exception requires exact Objective slug.
- [ ] Cutoff equality is included.
- [ ] Compact, dashed, and date-only historical timestamp forms are deliberately handled.
- [ ] Invalid or unrecognized timestamps remain strict.
- [ ] Historical update readability still fails when unreadable.
- [ ] Historical title and required-heading checks are absent, not warnings.
- [ ] Future and unrelated updates retain current strict checks.
- [ ] No direct filesystem, remote, path-basename, or ambient-state identity check was added.
- [ ] No public API/config/frontmatter schema was added.
- [ ] `docs/objective-system.md` distinguishes authoring requirements from legacy checker compatibility.
- [ ] Existing Semantic Updates are byte-for-byte unchanged.
- [ ] Focused tests, typecheck, formatting, lint/style guard, per-slug check, edge sweep, and `just` pass.
- [ ] Objective tracking is meaningful, confined to the selected slug, and uses a new update.
- [ ] Closure records evidence and creates `closed.md` only after the Closure Gate is clear.
- [ ] PR submission, publication, deployment, and other external writes remain out of scope unless separately authorized.
