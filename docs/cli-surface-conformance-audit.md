# sdl CLI-Surface Conformance Audit (against `sdl-cli-design`)

## Purpose

This is a point-in-time conformance audit of the entire sdl CLI surface against
the `sdl-cli-design` standard (`skills/sdl-cli-design/SKILL.md`, ADRs
`docs/adr/0010`–`0014`). It produces a classified, per-command findings matrix
that a remediation sweep can execute from, and is intended to seed the planned
"apply sdl-cli-design standards across the CLI surface" Objective.

It is an evidence map, not an ADR and not a remediation. It mirrors the format of
`.sdl/objectives/agent-cli-design-discipline/references/clinkr-agent-era-gap-audit.md`.

## Scope and method

14 CLI entrypoint packages were enumerated (`ts/packages/*/src/cli.ts`), plus the
`@sdl/slot` command group that is mounted only under `sdl slot`; each leaf command
(including nested groups and hidden `exec` subgroups) was classified.

**Framework-enforced gates are treated as conformant by construction** and were
spot-verified, not re-derived: every CLI entrypoint package builds on
`@sdl/core/cli-entry` `defineCli` (so `-h`/`--version`/`--runtime` are wired
centrally), while the `@sdl/slot` command group is intentionally only mounted
under the owning `sdl` entrypoint. All `exec` subgroups use `isHidden: true`, and
the camelCase machine envelope, `0/1/2` exit codes, enveloped Zod usage errors,
and published `--json-schema` are inherited framework behavior (ADR 0011/0013).

The audit focuses on the four **command-local discipline** areas that the
framework does not enforce:

- **(a) Danger-tier classification** (ADR 0014, `references/danger-tiers.md`):
  per mutating command, tier 0–3; Tier 2 confirm uses `--yes`/`-y`, Tier 3
  precondition override uses `--force`/`-f`; prompts gate on
  `ClinkrInteraction.isInteractive()` and fail fast non-interactively with a
  `usageError` naming the flag (ideally via `requireInteractiveOrUsageError`).
- **(b) Output-volume bounding** (ADR 0012): large/unbounded results expose
  completion state, applied bound, and continuation/narrowing guidance in the
  result schema.
- **(c) `errorType` discipline** (ADR 0010): every `failure(...)` uses a stable
  snake_case `errorType` and structured, agent-actionable `data`.
- **(d) `negative(...)` semantic correctness** (ADR 0013): `negative(...)`
  (exit 1) for a real non-success; harmless empty success uses `ok(...)`.

## Classification legend

- **conformant** — meets the standard.
- **land-now-fix** — clear, low-contest gap fixable without a new ADR.
- **ADR-needed** — fixing requires a contested design decision.
- **parked** — out of scope / large / domain-specific deferral (e.g. ADR 0012
  evidence threshold not met).

## Coverage

| Package        | Leaf commands audited                                                                                                                                                         | Notes                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| areg           | `init`, `check`, `update-skills`, `skill list/show/apply`, `exec skillx parse/list/fetch/cleanup`                                                                             | own readline prompt gateway                                                 |
| aretro         | `exec collect-evidence`, `exec read-evidence-detail`                                                                                                                          | all hidden `exec`                                                           |
| branch-context | `exec from-plan/load/attach/list/check/delete`                                                                                                                                | all hidden `exec`; generic error wrapper                                    |
| brmem          | `put/get/delete/list/check/copy/export/setup-git`, `exec resolve-prompt`                                                                                                      | reference `--force` (put)                                                   |
| ccc            | `exec cmux-workspace-summary`, `exec autobranch`                                                                                                                              | `land`/`land-stack`/`cmux/*` are a Pi slash-command surface, not Clinkr CLI |
| handoff        | `list`, `delete`, `gc`                                                                                                                                                        | **reference** Tier 2 (`delete`) + Tier 3 (`gc`)                             |
| objective      | `archive`, `check`, `list`, `exec list-candidates/read-objective/runner-subagent-usage`                                                                                       | forwards kebab-case storage codes                                           |
| packagechk     | `NAME` (check), `claim-pypi`, `claim-npm`                                                                                                                                     | all `rawCommand` (raw-exit)                                                 |
| plans          | `list`, `exec save/resolve`                                                                                                                                                   | generic error wrapper                                                       |
| pr-address     | `exec pr-details/branch-pr/open-prs/pr-reviews/pr-review-threads/pr-discussion-comments/pr-checks/reply-review-thread/resolve-review-thread/download-feedback/map-branch-prs` | only external mutators in repo are the two thread writes                    |
| roaster        | `review list/ls/run/log`, `roast list`, `exec record-findings/publish-findings`                                                                                               | `publish-findings` is raw-exit                                              |
| sdl            | `shell show/install` (local; dual-mounted under `sdl` and `sdl slot`); mounts `@sdl/slot` group + runtime extension commands                                                  | umbrella; no static built-ins (`builtInCommandDefinitions = {}`)            |
| sdlcc          | `cmux report`                                                                                                                                                                 | TUI app; `cmux report` is `rawCommand`                                      |
| slot group     | `list/ls`, `checkout/co`, `goto`, `claim`, `free`, `gc`, `init`, `resize`, `gt up/down/free-stack`, `gt exec stack-branches/stack-map-branches`                               | mounted under `sdl slot`; **reference** Tier 3 (`gc`)                       |
| vibechk        | `runs`, `show`, `diff`, `run`                                                                                                                                                 | `run` is raw-exit; no failure envelope anywhere                             |

`sdl` umbrella note: the only commands physically defined under `ts/packages/sdl/src/`
are `shell show`/`shell install`. All other `sdl ...` commands are either the
`@sdl/slot` group (audited under **slot**) or runtime extension contributions
(loaded from project/global extensions; not statically present in this repo).

## Summary table (highest-value findings, safety-first order)

| #  | Area | Finding                                                                                                                                | Command(s)                                                                                                                                                       | Classification                                        |
| -- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1  | a    | Tier 2 destructive, no `--yes` / no confirm — deletes immediately                                                                      | `branch-context exec delete`, `brmem delete`                                                                                                                     | land-now-fix                                          |
| 2  | a    | Confirm prompt not `isInteractive()`-gated; can hang / silently decline non-interactively                                              | `areg init`, `areg skill apply`, `packagechk claim-pypi/claim-npm`                                                                                               | land-now-fix                                          |
| 3  | a    | Confirm gate keys on output-format proxy not `isInteractive()`; `failure("confirmation_required")` instead of flag-naming `usageError` | `slot free --all`                                                                                                                                                | land-now-fix                                          |
| 4  | a    | Wrong confirm verb: `--skip-confirmation` instead of `--yes`/`-y` (Tier 2/3 publish)                                                   | `packagechk claim-pypi/claim-npm`                                                                                                                                | land-now-fix                                          |
| 5  | a    | Single-PR land fast path merges to trunk with no confirmation while stack paths confirm                                                | `ccc land` (Pi surface)                                                                                                                                          | conformant (ADR 0015 #3: intentional)                 |
| 6  | a    | External GitHub write (Tier 2) with no confirm flag / interactive gate; agent-only hidden `exec`                                       | `pr-address exec reply-review-thread`, `resolve-review-thread`                                                                                                   | conformant (ADR 0015 #2: args suffice)                |
| 7  | d    | Operational/IO mutation failures returned as `negative` (exit 1) where `failure` (exit 2) is correct                                   | `areg init`, `areg skill apply`, `aretro exec collect-evidence`, `ccc exec cmux-workspace-summary`                                                               | land-now-fix                                          |
| 8  | d    | Real not-found / no-match returned as `failure` (exit 2) where `negative` (exit 1) is correct                                          | `brmem get/delete/copy`, `plans exec resolve`                                                                                                                    | land-now-fix                                          |
| 9  | d    | Missing required input returned as `negative`/`failure` where `usageError` is correct                                                  | `objective exec runner-subagent-usage`, `ccc exec cmux-workspace-summary`                                                                                        | land-now-fix                                          |
| 10 | d    | Query-miss (`ok(found:false)`) vs action-miss (`negative`) inconsistency across commands                                               | `pr-address` (pr-details/branch-pr/pr-checks vs download-feedback/map-branch-prs)                                                                                | conformant (ADR 0015 #4: predicate vs action)         |
| 11 | c    | kebab-case `errorType` (violates stable snake_case)                                                                                    | `areg exec skillx list/fetch` (`missing-tool`), `brmem exec resolve-prompt` (`prompt-not-found`), `objective` (all storage codes: `move-directory-failed`, etc.) | land-now-fix                                          |
| 12 | c    | All errors collapse to one generic `errorType` (`branch_context_error`/`plans_error`) via wrapper; modeled detail lost, no `data`      | `branch-context` (all), `plans` (all)                                                                                                                            | land-now-fix                                          |
| 13 | c    | `failure(...)` carries message only, no structured `data` (near-universal)                                                             | most packages                                                                                                                                                    | land-now-fix                                          |
| 14 | c/d  | `rawCommand` opts out of envelope entirely (no `errorType`/`resultSchema`; true failures exit 1 not 2)                                 | `packagechk` (all), `sdlcc cmux report`, `vibechk run`, `roaster exec publish-findings`, `ccc exec autobranch`                                                   | land-now-fix (ADR 0015 #1: narrow exemption; migrate) |
| 15 | b    | Unbounded output with no completion/bound state in schema                                                                              | `aretro` (both), `vibechk runs/show/diff`, `roaster review log`; (parked: pr-address lists, handoff list/gc, brmem list, plans list, objective read-objective)   | mixed (land-now-fix / parked)                         |

## Cross-cutting themes

1. **The conformant references work and are imitable.** `handoff delete` (Tier 2,
   `--yes`/`-y`), `handoff gc` + `slot gc` (Tier 3, `--force`/`-f`), and `brmem put`
   (Tier 3 `--force` precondition override) all gate via
   `requireInteractiveOrUsageError`, treat dry-run/cancel/empty as `ok(...)`, and
   reserve `failure("aborted")` for genuine aborts. These are the templates for
   remediating areas (a)/(d).

2. **Danger-tier gaps cluster in two shapes:** (i) Tier 2 deletes with *no*
   confirmation at all (`branch-context exec delete`, `brmem delete`), and (ii)
   commands that *do* confirm but gate on the wrong signal — a private prompt
   gateway (`areg`, `packagechk`) or an output-format proxy (`slot free`) — instead
   of `isInteractive()`, so they can hang or silently decline non-interactively
   rather than failing fast with a flag-naming `usageError`.

3. **`negative`/`failure`/`usageError` exit semantics are inconsistently applied.**
   The same conceptual outcome is modeled differently across packages: not-found is
   `failure` in `brmem`/`plans` but `negative` in `slot`/`objective`; missing
   required input is `negative` in some commands where `usageError` is correct;
   operational IO errors are `negative` where `failure` is correct. A short
   decision table (not-found → negative; bad/missing arg → usageError; operational
   error → failure) would resolve most of these.

4. **`errorType` discipline is the most pervasive gap.** Three sub-patterns:
   kebab-case leakage (notably every `objective` command forwarding raw storage
   gateway codes, plus `areg skillx` and `brmem resolve-prompt`); generic
   error-collapse wrappers in `branch-context` and `plans` that flatten well-modeled
   errors into one opaque type via `runClinkrCommand`; and the near-universal
   omission of structured `data` (recovery context lives only in human message
   strings). ADR 0010 treats `data` as "consider", so message-only failures are
   land-now-fix polish, but the kebab-case and error-collapse cases are clear
   violations.

5. **`rawCommand`/`isRawExit` packages opt out of the envelope contract.**
   `packagechk`, `sdlcc cmux report`, `vibechk run`, `roaster exec publish-findings`,
   and `ccc exec autobranch` deliberately bypass `ok/negative/failure/usageError`,
   `resultSchema`, and `--json-schema`, returning bare exit codes. Whether raw-exit
   is a sanctioned exemption from the pre-ship envelope items, or these commands
   should migrate onto the envelope, was a cross-cutting ADR-needed question,
   now resolved by ADR 0015 #1 (narrow exemption: only TUI/streaming/passthrough
   stays raw; today's finite-result raw commands migrate onto the envelope).
   Independently, several of them map true backend failures to exit 1 (negative
   range) rather than exit 2 — a land-now-fix even within the raw-exit model.

6. **Output bounding is mostly a non-problem today (ADR 0012 threshold).** Most
   "unbounded" lists are naturally domain-small (branch-scoped refs, per-repo
   plans, handoff inventories) and are parked. The genuine candidates are `aretro`
   (dereferences arbitrary `value: unknown` subtrees), `vibechk` (full
   transcripts/diffs), and `roaster review log` (accumulates per branch).

7. **`ccc land`/`land-stack` are not Clinkr CLI commands.** They are a Pi
   slash-command surface (`/sdl:flow:land`) on a bespoke `LandStackResult`
   framework, so most envelope/`errorType`/`negative` rubric items there are
   framework-mismatched (parked). The one substantive carry-over is the single-PR
   fast-path auto-merge danger inconsistency (#5 above).

## Per-package matrices

### areg

| Command                    | Mutating? | Area | Finding                                                                                                                                                                                                            | Classification | Evidence (file:line)                            |
| -------------------------- | --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ----------------------------------------------- |
| `areg init`                | Yes       | a    | Tier 2. Has `--yes` but confirm path not `isInteractive()`-gated — uses raw readline (`real-gateways.ts:238`), no `requireInteractiveOrUsageError`; non-interactively without `--yes` can hang or silently decline | land-now-fix   | `init.ts:455,477`; `real-gateways.ts:238`       |
| `areg init`                | Yes       | d    | Operational/precondition mutation failures return `negative` (exit 1); should be `failure` (exit 2)                                                                                                                | land-now-fix   | `init.ts:123,208,225,240`                       |
| `areg init`                | Yes       | c    | snake_case errorTypes but `failure(...)` calls carry no structured `data`                                                                                                                                          | land-now-fix   | `init.ts:156,160,164,169,188,196`               |
| `areg init`                | Yes       | b    | Result arrays bounded by fixed managed-file set                                                                                                                                                                    | conformant     | `init.ts:85-94`                                 |
| `areg check`               | No        | all  | Tier 0 read-only; `negative` for issues found, `ok` for clean; snake_case; bounded                                                                                                                                 | conformant     | `check.ts:108-112`                              |
| `areg update-skills`       | Yes       | a    | Tier 2 external write, but only refreshes declared lockfile skills + `--dry-run`; no prompt, so no hang. Defensible without `--yes`                                                                                | conformant     | `update-skills.ts:30,79-82`                     |
| `areg update-skills`       | Yes       | c    | `failure("skill_update_failed", string)` discards structured per-skill data (no `data` arg)                                                                                                                        | land-now-fix   | `update-skills.ts:111-112`                      |
| `areg update-skills`       | Yes       | d    | No-match returns `ok(emptyReport)` — correct                                                                                                                                                                       | conformant     | `update-skills.ts:68-69`                        |
| `areg skill list`          | No        | all  | Tier 0; empty→`ok`; path errors→`negative`, structural→`failure` (snake_case)                                                                                                                                      | conformant     | `skill-kind.ts:198,329`                         |
| `areg skill show`          | No        | all  | Tier 0; `negative` for not-found; snake_case                                                                                                                                                                       | conformant     | `skill-kind.ts:226-230`                         |
| `areg skill apply`         | Yes       | a    | Tier 2 (writes/deletes managed artifacts). Has `--yes` but deletion confirm not `isInteractive()`-gated (ungated readline); non-interactive hang/silent-decline risk                                               | land-now-fix   | `skill-kind.ts:268-285`; `real-gateways.ts:238` |
| `areg skill apply`         | Yes       | d    | Apply mutation failure returns `negative` (exit 1); operational write/delete failure should be `failure` (exit 2)                                                                                                  | land-now-fix   | `skill-kind.ts:296`                             |
| `areg skill apply`         | Yes       | b    | Bounded by user-supplied skills                                                                                                                                                                                    | conformant     | `skill-kind.ts:121`                             |
| `areg exec skillx parse`   | No        | d    | Tier 0 parse; parse failure `negative(result.error, result)` — defensible data-returning helper                                                                                                                    | conformant     | `skillx.ts:169-176`                             |
| `areg exec skillx list`    | No        | c    | `failure("missing-tool", ...)` kebab-case (should be snake_case)                                                                                                                                                   | land-now-fix   | `skillx.ts:183`                                 |
| `areg exec skillx list`    | No        | d    | "No skills directory" → `negative` with hint — correct                                                                                                                                                             | conformant     | `skillx.ts:188-195`                             |
| `areg exec skillx fetch`   | Yes       | c    | `failure("missing-tool", ...)` kebab-case                                                                                                                                                                          | land-now-fix   | `skillx.ts:207`                                 |
| `areg exec skillx fetch`   | Yes       | a/d  | Tier 1-2 transient-workspace write, hidden exec, no prompt; `fetchNegative` correct for empty/not-found                                                                                                            | conformant     | `skillx.ts:217,235-238`                         |
| `areg exec skillx cleanup` | Yes       | a    | Tier 2 recursive removal, but agent-only hidden exec on agent-supplied transient workspace; exec-tier waives interactive confirm; `cleanup_failed` snake_case                                                      | conformant     | `skillx.ts:252-258`; `cli.ts:71-77`             |

**areg notes:** Material gaps are cross-cutting: areg ships its own `AregPromptGateway`
(raw readline) instead of `ClinkrInteraction`, so neither `init` nor `skill apply`
gate on `isInteractive()` or fail fast naming `--yes` (zero uses of
`isInteractive`/`requireInteractiveOrUsageError`); both Tier 2 commands can hang or
silently decline non-interactively. Both also route operational/precondition mutation
failures through `negative` where ADR 0014 calls for `failure`. Two concrete kebab-case
`errorType` violations (`missing-tool`). Read-only commands are conformant.

### aretro

| Command                            | Mutating?           | Area | Finding                                                                                                                                                                                       | Classification   | Evidence (file:line)                                                  |
| ---------------------------------- | ------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------- |
| `aretro exec collect-evidence`     | Yes (payload write) | a    | Tier 1 create-only payload artifact; no prompts                                                                                                                                               | conformant       | `operations/collect-evidence.ts:89`                                   |
| `aretro exec collect-evidence`     | Yes                 | b    | `sessions` bounded by `maxSessions` (default 20) echoed as `query.max_sessions`, but schema exposes no completion/truncation/"more available" state                                           | land-now-fix     | `operations/collect-evidence.ts:41,202`; `contracts.ts:122-135`       |
| `aretro exec collect-evidence`     | Yes                 | c    | No `failure(...)`; all error paths route through `negative(...)` (error codes in `data.error.code` are snake_case)                                                                            | conformant (N/A) | `operations/collect-evidence.ts:237`                                  |
| `aretro exec collect-evidence`     | Yes                 | d    | Operational/IO errors (`payload_write_failed`) and precondition errors (`not_a_git_repo`, `detached_head`) all `negative` instead of `failure`/`usageError`; empty-no-sessions correctly `ok` | land-now-fix     | `operations/collect-evidence.ts:70,100,166,173,184,237`; ok at `:128` |
| `aretro exec read-evidence-detail` | No                  | a    | Tier 0 read-only pointer deref; no prompts                                                                                                                                                    | conformant       | `operations/read-evidence-detail.ts:23-53`                            |
| `aretro exec read-evidence-detail` | No                  | b    | `value: z.unknown()` can deref an arbitrarily large subtree; no size/completion bound in schema                                                                                               | land-now-fix     | `operations/read-evidence-detail.ts:15-19,48-52`                      |
| `aretro exec read-evidence-detail` | No                  | c    | `failure(...)` uses stable snake_case errorTypes but passes no structured `data`                                                                                                              | land-now-fix     | `operations/read-evidence-detail.ts:29,126-132`                       |
| `aretro exec read-evidence-detail` | No                  | d    | Pointer/path not-found surfaces as `failure(payload_lookup_failed)` — defensible as input/precondition error                                                                                  | conformant       | `operations/read-evidence-detail.ts:29,128`                           |

**aretro notes:** Biggest gap is `collect-evidence`'s blanket `negative(...)` for genuine
operational failures (payload-store IO, underlying git errors) which should be `failure`
(exit 2); the not-a-git-repo / detached-HEAD precondition cases are more debatable
(could be `usageError`). Both commands can return large structures without schema-level
completion/continuation signal, and `read-evidence-detail`'s failures omit structured
`data`. Danger-tier discipline is conformant (no destructive/prompt paths, correctly
under hidden `exec`).

### branch-context

| Command          | Mutating?                | Area | Finding                                                                                                                                                                 | Classification | Evidence (file:line)                                       |
| ---------------- | ------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------- |
| `exec from-plan` | Yes                      | a    | Tier 1: creates branch + brmem ref; additive, refuses overwrite, no override path → no confirm needed                                                                   | conformant     | `cli.ts:126`; `branch-context-creation.ts:102-103,289-310` |
| `exec from-plan` | Yes                      | c    | All failures collapse to generic `branch_context_error`; `failure()` message-only, no `data`                                                                            | land-now-fix   | `cli.ts:39,184`; `cli-entry.ts:156`                        |
| `exec load`      | Partial (opt file write) | a    | Tier 1: only external write is requested `--prompt-file`; no destructive action                                                                                         | conformant     | `cli.ts:213-218`                                           |
| `exec load`      | Partial                  | b    | Can emit full plan + impl prompt (opt-in); single requested doc, `byte_count` exposed → bounded enough                                                                  | conformant     | `cli.ts:219-223,399`; `attached-plan.ts:193`               |
| `exec load`      | Partial                  | c    | Generic catch-all errorType, no recovery `data`                                                                                                                         | land-now-fix   | `cli.ts:206`; `cli-entry.ts:156`                           |
| `exec attach`    | Yes                      | a    | Tier 1: additive, refuses overwrite (`assertBrmemEntryAbsent`), reversible                                                                                              | conformant     | `cli.ts:139`; `attach.ts:80,141-161`                       |
| `exec attach`    | Yes                      | c    | Generic `branch_context_error`, no structured `data`                                                                                                                    | land-now-fix   | `cli.ts:232`; `cli-entry.ts:156`                           |
| `exec list`      | No                       | b    | Returns all namespace entries, no completion/bound state; domain set tiny                                                                                               | conformant     | `cli.ts:247-248,323-341`                                   |
| `exec list`      | No                       | d    | Empty → `ok` with empty `entries` — correct                                                                                                                             | conformant     | `cli.ts:248`; `attach.ts:219-221`                          |
| `exec list`      | No                       | c    | Generic catch-all errorType, no `data`                                                                                                                                  | land-now-fix   | `cli.ts:246`; `cli-entry.ts:156`                           |
| `exec check`     | No                       | d    | Absent entry → `ok(present:false)` (exit 0) — presence-predicate ratified by ADR 0015 #5                                                                                | conformant     | `attach.ts:119-124`; `cli.ts:258,363-375`                  |
| `exec check`     | No                       | c    | Generic catch-all errorType, no `data`                                                                                                                                  | land-now-fix   | `cli.ts:256`; `cli-entry.ts:156`                           |
| `exec delete`    | Yes                      | a    | Tier 2 destructive (brmem-ref deletion): no `--yes`/`-y`, no confirmation, no non-interactive fail-fast — deletes immediately. Diverges from `handoff delete` precedent | land-now-fix   | `cli.ts:159-165,262-270`; `attach.ts:127-139`              |
| `exec delete`    | Yes                      | c    | Generic catch-all errorType, no `data`                                                                                                                                  | land-now-fix   | `cli.ts:266`; `cli-entry.ts:156`                           |

**branch-context notes:** Dominant gap is errorType discipline: every command funnels
thrown errors through `runClinkrCommand(BRANCH_CONTEXT_ERROR_TYPE, ...)`, emitting
`failure("branch_context_error", message)` with no `data` (`cli-entry.ts:156`), so
distinct modeled failures collapse into one opaque type. Second concrete gap is
`exec delete`: Tier 2 destructive with no `--yes` confirmation nor non-interactive
fail-fast. `from-plan`/`attach` are correctly additive Tier 1; `list` empty-as-`ok`
is correct. `check` returning `ok(present:false)` is ratified as conformant (ADR 0015 #5)
call. No prompts exist anywhere → no hang risk.

### brmem

| Command               | Mutating? | Area  | Finding                                                                                                                                                                                                                                                        | Classification | Evidence (file:line)                                                      |
| --------------------- | --------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------- |
| `put`                 | Yes       | a     | Tier 3 precondition override done correctly: `--force`/`-f` bypasses 1 MiB/binary caps via a `failure` whose message names `-f / --force`; matches ADR 0014 reference                                                                                          | conformant     | `cli.ts:64`; `operations/put.ts:15,30-41`; `put-entry-from-file.ts:56-70` |
| `put`                 | Yes       | c     | snake_case errorTypes; `failure(...)` carries only `(code, message)`, no `data`                                                                                                                                                                                | land-now-fix   | `operations/put.ts:40`; `operations/shared.ts:47-49`                      |
| `put`                 | Yes       | b/d   | No unbounded list; no `negative` misuse                                                                                                                                                                                                                        | conformant     | `operations/put.ts:55-62`                                                 |
| `get`                 | No        | d     | Missing entry → `failure("branch_memory_missing")` (exit 2); a meaningful not-found is the textbook `negative(...)` (exit 1) case                                                                                                                              | land-now-fix   | `operations/get.ts:36-41`                                                 |
| `get`                 | No        | a/b/c | Read-only; snake_case; single blob loosely bounded by put's cap                                                                                                                                                                                                | conformant     | `operations/get.ts:28-51`                                                 |
| `delete`              | Yes       | a     | Tier 2 destructive removal: no `--yes`/`-y`, no TTY-gated confirm — deletes immediately. Mitigant: tombstone commit keeps content recoverable in ref history (Tier-1 counter-argument)                                                                         | land-now-fix   | `cli.ts:78-86`; `operations/delete.ts:25-49`                              |
| `delete`              | Yes       | d     | Deleting absent key → `failure("key_not_found")` (exit 2); candidate for `negative`                                                                                                                                                                            | land-now-fix   | `operations/delete.ts:32-38`                                              |
| `list`                | No        | b     | `--all-branches` + all-namespaces can emit unbounded `entries`; no completion/bound state. Volumes realistically modest                                                                                                                                        | parked         | `operations/list.ts:31-45,94-105`                                         |
| `list`                | No        | a/c/d | Read-only; empty → `ok(entries:[])`; conflict/validation snake_case                                                                                                                                                                                            | conformant     | `operations/list.ts:51-59,98-105`                                         |
| `check`               | No        | d     | Missing entry → `ok(present:false)` (exit 0) — correct presence query                                                                                                                                                                                          | conformant     | `operations/check.ts:40-55`                                               |
| `copy`                | Yes       | a     | Tier 2 cross-branch write. Destructive overwrite gated by explicit `--overwrite` (conflict otherwise → `failure("destination_conflict")`); `--dry-run` → `ok`. Flag named `--overwrite` not ADR 0014 `--force` — domain-appropriate but a verb-split deviation | conformant     | `cli.ts:105-112`; `operations/copy.ts:35-39,114-119,133`                  |
| `copy`                | Yes       | d     | Empty source selection → `failure("no_matching_entries")` (exit 2); candidate `negative`, and inconsistent with `export` treating zero as `ok`                                                                                                                 | land-now-fix   | `operations/copy.ts:100-102`; `operations/export.ts:111-112`              |
| `copy`                | Yes       | c     | snake_case; `destination_conflict` lists conflicting keys in message only, not structured `data`                                                                                                                                                               | land-now-fix   | `operations/copy.ts:114-119,142-145`                                      |
| `copy`                | Yes       | b     | `copied` bounded by single-namespace/branch count                                                                                                                                                                                                              | conformant     | `operations/copy.ts:91-99,123-131`                                        |
| `export`              | Yes       | a     | Tier 2 filesystem write. Overwrite gated by explicit `--overwrite` (`target_exists` otherwise); `--dry-run` → `ok`; fresh temp dir default; symlink/path-safety preflight. Same `--overwrite`-vs-`--force` note                                                | conformant     | `cli.ts:113-120`; `operations/export.ts:43-48,123,380-388`                |
| `export`              | Yes       | d     | Zero entries → `ok` (exit 0). Prior "empty-success-should-be-ok" question re-verified: `ok` is defensible. Tension with `copy`'s `failure` on empty                                                                                                            | conformant     | `operations/export.ts:111-112`                                            |
| `export`              | Yes       | b/c   | `exported` bounded; snake_case (`write_failed`, `unsafe_target_path`); recovery hints in message not `data`                                                                                                                                                    | conformant     | `operations/export.ts:50-57,131,384-387`                                  |
| `setup-git`           | Yes       | a     | Tier 1: only *adds* git refspecs (idempotent); `--dry-run` → `ok`; no confirm needed                                                                                                                                                                           | conformant     | `cli.ts:121-128`; `operations/setup-git.ts:24-30,77,86-90`                |
| `setup-git`           | Yes       | b/c/d | Bounded additions; snake_case (`invalid_remote`, `remote_not_found`); no `negative` misuse                                                                                                                                                                     | conformant     | `operations/setup-git.ts:32-40,61-70`                                     |
| `exec resolve-prompt` | No        | c     | errorType `"prompt-not-found"` kebab-case (should be `prompt_not_found`); correctly under hidden `exec`                                                                                                                                                        | land-now-fix   | `operations/resolve-prompt.ts:37`; `cli.ts:129-143`                       |
| `exec resolve-prompt` | No        | a/b/d | Read-only; single-path result; gateway snake_case code propagated                                                                                                                                                                                              | conformant     | `operations/resolve-prompt.ts:20-46`                                      |

**brmem notes:** Danger-tier flag usage is mostly disciplined — `put`'s `--force` matches
the ADR 0014 reference, and `copy`/`export` gate overwrite behind an explicit flag with
`--dry-run` → `ok`. Two clearest gaps: (1) `exec resolve-prompt` kebab-case `errorType`;
(2) inconsistent not-found/empty exit policy — `get`/`delete`/`copy` use `failure`
(exit 2) for semantic not-found/no-match while `check`/`list`/`export` correctly use
`ok`, and `copy`-vs-`export` directly contradict. No `failure(...)` passes structured
`data`. Main uncertainty: `delete`'s tier (Tier 2 vs Tier 1, given tombstone recovery).

### ccc

| Command                                                                       | Mutating?                                                | Area | Finding                                                                                                                                                                                                                       | Classification           | Evidence (file:line)                                                                                 |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| `exec cmux-workspace-summary`                                                 | Yes (renames workspace, sets desc, clears status)        | a    | Tier 1 reversible external metadata write; no prompt path                                                                                                                                                                     | conformant               | `cmux/workspace-summary.ts:69-158`                                                                   |
| `exec cmux-workspace-summary`                                                 | Yes                                                      | b    | Fixed-shape result schema, no unbounded lists                                                                                                                                                                                 | conformant               | `cmux/workspace-summary.ts:36-43`                                                                    |
| `exec cmux-workspace-summary`                                                 | Yes                                                      | c    | No `failure()`/`errorType`; real command failures returned via `negative(...)` (exit 1) not `failure` (exit 2); `command_failure` data is rich but no errorType discriminator                                                 | land-now-fix             | `cmux/workspace-summary.ts:104-148,165-209`                                                          |
| `exec cmux-workspace-summary`                                                 | Yes                                                      | d    | `negative` misused for true failures and usage errors (`missing_description`, `missing_workspace` are usage/precondition → should be `usageError`; subprocess failures → `failure`)                                           | land-now-fix             | `cmux/workspace-summary.ts:76-90,208`                                                                |
| `exec autobranch`                                                             | Yes (Graphite branch, stash, checkpoint)                 | a    | Tier 1 scoped/reversible local git change (stash-restore recovery); no confirm                                                                                                                                                | conformant               | `cli.ts:127-161`                                                                                     |
| `exec autobranch`                                                             | Yes                                                      | b    | Single bounded summary + warnings                                                                                                                                                                                             | conformant               | `cli.ts:156-160`                                                                                     |
| `exec autobranch`                                                             | Yes                                                      | c    | `rawCommand`: raw exit 1 + plain stderr on error, no envelope/`resultSchema`/`errorType`; failure uses exit 1 (negative range) not 2                                                                                          | land-now-fix             | `cli.ts:92-102,152-155`                                                                              |
| `exec autobranch`                                                             | Yes                                                      | d    | rawCommand: no `ok/negative/failure`; error→1, success→0; no shell-visible negative concept                                                                                                                                   | conformant (N/A)         | `cli.ts:152-160`                                                                                     |
| `land` / `land-stack` (Pi `/sdl:flow:land`)                                   | Yes (squash-merge to trunk, `gt delete -f`, frees slots) | a    | Tier 3 high blast radius. Stack/chunked paths confirm, gate on `ctx.hasUI`, fail fast naming `--yes`. Single-PR fast path merges to trunk with NO confirmation — ratified intentional by ADR 0015 #3 (Pi surface, not Clinkr) | conformant (ADR 0015 #3) | `land.ts:171-176,336-399` (merge `:368`); confirm `land.ts:287-304`; `land-stack.ts:198-214,312-340` |
| `land` / `land-stack` (Pi)                                                    | Yes                                                      | b    | Failures embed full ExecResult stdout/stderr + full plan; Pi-rendered, no machine result schema                                                                                                                               | parked                   | `errors.ts:13-22`; `land-stack/presentation.ts`                                                      |
| `land` / `land-stack` (Pi)                                                    | Yes                                                      | c    | Single coarse `errorType` (`land_stack_failure`); category only in free-text message; not a Clinkr `failure`                                                                                                                  | parked                   | `errors.ts:13-44`; `landing-operations.ts:445-484`                                                   |
| `land` / `land-stack` (Pi)                                                    | Yes                                                      | d    | No `negative` concept; "nothing to do" → exit 0; cancellation modeled inconsistently; separate framework                                                                                                                      | parked                   | `land.ts:162-169,260,307-318`                                                                        |
| `cmux/*` Pi commands (dispatch-*, slot-open-branch, sidebar, claude-plan-tab) | Yes (mostly)                                             | all  | Pi slash commands (not Clinkr CLI); gate on `ctx.hasUI` not `isInteractive()`; out of scope for Clinkr standard                                                                                                               | parked                   | `ccc.ts:12-21`; `cmux/slot-open-branch.ts:143-162`                                                   |

**ccc notes:** ccc exposes only two Clinkr CLI commands, both correctly under the hidden
`exec` group; the destructive `land`/`land-stack` flow is a Pi slash-command surface on a
bespoke `LandStackResult` framework (most rubric items framework-mismatched → parked).
Two actionable command-local gaps: (1) `exec cmux-workspace-summary` routes real
subprocess failures and missing-input usage errors through `negative` instead of
`failure`/`usageError`; (2) the single-PR land fast path merges to trunk with no
confirmation while stack paths confirm — ratified intentional by ADR 0015 #3
(Pi surface). Lower-severity: `exec autobranch` rawCommand has no envelope
(ADR 0015 #1: migrate, since it is a finite-result command not a raw surface).

### handoff

| Command  | Mutating? | Area | Finding                                                                                                                                     | Classification | Evidence (file:line)                      |
| -------- | --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------- |
| `list`   | No        | a    | Tier 0 read-only; no confirm needed                                                                                                         | conformant     | `operations/list.ts:29`                   |
| `list`   | No        | b    | `--all` lists across every branch; `handoffs` is unbounded array with no completion/bound fields. Domain-small                              | parked         | `operations/list.ts:19-24`                |
| `list`   | No        | c    | `failure("branch_and_all_conflict")` + gateway codes snake_case; no `data` (consistent with reference)                                      | conformant     | `operations/list.ts:31,46`                |
| `list`   | No        | d    | Empty → `ok(handoffs:[])`                                                                                                                   | conformant     | `operations/list.ts:47-52,122`            |
| `delete` | Yes       | a    | **Reference** Tier 2: `--yes`/`-y`, gates via `requireInteractiveOrUsageError`, prompt defaults "no"                                        | conformant     | `cli.ts:79`; `operations/delete.ts:39-52` |
| `delete` | Yes       | c    | `failure(target/deleted.error.code)`, `failure("aborted")` — snake_case                                                                     | conformant     | `operations/delete.ts:37,51,58`           |
| `delete` | Yes       | d    | Decline → `ok(cancelled)`, abort → `failure("aborted")`                                                                                     | conformant     | `operations/delete.ts:50-51`              |
| `delete` | Yes       | b    | Single-item op                                                                                                                              | conformant     | `operations/delete.ts:59-67`              |
| `gc`     | Yes       | a    | **Reference** Tier 3: `--force`/`-f`, gates via `requireInteractiveOrUsageError`, `--dry-run`/empty → `ok`, dry-run+force conflict rejected | conformant     | `cli.ts:88`; `operations/gc.ts:37-59`     |
| `gc`     | Yes       | b    | `entries` unbounded array (all branches) with count but no completion/continuation. Domain-small                                            | parked         | `operations/gc.ts:22-30`                  |
| `gc`     | Yes       | c    | `failure("conflicting_flags")`, `failure("aborted")` + gateway codes snake_case                                                             | conformant     | `operations/gc.ts:38,58,93`               |
| `gc`     | Yes       | d    | Nothing to delete → `ok(preview)`; cancel → `ok(cancelled)`; abort → `failure`                                                              | conformant     | `operations/gc.ts:42,58-59`               |

**handoff notes:** The reference danger-tier commands remain conformant: `delete` Tier 2
(`--yes`/`-y`), `gc` Tier 3 (`--force`/`-f`), both gating prompts via
`requireInteractiveOrUsageError`, defaulting confirm to "no", treating
dry-run/cancel/empty as `ok`, reserving `failure("aborted")`. Only real gap is output
bounding (parked — inventories naturally small). Minor: mutually-exclusive-flag
conflicts modeled as `failure` rather than `usageError` (both exit 2, snake_case).
Failures carry message but no structured `data` (matches gold-standard convention).

### objective

| Command                      | Mutating? | Area | Finding                                                                                                                                                                | Classification | Evidence (file:line)                                                         |
| ---------------------------- | --------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------- |
| `archive`                    | Yes       | a    | Tier 1 reversible directory move (refuses overwrite via `destination_exists`→`negative`); no confirm needed                                                            | conformant     | `archive-objective.ts:89,68-73`                                              |
| `archive`                    | Yes       | c    | `failure(result.error.code, ...)` forwards **kebab-case** storage codes (`move-directory-failed`, `move-destination-exists`, `path-kind-failed`); no structured `data` | land-now-fix   | `archive-objective.ts:49`; `real-storage.ts:27,79`                           |
| `archive`                    | Yes       | b/d  | single-record result bounded; `source_not_found`/`destination_exists`/`invalid_slug`→`negative` correct, success→`ok`                                                  | conformant     | `archive-objective.ts:52-74`; `slug-validation-errors.ts:13-22`              |
| `check`                      | No        | a    | Tier 0 read-only                                                                                                                                                       | conformant     | `check-objective.ts:105-126`                                                 |
| `check`                      | No        | c    | `failure` forwards kebab-case storage code, no `data`                                                                                                                  | land-now-fix   | `check-objective.ts:110`; `real-storage.ts:27,48`                            |
| `check`                      | No        | b/d  | bounded; `not_found`/`failed`→`negative`, pass→`ok`                                                                                                                    | conformant     | `check-objective.ts:113-125,227-257`                                         |
| `list`                       | No        | a    | Tier 0 read-only                                                                                                                                                       | conformant     | `list-objectives.ts:57-65`                                                   |
| `list`                       | No        | b    | Branch-attribution bounded (cap 50) with completion state (`updatedBranchesTruncated/Included`); records list uncapped but naturally-bounded domain                    | conformant     | `list-objectives.ts:47-48,121-122,154`; `list-branch-attribution.ts:5,49,69` |
| `list`                       | No        | c    | `failure` forwards kebab-case storage/git code, no `data`                                                                                                              | land-now-fix   | `list-objectives.ts:62-63`; `real-storage.ts:27,48`                          |
| `list`                       | No        | d    | Empty → `ok` with empty `records`                                                                                                                                      | conformant     | `list-objectives.ts:64,114-125`                                              |
| `exec list-candidates`       | No        | a    | Tier 0 autocomplete helper; correctly hidden `exec`                                                                                                                    | conformant     | `cli.ts:81-93`; `list-candidates.ts:22-35`                                   |
| `exec list-candidates`       | No        | c    | `failure(inventory.error.code, ...)` kebab-case storage code, no `data`                                                                                                | land-now-fix   | `list-candidates.ts:28`; `real-storage.ts:27`                                |
| `exec list-candidates`       | No        | b/d  | bounded to active records; empty→`ok`                                                                                                                                  | conformant     | `list-candidates.ts:30-34`                                                   |
| `exec read-objective`        | No        | a    | Tier 0; hidden `exec`                                                                                                                                                  | conformant     | `cli.ts:94-104`; `read-objective.ts:104-119`                                 |
| `exec read-objective`        | No        | c    | `failure` forwards kebab-case storage code, no `data`                                                                                                                  | land-now-fix   | `read-objective.ts:109`; `real-storage.ts:27`                                |
| `exec read-objective`        | No        | b    | Returns full Markdown of objective.md/roadmap.md and **every** update file, no cap/completion state; deliberate full single-record read                                | parked         | `read-objective.ts:55-61,222-236`                                            |
| `exec read-objective`        | No        | d    | `not_found`/`invalid_slug`→`negative`, found→`ok`                                                                                                                      | conformant     | `read-objective.ts:112-118`                                                  |
| `exec runner-subagent-usage` | No        | a    | Tier 0 telemetry summarizer; hidden `exec`                                                                                                                             | conformant     | `cli.ts:105-115`; `runner-subagent-usage.ts:90-102`                          |
| `exec runner-subagent-usage` | No        | d    | Empty `sessionFiles` (effectively-required positional) → `negative` with hand-rolled `missing_session_file`; missing required input should be `usageError` (exit 2)    | land-now-fix   | `runner-subagent-usage.ts:77-79,95-100`                                      |
| `exec runner-subagent-usage` | No        | b/c  | input-bounded; per-file errors in-band; no `failure(...)` calls                                                                                                        | conformant     | `runner-subagent-usage.ts:107-148,262-283`                                   |

**objective notes:** Dominant systemic issue is (c): every `failure(...)` forwards
storage/git gateway `error.code` values that are **kebab-case** (`path-kind-failed`,
`move-directory-failed`, etc.) directly as `errorType`, violating ADR 0010 snake_case,
and none pass structured `data`. Only `archive` mutates — reversible, overwrite-refusing
Tier 1, so absence of `--yes`/`--force` is fine; no prompts/hang risk anywhere. Smaller:
`runner-subagent-usage` returns `negative` for missing required positional (should be
`usageError`); `read-objective` emits unbounded full-content reads (parked).

### packagechk

| Command                           | Mutating? | Area  | Finding                                                                                                                                                                                                                                                 | Classification                                | Evidence (file:line)                                                   |
| --------------------------------- | --------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| `packagechk NAME` (default check) | No        | a     | Tier 0 read-only; no confirm needed                                                                                                                                                                                                                     | conformant                                    | `cli.ts:49-54`; `check.ts:8-19`                                        |
| `packagechk NAME`                 | No        | b/c/d | Bounded (fixed 3 registries); raw-exit with correct exit mapping (taken→1, error→2, available→0); no envelope helpers used                                                                                                                              | conformant (within scope)                     | `models.ts:84-90`; `cli.ts:127-147`                                    |
| `packagechk claim-pypi NAME`      | Yes       | a     | Tier 2 (external write; leans Tier 3, near-irreversible name reservation). Prompt NOT `isInteractive()`-gated; no fail-fast `usageError` naming a flag non-interactively; confirm flag is `--skip-confirmation` not `--yes`/`-y`. `--dry-run`→0 correct | land-now-fix                                  | `claim-command.ts:37,108-114,123-134,325-339`; `confirmation.ts:49-56` |
| `packagechk claim-pypi NAME`      | Yes       | c/d   | Raw-exit: no `failure()`/`errorType`; declined/taken→1, validation/tool→2 (mapping coherent, helpers absent)                                                                                                                                            | land-now-fix (envelope), conformant (mapping) | `claim-command.ts:90-93,284-294`; `models.ts:84-90`                    |
| `packagechk claim-pypi NAME`      | Yes       | b     | Output small/bounded                                                                                                                                                                                                                                    | conformant                                    | `claim-command.ts:296-323`                                             |
| `packagechk claim-npm NAME`       | Yes       | a     | Identical to `claim-pypi` (shared `runClaimCommand`): Tier 2/3, prompt not gated, flag `--skip-confirmation` not `--yes`/`-y`; `--dry-run`→0                                                                                                            | land-now-fix                                  | `cli.ts:72-87`; `claim-command.ts:123-134,325-339`                     |
| `packagechk claim-npm NAME`       | Yes       | c/d   | Raw-exit: no `failure()`/`errorType`; exit mapping coherent                                                                                                                                                                                             | land-now-fix (envelope), conformant (mapping) | `claim-command.ts:90-93,118-122`                                       |
| `packagechk claim-npm NAME`       | Yes       | b     | Output small/bounded                                                                                                                                                                                                                                    | conformant                                    | `claim-command.ts:296-323`                                             |

**packagechk notes:** Every command is a `rawCommand`/`isRawExit` handler, deliberately
bypassing the envelope, `resultSchema`, and `--json-schema`; (c)/(d) are satisfied only
as raw exit-code mapping. Load-bearing defect: both claim commands' confirmation is not
gated on `isInteractive()` and there is no fail-fast `usageError` naming the bypass flag
for non-interactive runs (it prompts/reads stdin); flag is `--skip-confirmation` not the
ADR 0014 `--yes`/`-y` for a Tier 2 (arguably Tier 3) action. Note: the handoff's
"`packagechk claim`" does not exist; surface is `claim-pypi`/`claim-npm`. Open question:
is raw-exit an ADR-sanctioned envelope exemption?

### plans

| Command        | Mutating? | Area | Finding                                                                                                                               | Classification | Evidence (file:line)     |
| -------------- | --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------ |
| `list`         | No        | a    | Tier 0 read-only                                                                                                                      | conformant     | `cli.ts:99`              |
| `list`         | No        | b    | All saved plans across branch keys; bare `{plans:[...]}` no completion/bound. Domain-small                                            | parked         | `cli.ts:267`             |
| `list`         | No        | c    | All errors collapse to generic `errorType="plans_error"`, no `data` via `runClinkrCommand`                                            | land-now-fix   | `cli-entry.ts:156`       |
| `list`         | No        | d    | Empty → `ok({plans:[]})`                                                                                                              | conformant     | `cli.ts:155`             |
| `exec save`    | Yes       | a    | Tier 1 — creates new file in XDG store, opens `wx` (refuses overwrite), no clobber → no confirm/`--yes`/`--force`; hidden `exec`      | conformant     | `saved-plan-file.ts:511` |
| `exec save`    | Yes       | c    | Validation/IO failures thrown → generic `plans_error`, no `data`; arg mutual-exclusion is `failure` (exit 2) rather than `usageError` | land-now-fix   | `cli.ts:166`             |
| `exec save`    | Yes       | d    | Success → `ok`; no `negative` misuse                                                                                                  | conformant     | `cli.ts:193`             |
| `exec resolve` | No        | a    | Tier 0 read-only; hidden `exec`                                                                                                       | conformant     | `cli.ts:202`             |
| `exec resolve` | No        | c    | `NoSavedPlanAvailableError` carries actionable `reason`+`directoryPath` but discarded → generic `plans_error`, no `data`              | land-now-fix   | `saved-plan-file.ts:298` |
| `exec resolve` | No        | d    | "Latest plan not found" → `failure` (exit 2); a genuine not-found should be `negative` (exit 1)                                       | land-now-fix   | `saved-plan-file.ts:313` |

**plans notes:** Structurally clean — three commands, correct hidden `exec` grouping, no
destructive surfaces, `save` is a safe non-clobbering Tier 1 write (dimension (a) fully
conformant). Dominant gap is error discipline (c): every failure routes through
`runClinkrCommand(PLANS_ERROR_TYPE, ...)` producing one generic `plans_error` with no
`data`, so rich `NoSavedPlanAvailableError` detail and slug/mutual-exclusion usage errors
are lost. Clearest semantic bug (d): `exec resolve` reports "no saved plan available" as
`failure` (exit 2) instead of `negative` (exit 1); `cli.ts` never imports
`negative`/`failure`/`usageError`. Output bounding parked (domain-small).

### pr-address

All commands under a single hidden `exec` group (`cli.ts:37-43`, `isHidden: true`),
built via `defineExecOperation`. 11 leaf commands; only two mutate external state.

| Command                       | Mutating?                       | Area | Finding                                                                                                                            | Classification                    | Evidence (file:line)                                                |
| ----------------------------- | ------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `exec pr-details`             | No                              | a    | Read-only lookup; no confirm                                                                                                       | conformant                        | `primitive-commands.ts:67-72,156-168`                               |
| `exec pr-details`             | No                              | c    | snake_case errorTypes (`pr_gateway_failure`, `repo_context_required`) but no structured `data`                                     | land-now-fix                      | `exec-operation.ts:32,64,133`; `primitive-commands.ts:160-167`      |
| `exec pr-details`             | No                              | d    | PR-not-found → `ok(found:false)` — conformant predicate lookup (ADR 0015 #4)                                                       | conformant (ADR 0015 #4)          | `primitive-results.ts:30-37`; `primitive-commands.ts:160-167`       |
| `exec branch-pr`              | No                              | c/d  | Failures lack `data` (c); branch-not-found → `ok(found:false)` conformant predicate (ADR 0015 #4)                                  | land-now-fix (c) / conformant (d) | `primitive-commands.ts:77-82,170-182`; `primitive-results.ts:30-37` |
| `exec open-prs`               | No                              | b    | `{prs:[...]}` no completion/bound/continuation; PR lists can be large                                                              | parked                            | `collection.ts:127`; `primitive-commands.ts:184-190`                |
| `exec pr-reviews`             | No                              | b    | `{reviews:[...]}` unbounded                                                                                                        | parked                            | `collection.ts:137`; `primitive-commands.ts:192-204`                |
| `exec pr-review-threads`      | No                              | b    | `{review_threads:[...]}` unbounded (filters resolved client-side only)                                                             | parked                            | `collection.ts:160-162`; `primitive-commands.ts:206-221`            |
| `exec pr-discussion-comments` | No                              | b    | `{discussion_comments:[...]}` unbounded                                                                                            | parked                            | `collection.ts:171-173`; `primitive-commands.ts:223-235`            |
| `exec pr-checks`              | No                              | b    | `counts.has_more` present — only command exposing a bound/continuation hint                                                        | conformant                        | `collection.ts:68-74`; `primitive-results.ts:87-89`                 |
| `exec pr-checks`              | No                              | d    | Miss → `ok(found:false)` (predicate lookup) vs `download-feedback` `negative` (action) — both correct under ADR 0015 #4            | conformant (ADR 0015 #4)          | `primitive-commands.ts:243-244`; `download-feedback.ts:62-66`       |
| `exec reply-review-thread`    | **Yes (Tier 2 external write)** | a    | Posts a comment to GitHub; agent-only hidden `exec` — operation args are sufficient intent, no confirm flag required (ADR 0015 #2) | conformant (ADR 0015 #2)          | `primitive-commands.ts:134-143,301-315`                             |
| `exec resolve-review-thread`  | **Yes (Tier 2 external write)** | a    | Resolves a GitHub review thread; same agent-only hidden `exec` rule (ADR 0015 #2)                                                  | conformant (ADR 0015 #2)          | `primitive-commands.ts:144-153,317-330`                             |
| `exec download-feedback`      | No                              | b/d  | Read-only fetch+format; `counts` but no truncation/has_more. Miss → `negative` (correct)                                           | parked (b) / conformant (d)       | `download-feedback.ts:55-88,62-66`; `collection.ts:93-107`          |
| `exec map-branch-prs`         | No                              | c/d  | Missing/ambiguous → `negative`, match → `ok` (correct). Failures snake_case but no `data`                                          | conformant (d) / land-now-fix (c) | `map-branch-prs.ts:62-64,53,57,103`                                 |

**pr-address notes:** Only genuine external mutators are `reply-review-thread` and
`resolve-review-thread` (Tier 2 GitHub writes); both mutate unconditionally with no
`--yes`/`-y` flag or `isInteractive()`/`usageError` gate — but as agent-only hidden
`exec` commands, whether the human-tier Tier 2 confirm model applies is unsettled
(`agent-exec-tier.md:36-37` says replace prompts with a required flag + `usageError`),
so (a) is resolved by ADR 0015 #2 (agent-only hidden `exec`: required operation
args are sufficient intent; no added confirm flag). Cross-cutting (c): every `failure(...)` uses snake_case but none
pass `data`. (b): list commands expose no completion state (consistent with ADR 0012
parked); `pr-checks` alone carries `has_more`. (d): the lookup-miss (`ok(found:false)`) vs
action-miss (`negative`) split is now the ratified standard (ADR 0015 #4), not an
inconsistency — predicate lookups stay `ok`, requested-target/action misses stay
`negative`.

### roaster

| Command                 | Mutating? | Area  | Finding                                                                                                          | Classification | Evidence (file:line)                         |
| ----------------------- | --------- | ----- | ---------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------- |
| `review list`           | No        | all   | Tier 0 read-only; `ok` always, `count` exposed, finite catalog                                                   | conformant     | `cli.ts:84`; `cli-operations.ts:122,161`     |
| `review ls`             | No        | all   | Tier 0 read-only alias                                                                                           | conformant     | `cli.ts:92`                                  |
| `review run`            | Yes       | a     | Tier 1 additive Branch Memory log write; no confirm; non-interactive                                             | conformant     | `cli.ts:100`; `review-run.ts:127,174`        |
| `review run`            | Yes       | b     | findings + `inputCoverage` (omitted/cap state) + `count` in schema                                               | conformant     | `cli-operations.ts:220`; `models.ts:158`     |
| `review run`            | Yes       | c     | snake_case errorType via `failureFromRoaster`; no structured `data`                                              | land-now-fix   | `cli-operations.ts:225,433`                  |
| `review run`            | Yes       | d     | `negative` for `completed_log_failed` partial success — correct                                                  | conformant     | `cli-operations.ts:229-234`                  |
| `review log`            | No        | b     | `ok`+`count` but no continuation/bound state; entries accrue per branch                                          | land-now-fix   | `cli-operations.ts:332,341`                  |
| `review log`            | No        | a/c/d | Tier 0; empty→`ok` correct; snake_case errorType                                                                 | conformant     | `cli-operations.ts:340,352`                  |
| `roast list`            | No        | all   | Tier 0 read-only; finite catalog, `count`                                                                        | conformant     | `cli.ts:124`; `cli-operations.ts:190,209`    |
| `exec record-findings`  | Yes       | a     | Tier 1 additive log write; reads stdin; non-interactive                                                          | conformant     | `cli.ts:139`; `cli-operations.ts:287`        |
| `exec record-findings`  | Yes       | c     | snake_case errorType; no structured `data`                                                                       | land-now-fix   | `cli-operations.ts:312,323`                  |
| `exec record-findings`  | Yes       | d     | `negative` for log-write-failed partial success — correct                                                        | conformant     | `cli-operations.ts:289-293`                  |
| `exec publish-findings` | Yes       | a     | Tier 1 additive/idempotent GitHub PR comments; CI non-interactive                                                | conformant     | `cli.ts:147`; `findings-publication.ts:1-34` |
| `exec publish-findings` | Yes       | c/d   | rawCommand: no envelope/`resultSchema`/`errorType`; real backend error returns exit 1 (should be failure/exit 2) | land-now-fix   | `cli-operations.ts:368-385,458`              |

**roaster notes:** Largely conformant: clean Tier-1-only danger profile (no destructive
flows, no prompt-hang surface), disciplined snake_case `errorType`, semantically correct
`negative` for partial-success log-write failures, good input-coverage bounding on review
runs. Main fix: `exec publish-findings` rawCommand skips the envelope and returns exit 1
instead of `failure` exit 2 on genuine GitHub failures. Secondary: attach structured
`data` to `failure(...)`; consider bound/continuation state for `review log`.

### sdl

Command tree:

- `sdl shell show` — LOCAL (`cli.ts:284`; op `operations/shell.ts:30`)
- `sdl shell install` — LOCAL (`cli.ts:294`; op `operations/shell.ts:36`)
- `sdl slot shell show` / `sdl slot shell install` — LOCAL (same group, dual-mounted via `cli.ts:182`)
- `sdl slot ...` group — defined in `@sdl/slot` (`slot/src/command-face.ts`); audited under **slot**: `list/ls/checkout/co/goto/claim/free/gc/init/resize`, `gt up/down/free-stack`, `gt exec stack-branches/stack-map-branches`
- Dynamic extension commands — runtime-loaded from project/global extensions (`cli.ts:185-217`); no static built-ins (`command-registry.ts:51`); defined outside this package

| Command                                          | Mutating? | Area | Finding                                                                                                                                            | Classification | Evidence (file:line)                                                 |
| ------------------------------------------------ | --------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------- |
| `sdl shell show` (= `sdl slot shell show`)       | No        | a    | Tier 0 read-only; resolves shell + renders script                                                                                                  | conformant     | `operations/shell.ts:30-34`                                          |
| `sdl shell show`                                 | No        | c    | `failure("unsupported_shell", msg)` snake_case but no structured `data`                                                                            | land-now-fix   | `operations/shell.ts:32`; `sdl-core/src/shell-support.ts:135-140`    |
| `sdl shell show`                                 | No        | b/d  | Fixed bounded script; no negative path needed                                                                                                      | conformant     | `operations/shell.ts:33`                                             |
| `sdl shell install` (= `sdl slot shell install`) | Yes       | a    | Writes a managed marker block to a user dotfile outside the repo → **Tier 2** (ADR 0015 #6); needs `--yes`/`-y` + `requireInteractiveOrUsageError` | land-now-fix   | `operations/shell.ts:36-50`; `sdl-core/src/shell-support.ts:114-129` |
| `sdl shell install`                              | Yes       | c    | Shared `unsupported_shell` failure lacks structured `data`                                                                                         | land-now-fix   | `operations/shell.ts:38`; `sdl-core/src/shell-support.ts:135-140`    |
| `sdl shell install`                              | Yes       | d    | Already-installed → `ok(is_already_installed:true)` — correct                                                                                      | conformant     | `operations/shell.ts:45-49`                                          |
| `sdl shell install`                              | Yes       | b    | Single bounded result object                                                                                                                       | conformant     | `operations/shell.ts:45-49`                                          |
| `sdl slot ...` (all slot/gt commands)            | n/a       | all  | defined in `@sdl/slot`; audited under **slot**                                                                                                     | parked         | `slot/src/command-face.ts`                                           |
| dynamic extension commands                       | varies    | all  | runtime-loaded from extensions; not statically defined here                                                                                        | parked         | `cli.ts:185-217`                                                     |

**sdl notes:** Substantive local surface is tiny — only `shell show`/`shell install`
(dual-mounted under `sdl` and `sdl slot`); the umbrella mostly composes the `@sdl/slot`
group and runtime extension commands. One concrete command-local gap: missing structured
`data` on the shared `unsupported_shell` failure (e.g. `{shell, supportedShells}`). The
danger tier of `shell install` is resolved to **Tier 2** by ADR 0015 #6 (it mutates a
user dotfile outside the repo), so it needs `--yes`/`-y` + non-interactive fail-fast
(`land-now-fix` (a)), distinct from explicit `--output <path>` writes which stay Tier 1. Command tree is
complete for code physically under `ts/packages/sdl/src/`; runtime extension commands are
by design not present in this repo. (Aside: extension-contributed commands run through the
legacy `{ok, exitCode, message}` SdlResult path, not the Clinkr envelope — a separate
extension-SDK concern.)

### sdlcc

| Command       | Mutating?                                       | Area | Finding                                                                                                                                                                                   | Classification | Evidence (file:line)                          |
| ------------- | ----------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------- |
| `cmux report` | Yes (external write: `cmux surface resume set`) | a    | Tier 1 reversible external metadata write keyed by env-provided IDs (not a user dotfile) — stays Tier 1 (ADR 0015 #6); no prompt, no hang                                                 | conformant     | `cmux-report.ts:91-102,131`; `cli.ts:81-86`   |
| `cmux report` | Yes                                             | b    | Single fixed-shape metadata record (5-6 fields); bounded by construction                                                                                                                  | conformant     | `cmux-report.ts:134-145`                      |
| `cmux report` | Yes                                             | c    | `rawCommand`: bespoke `{ok:false, error}` JSON, no snake_case `errorType`, no `data`, no `resultSchema`/`--json-schema`                                                                   | land-now-fix   | `cli.ts:60-89`; `cmux-report.ts:134-145`      |
| `cmux report` | Yes                                             | d    | Genuine failures (missing `CMUX_WORKSPACE_ID`/`CMUX_SURFACE_ID`, not a worktree, detached HEAD, `cmux` exit≠0) all return exit 1 (`negative`) rather than `failure`/`usageError` (exit 2) | land-now-fix   | `cli.ts:79,86`; `cmux-report.ts:44-52,95-100` |

**sdlcc notes:** sdlcc is overwhelmingly a TUI app; its only conventional CLI leaf is
`cmux report`, authored as a `rawCommand` and so opting out of the Clinkr envelope,
`resultSchema`, and `--json-schema` — (c)/(d) are gaps rather than conformant-by-
construction. Fix shape: migrate to a schema→handler command returning `ok(...)` and
`failure(snake_case, msg, data)` (exit 2) for precondition/mutation errors. Danger tier
is fine; no non-interactive hang risk. Scenario tests assert the bespoke `{ok}` shape and
would need updating on migration.

### slot

| Command                      | Mutating? | Area  | Finding                                                                                                                                                                                                                                                                                                                                               | Classification | Evidence (file:line)                                           |
| ---------------------------- | --------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| `list` / `ls`                | No        | all   | Tier 0 read-only; `ok()` always, `failure(ctx.repo.errorType)` snake_case; bounded by pool size (max 99)                                                                                                                                                                                                                                              | conformant     | `operations/list.ts:27-41`; `cli.ts:117-132`                   |
| `checkout` / `co`            | Yes       | a/c/d | Tier 1 (assigns slot / optionally creates branch, reversible); snake_case errorTypes (`mutually_exclusive_args`, `missing_arg`, `base_without_new`); `ok()` success                                                                                                                                                                                   | conformant     | `operations/checkout.ts:36-59`                                 |
| `goto`                       | No        | a/d   | Tier 0; `negative(...)` correct for unassigned slot; `failure` snake_case (`pool_empty`, `worktree_missing`)                                                                                                                                                                                                                                          | conformant     | `operations/goto.ts:33-73`                                     |
| `claim`                      | Yes       | all   | Tier 1 (moves branch into slot, reversible); single `failure` passthrough snake_case; `ok()`                                                                                                                                                                                                                                                          | conformant     | `operations/claim.ts:31-35`                                    |
| `free`                       | Yes       | a     | Tier 2 for `--all` (closes PRs + deletes branches), exposes `--yes`/`-y`; base free is Tier 1. BUT confirm gate keys on `ctx.shouldWriteCdDirective` (output-format proxy) not `isInteractive()`, and emits `failure("confirmation_required")` instead of flag-naming `usageError`; does not use `requireInteractiveOrUsageError`. Diverges from `gc` | land-now-fix   | `operations/free.ts:76-97`; `cli.ts:171-185`                   |
| `free`                       | Yes       | a     | Non-interactive human-format path falls through to `interaction.confirm`, reads stdin, returns `failure("aborted")` on EOF rather than failing fast naming the flag                                                                                                                                                                                   | land-now-fix   | `operations/free.ts:82-86`                                     |
| `free`                       | Yes       | b/c/d | `--dry-run`→`ok`; cleanup errors→`negative`; declined→`ok(cancelled)`; bounded by pool; snake_case (no `data`, consistent with `gc`)                                                                                                                                                                                                                  | conformant     | `operations/free.ts:66-116`                                    |
| `gc`                         | Yes       | a     | **Reference** Tier 3, `--force`/`-f`, gates via `requireInteractiveOrUsageError` naming `--force`; `--dry-run`→`ok`; `conflicting_flags` failure                                                                                                                                                                                                      | conformant     | `operations/gc.ts:55-101`; `cli.ts:186-194`                    |
| `gc`                         | Yes       | b/c/d | Cleanup errors→`negative`; declined→`ok(cancelled)`; bounded by pool; snake_case                                                                                                                                                                                                                                                                      | conformant     | `operations/gc.ts:88-100`                                      |
| `init`                       | Yes       | all   | Tier 1 (creates detached slots; refuses if pool exists via `pool_already_initialized`); snake_case `invalid_size`; `ok()`                                                                                                                                                                                                                             | conformant     | `operations/init.ts:20-26`; `lifecycle/pool.ts:82-90`          |
| `resize`                     | Yes       | a     | Tier 1: shrink removes only empty/detached slots — `validateRemovals` refuses assigned/dirty via `failure("resize_unsafe")`, no work destroyed; no confirm needed                                                                                                                                                                                     | conformant     | `operations/resize.ts:22-26`; `lifecycle/pool.ts:131-187`      |
| `gt up`                      | Yes       | a/d   | Tier 1; `negative` for no/multiple upstack; `failure` snake_case (`untracked_branch`, `gt_children_failed`)                                                                                                                                                                                                                                           | conformant     | `operations/gt/up.ts:28-52`                                    |
| `gt down`                    | Yes       | a/d   | Tier 1; `negative` for no downstack; `failure` snake_case                                                                                                                                                                                                                                                                                             | conformant     | `operations/gt/down.ts:16-35`                                  |
| `gt free-stack`              | Yes       | a/d   | Tier 1 (detaches worktree to trunk, keeps worktree, no PR/branch deletion); noop (`on_trunk`/`no_slots`)→`ok` (note: `gt exec stack-branches` treats on-trunk as `negative`); `failure` snake_case                                                                                                                                                    | conformant     | `operations/gt/free-stack.ts:26-96`                            |
| `gt exec stack-branches`     | No        | all   | Tier 0, hidden `exec`; `negative` for on-trunk; rich snake_case errorTypes (`stack_metadata_inconsistent`, `forked_stack`); `warnings[]`; bounded by stack                                                                                                                                                                                            | conformant     | `operations/gt/exec/stack-branches.ts:35-70`; `cli.ts:247-259` |
| `gt exec stack-map-branches` | No        | b     | Tier 0, hidden `exec`; bounded by `recentLimit` (default 40) surfaced as `recent_limit` + `warnings[]`; no explicit truncation flag (seed limit feeds graph selection)                                                                                                                                                                                | conformant     | `operations/gt/exec/stack-map-branches.ts:48-66,99-137`        |
| `gt exec stack-map-branches` | No        | c/d   | Always `ok` after guard failures; snake_case errorTypes; no `negative` misuse                                                                                                                                                                                                                                                                         | conformant     | `operations/gt/exec/stack-map-branches.ts:81-97`               |

**slot notes:** Largely conformant: `gc` is the clean Tier 3 reference, danger tiers
correctly assigned (most mutations reversible Tier 1; `free --all` the only Tier 2 surface,
correct `--yes`/`-y` verb), `negative` vs `ok` sensible, all `failure(...)` snake_case.
One real defect: `free`'s confirmation keys on `ctx.shouldWriteCdDirective` (output-format
proxy) instead of `isInteractive()` and returns `failure("confirmation_required"/"aborted")`
rather than a flag-naming `usageError` via `requireInteractiveOrUsageError`. Cosmetic:
failures carry no `data` (matches `gc`); on-trunk modeled as `negative` in `gt exec
stack-branches` yet `ok` in `gt free-stack` (both defensible).

### vibechk

| Command | Mutating? | Area | Finding                                                                                                                                | Classification    | Evidence (file:line)                               |
| ------- | --------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------- |
| `runs`  | No        | a    | Tier 0 read-only; no confirm needed                                                                                                    | conformant        | `cli.ts:101-107`                                   |
| `runs`  | No        | b    | Full bundle list, no bound/completion state in `RunsResult`                                                                            | land-now-fix      | `cli.ts:155`; `store.ts:88-117`                    |
| `runs`  | No        | c    | Store-resolution errors thrown as `VibechkError`→bare stderr, no `failure`/errorType                                                   | land-now-fix      | `cli.ts:141-147`; `store.ts:31-37`                 |
| `runs`  | No        | d    | Empty store → `ok([])` ("No vibechk runs found") — correct                                                                             | conformant        | `cli.ts:160-166`; `store.ts:94-96`                 |
| `show`  | No        | a    | Tier 0 read-only                                                                                                                       | conformant        | `cli.ts:109-118`                                   |
| `show`  | No        | b    | Renders full transcript + full diff patch, no bound in schema                                                                          | land-now-fix      | `cli.ts:181-187`; `store.ts:146-156`               |
| `show`  | No        | c    | Not-found/invalid-bundle thrown `VibechkError`→bare stderr, no errorType/data                                                          | land-now-fix      | `cli.ts:141-147`; `store.ts:71-77,127`             |
| `show`  | No        | d    | Run-not-found is real non-success but thrown, not `negative(...)`                                                                      | land-now-fix      | `store.ts:71-77`                                   |
| `diff`  | No        | a    | Tier 0 read-only                                                                                                                       | conformant        | `cli.ts:120-130`                                   |
| `diff`  | No        | b    | Renders two full reports, no bound in schema                                                                                           | land-now-fix      | `cli.ts:196-201`                                   |
| `diff`  | No        | c    | Not-found errors thrown `VibechkError`→bare stderr, no errorType                                                                       | land-now-fix      | `cli.ts:141-147`; `store.ts:71-77`                 |
| `diff`  | No        | d    | Either-side run-not-found thrown, not `negative(...)`                                                                                  | land-now-fix      | `cli.ts:198-200`; `store.ts:71-77`                 |
| `run`   | Yes       | a    | Tier 1 (additive: new branch/commit + new bundle, original branch restored); no `--yes`/`--force` required; clean-workdir precondition | conformant (tier) | `workflow.ts:52-56,127-131`; `repository.ts:80-90` |
| `run`   | Yes       | c    | `rawCommand` returning raw exit code; all errors thrown `VibechkError`→bare stderr, never `failure(errorType)`                         | land-now-fix      | `cli.ts:132-147`; `workflow.ts:52-56,176-178`      |

**vibechk notes:** Well-structured happy path but no failure-envelope discipline at all:
every error is a thrown `VibechkError` flattened by `handleRunError` into bare stderr +
exit 1, so ADR 0010 `errorType` is absent everywhere and ADR 0013 `negative(...)`
not-found cases in `show`/`diff` are mis-surfaced as errors. Danger-tier posture is fine
(three Tier 0 reads + one additive Tier 1 `run`). Remaining gaps: (b) unbounded
transcript/diff/list output without completion state, and `run` being a `rawCommand`
which structurally blocks enveloped errors until converted. Open question: `run`'s tier
(Tier 1 vs Tier 2 — it switches the working branch and runs an arbitrary agent runner; a
mid-run crash can leave the workdir on `vibechk/<runId>`).

## Recommended remediation sequencing (safety-first)

Per the seeding handoff, sequence remediation safety-first: **(a) danger tiers → (d)
negative/exit semantics → (c) errorType → (b) output bounding.** Use the conformant
references (`handoff delete`/`gc`, `slot gc`, `brmem put`) as templates.

1. **Area (a), land-now (safety):** add `--yes`/`-y` + `requireInteractiveOrUsageError`
   gating to `branch-context exec delete`, `brmem delete`, and `sdl shell install`
   (Tier 2 per ADR 0015 #6); re-gate `areg init`,
   `areg skill apply`, `packagechk claim-pypi/claim-npm`, and `slot free --all` onto
   `isInteractive()`/`requireInteractiveOrUsageError`; rename packagechk's
   `--skip-confirmation` to `--yes`/`-y`. Land each with scenario tests (interactive
   confirm, `--yes` bypass, non-interactive `usageError`).
2. **Area (d), land-now:** apply a not-found→`negative` / bad-or-missing-arg→`usageError`
   / operational-error→`failure` decision table to `areg`, `aretro collect-evidence`,
   `brmem get/delete/copy`, `plans exec resolve`, `objective runner-subagent-usage`,
   `ccc cmux-workspace-summary`, `vibechk show/diff`, `sdlcc cmux report`.
3. **Area (c), land-now:** fix kebab-case `errorType` (`objective` storage codes, `areg
   skillx`, `brmem resolve-prompt`); replace the generic error-collapse wrappers in
   `branch-context`/`plans` with modeled errorTypes; add structured `data` where it aids
   recovery (lower priority, ADR 0010 "consider").
4. **Area (b), land-now where it matters / else parked:** `aretro`, `vibechk`, `roaster
   review log`. Leave domain-small lists parked under the ADR 0012 threshold.

## ADR-needed questions — resolved by ADR 0015

The six contested design calls this audit surfaced are now resolved by
`docs/adr/0015-cli-surface-conformance-decisions.md`. Each row's classification
above has been updated accordingly.

1. **Agent-only `exec` destructive writes (pr-address `reply`/`resolve-review-thread`):**
   resolved by ADR 0015 #2 — the required operation arguments are sufficient intent on
   the agent-only hidden `exec` surface; no added confirm flag. Rows → conformant.
2. **`ccc land` single-PR fast path:** resolved by ADR 0015 #3 — auto-merge is
   intentional (Pi surface, not Clinkr). Row → conformant.
3. **`rawCommand`/`isRawExit` envelope exemption:** resolved by ADR 0015 #1 — narrow
   exemption only for TUI/streaming/passthrough; today's finite-result raw commands
   migrate onto the envelope. Rows → land-now-fix.
4. **Query-miss vs action-miss semantics (pr-address):** resolved by ADR 0015 #4 —
   predicate/lookup misses use `ok(found:false)`; requested-target/action misses use
   `negative`. Rows → conformant.
5. **`brmem export`/`branch-context check` empty/absent as `ok`:** resolved by ADR 0015
   #5 — ratified as the standard. Rows → conformant.
6. **Dotfile/external-write danger tier (`sdl shell install`, `sdlcc cmux report`):**
   resolved by ADR 0015 #6 — user-dotfile writes are Tier 2 (`sdl shell install` →
   land-now-fix); env-keyed external metadata writes stay Tier 1 (`sdlcc cmux report`
   → conformant on tier; envelope migration tracked under #1).
