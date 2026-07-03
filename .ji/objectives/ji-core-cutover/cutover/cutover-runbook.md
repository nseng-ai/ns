# ji core cutover — runbook

End-to-end, re-runnable procedure for the sdl→ji core cutover landing window. A fresh
session with no prior context should be able to execute everything here mechanically.
The pipeline artifacts in this directory ARE the deliverable of the "author the
cutover workflow script" roadmap row; the execution engine is the generic
`.claude/workflows/refactor-swarm-workflow.js` (reused unmodified — read its header).

> **Consumer artifact — no promotion intended.** This directory is a one-shot
> consumer instance for the ji-core-cutover landing window, consumed once and then
> archived with this Objective (`docs/platform-and-consumer.md`). If a future
> rename-shaped landing wants the pattern (deterministic generator → anchored
> classification → assembled engine args → adversarial invariants), promote the
> *pattern* into the refactor-swarm-workflow header docs or a planning skill, not
> these files; that path is tracked as this Objective's Parked row.

## Artifact inventory (this directory)

| file                            | role                                                                                                                                     | regenerate with                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `generate-candidates.sh`        | deterministic candidate-list generator (G1–G11 surface greps + allowlist + survivor baselines); `--post-mv` variant for post-move reruns | is the generator                        |
| `lists/`                        | frozen generator + prepass output (per-surface lists, candidates.txt, baselines, auto-buckets, needs-classification)                     | `generate-candidates.sh` + `prepass.sh` |
| `prepass.sh`                    | subtracts anchored files, auto-buckets by path rule, emits classification residue + per-file grep evidence                               | is the prepass                          |
| `anchors.json`                  | FIXED changeset membership (cs1–cs8), inventory-named simple hints, mv-only files, path rules                                            | hand-maintained; edit deliberately      |
| `classify-workflow.js`          | Workflow-tool script that fans out read-only classifier agents over the residue                                                          | is the workflow                         |
| `classification-decisions.json` | frozen classifier output (90 decisions: 62 simple, 28 skip)                                                                              | re-run `classify-workflow.js`           |
| `brief.md`                      | the shared engine brief (rename list + DO-NOT-TOUCH survivors)                                                                           | hand-maintained                         |
| `invariants.json`               | 22 adversarial verify invariants (8 named traps, cross-cutting checks, residual greps)                                                   | hand-maintained                         |
| `assemble-plan.py`              | synthesizes + hard-validates `cutover-plan.json` (totality, disjointness, anchor coverage, skip audit, changeset precedence)             | is the assembler                        |
| `cutover-plan.json`             | the locked engine args content: brief, 3 chunks (simple[]+complex[]), invariants, baselines, skips, mv-only — ALL PATHS POST-MV          | `assemble-plan.py`                      |
| `dry-run/`                      | artifacts captured during rehearsals (engine reports, invariant results, fix lists, findings)                                            | produced by executing this runbook      |

## A. Full pipeline rerun (fresh session, pre-window or drift re-check)

Run from the repo root. Steps 1–2 are cheap and deterministic; rerun them any time.
Steps 3–4 only need re-running for files that drifted.

1. **Regenerate candidates**:
   `bash .sdl/objectives/ji-core-cutover/cutover/generate-candidates.sh /tmp/cutover-lists`
   (post-mv variant, only after the §B1 moves have run:
   `bash .ji/objectives/ji-core-cutover/cutover/generate-candidates.sh /tmp/cutover-lists-postmv --post-mv`)
   Diff each `/tmp/cutover-lists/g*-*.txt` against the frozen `lists/` copies — the
   per-surface split tells you WHICH rename surface grew. Also diff the two
   `baseline-*.txt` survivor counts.
2. **Re-run prepass**: copy the fresh lists over `lists/`, then from the repo root:
   `bash .sdl/objectives/ji-core-cutover/cutover/prepass.sh .sdl/objectives/ji-core-cutover/cutover`
   (the argument is the cutover dir itself — prepass reads `$1/anchors.json` and
   `$1/lists/`). `lists/anchored-not-candidate.txt` must stay empty (a non-empty
   file means an anchor went stale or a generator pattern regressed — fix first).
3. **Re-classify only the drift**: for files newly appearing in
   `lists/needs-classification.txt`, run `classify-workflow.js` via the Workflow tool
   with a batches arg containing just those files (args shape: see the script header;
   pass `repoRoot` = the repo root, `evidencePath` =
   `.sdl/objectives/ji-core-cutover/cutover/lists/evidence.txt` (repo-root-relative
   or absolute — agents work from repoRoot), `batches` = [[paths…]]).
   Merge the new decisions into `classification-decisions.json`.
4. **Re-assemble + validate**:
   `cd .sdl/objectives/ji-core-cutover/cutover && uv run --no-project python assemble-plan.py`
   (stdlib-only; `--no-project` keeps uv from binding a parent project env).
   Must print `OK cutover-plan.json: …` and exit 0. Review any
   `REVIEW suspectedNewCoupling` lines — promote real silent-failure couplings to a
   new changeset in `anchors.json` (precedent: cs8), leave loud test-gated pairs as
   simple entries.
5. **Post-mv path check** (paranoia, cheap): every work-list path must map back to an
   existing pre-mv file — see the snippet in `dry-run/README` or re-derive: map
   `.ji/`→`.sdl/`, `ji.toml`→`sdl.toml`, `.pi/extensions/ji.ts`→`sdl.ts`, `test -f`.

## B. Landing window (identical for dry-run and real landing)

**Preconditions:** clean tree; baseline `pnpm install` + `just` green. (Owner rulings
2026-07-02 for the real landing: trunk-landing of the decision-records stack is NOT
required — the landing branch stacks on top of the decision-records stack and the
whole stack lands together; and the same-day §A re-run was waived — the 2026-07-02
post-drift §A pass stands as the plan snapshot.)

**For a dry-run:** do everything below in a throwaway worktree + branch, then delete
both. Nothing merges from a dry-run except findings folded back into these artifacts.

```sh
git worktree add /tmp/ji-cutover-dryrun -b ji-cutover-dryrun
cd /tmp/ji-cutover-dryrun && (cd ts && pnpm install) && just   # baseline green
```

### B1. Caller brackets — file moves (orchestrator-owned; engine agents NEVER rename files)

**First, read `cutover-plan.json` into memory** — the mvs below relocate it to
`.ji/objectives/ji-core-cutover/cutover/cutover-plan.json`; every later reference to
the plan (§B2 args, §B5 baselines) uses that post-mv path.

```sh
git mv .sdl .ji
git mv sdl.toml ji.toml
git mv .pi/extensions/sdl.ts .pi/extensions/ji.ts
```

(`.pi/extensions/ji.ts` content is all survivors — mv only, no content edit.)

### B2. Engine runs — three sequential chunks

For each chunk in `cutover-plan.json` `.chunks[]` (order: 1-production, 2-tests,
3-skills-docs), invoke the Workflow tool:

```
Workflow({ name: "refactor-swarm-workflow", args: {
  brief:   <plan.brief>,
  simple:  <chunk.simple>,
  complex: <chunk.complex>,
  invariants: <plan.invariants IF final chunk ELSE []>,
  repoRoot: "<the worktree being edited>",
  model: "sonnet", complexModel: "sonnet"
}})
```

Engine quirks to respect:

- **A run with zero simple+complex entries no-ops and SKIPS invariants** — never
  attempt a verify-only invocation; invariants ride the last non-empty chunk.
- The engine only WARNS on file-ownership collisions; `assemble-plan.py` is the hard
  gate — do not hand-edit the chunks without re-running it.
- `args` may arrive as a JSON string; the engine normalizes. (Any custom workflow
  script must do the same: `if (typeof args === "string") args = JSON.parse(args)`.)
- Per-changeset `model: "opus"` overrides (cs1/cs2/cs4/cs5/cs6) fall back to the
  complexModel tier if the harness rejects the model — acceptable; their
  instructions are written to be executable at sonnet.

Save every engine report verbatim to `dry-run/<n>-chunk-<name>-report.json` (or
`landing/` for the real window). The reports' `skipped[]` judgment calls MUST each be
hand-triaged: fix-list, survivor-confirm, or plan amendment.

### B3. Fix rounds (budget ≤2)

Between and after chunks, the orchestrator runs the residual greps directly (they are
the `residual-*` invariant prompts in `invariants.json` — copy-paste runnable). Build
a fix-list args payload from violations (same shape: simple entries with hints),
re-invoke the engine, save the report. If two fix rounds don't converge, stop and
re-partition rather than iterating blindly.

### B4. Caller brackets — regenerate + gate

```sh
cd ts && pnpm install        # regenerates pnpm-lock.yaml importer paths + .bin/ji shims
                             # NEVER hand-edit the lockfile
just                         # full validation gate (dprint, tsgo, oxlint, vitest)
```

Dry-run-1 gate mechanics (expect these; none are rename defects):

- **Reused checkout:** on a worktree with an existing `ts/node_modules`, `pnpm
  install` (even `--force`) no-ops and never relinks bins — `.bin/sdl` survives and
  `.bin/ji` never appears. Run `rm -rf ts/node_modules && pnpm install` (seconds,
  store-backed). Fresh /tmp worktrees don't hit this; the REAL landing on an
  existing checkout will.
- **Two formatter fix-ups before green:** `just dprint-fix` (markdown table column
  widths shift when renames change string lengths) and `just ts-format-fix`
  (edit agents leave minor TS formatting drift). Use the autofixers, never
  hand-edit formatter output.
- **Ambient FORCE_COLOR:** clinkr caps/io tests stub TERM/COLORTERM but not
  FORCE_COLOR; harness shells that export FORCE_COLOR=3 fail them spuriously. Run
  the gate as `env -u FORCE_COLOR just` if the shell sets it.

### B5. Smoke tests (completion evidence)

```sh
# `ji` is NOT on PATH in a throwaway worktree — use the workspace shim explicitly
export PATH="$PWD/ts/node_modules/.bin:$PATH"
ji --help                                   # bin exists under the new name
test ! -e ts/node_modules/.bin/sdl          # old shim gone (after pnpm install)
ji objective list --minimal --format md     # storage roots + extension discovery work
ji objective exec load-orientations --format md   # AGENTS.md chain end-to-end
```

Then re-read the invariant results from the final chunk's report: all 22 must pass.
`scope-untouched-baseline` compares against `cutover-plan.json` `.baselines` (the
values frozen by the latest step-A generator run — refresh via step A if the tree
moved; the baseline patterns exclude the objectives trees and XDG-context lines
since dry-run 1).

### B6. Dry-run teardown / real-landing wrap-up

Dry-run: copy reports + findings into `dry-run/`, fold plan amendments back into
`anchors.json`/`brief.md`/`invariants.json`/`classification-decisions.json`, re-run
`assemble-plan.py`, then:

```sh
git worktree remove --force /tmp/ji-cutover-dryrun && git branch -D ji-cutover-dryrun
```

Real landing: commit on the dedicated branch (Graphite), update
`cross-harness-parity` evidence (its parity-table edit is in chunk 3), record a
Semantic Update on this Objective, and hand the machine migration + repo rename back
to the parent `rename-sdl-to-ji`.

## C. Decisions log (owner-visible calls made while authoring)

- **Q1–Q4** (2026-07-02, owner): everything renames to ji — reflected throughout.
- **Placement** (this effort): pipeline artifacts live HERE (consumer instance,
  objective-colocated); no new `.claude/workflows/` script; the generic engine is
  reused unmodified. Closes the objective's last open question.
- **SDL_ env vars — inventory drift found while authoring**: the cutover inventory
  does not enumerate `SDL_*` env var names (`SDL_CHECKPOINT_MODEL`, `SDL_DEV_*`,
  `SDL_SLUG_MODEL`, `SDL_SUBMIT_FAILURE_MODEL`, `SDL_CCC_SIDEBAR_MODEL`,
  `SDL_PI_CLI_TRACE*`, `SDL_TS_BAN_*` style-guard rule names, justfile shim vars) or
  brand machine-key strings (`sdl-command-ack`, `sdl-cli-command-output`,
  `sdl-harness-session-id`, `sdl-pi-cli-command-extension.jsonl`, `@@SDL_*@@` shim
  tokens). Decision applied: ALL rename to `JI_*`/`ji-*` in-window, per the standing
  "no sdl-brand literal survives" resolution. **Owner note:** any `SDL_*` vars
  exported in shell profiles on owner machines stop working at the landing — the
  machine-migration checklist (parent row) must include renaming them.
- **Diagnostic codes** (`missing-sdl`, `extension_manifest_missing_sdl`): rename to
  ji forms, decided in cs2's instructions, not per-agent.
- **Skips**: 28 candidate files carry documented skip reasons in
  `cutover-plan.json` `.skips` (package names, docs-site branding, historical plan
  prose, `skills-lock.json` keys). Docs-site branding is the branding row's work.
- **`.claude/plans/plan-the-deletion-of-humming-tide.md`** DOES contain in-window
  forms (`.sdl/objectives/pr-address-*` paths, `sdl pr-address` prose) but is skipped
  as a **historical record** — a checked-in plan doc for completed work, per the
  Non-Goals no-scrubbing stance. Owner may overrule by adding it to
  `anchors.json` simpleAnchors and re-assembling.
- **Adversarial verification (2026-07-02)**: a 5-lens skeptic workflow + a re-run
  runbook lens produced 15 findings (3 blockers). All folded in: G10 generator
  pattern added (bin-assertion strings — `node-runtime-cli.test.ts` had escaped the
  sweep entirely); `api-boundary.test.ts` promoted into cs2; per-file hints added for
  `docs/subpackage-conventions.md` and skills dirs carrying dotted `sdl.<field>`
  prose; `residual-command-instructions` invariant rewritten from a closed
  subcommand enumeration to a broad judge-each sweep with `:!docs/adr`; runbook
  paths/PATH-setup/plan-load-ordering corrected; prepass now subtracts mv-only
  files. Findings archive: `dry-run/verify-findings.json`.
- **Trunk precondition dropped (2026-07-02, owner)**: the real landing does NOT wait
  for the decision-records stack to merge to master. The landing branch is created
  stacked on top of `update-objective-runner-drift` (the top of the decision-records
  stack) and the whole stack lands together via Graphite.
- **§A re-run waived for the real landing (2026-07-02, owner)**: no fresh drift
  check at the window; the same-day post-drift-absorption §A pass (122 simple /
  9 changesets / 30 cohorts / 22 invariants, all paths verified pre-mv) stands.
- **Dry-run 1 (2026-07-02)**: full §B rehearsal executed green in worktree slot-09
  (findings: `dry-run/1-findings.md`; gate/smoke evidence: `dry-run/1-gate.txt`).
  Owner rulings on the four surfaced calls: (a) brand PROSE ("SDL kernel", message
  prose, doc titles, describe() labels) DEFERS to the branding row — now an explicit
  DO-NOT-TOUCH; (b) the `<!-- sdl-reviewer:` PR-comment marker RENAMES —
  recognition of pre-cutover PR comments is knowingly broken; (c) brand-named
  tmpdir prefixes RENAME to ji- while package-name-derived prefixes (sdl-flow-…)
  survive; (d) historical-fact prose in LIVE docs stays verbatim. Amendments
  folded: G11 snake-code generator pattern + residual-snake-codes invariant
  (kernel loader.ts had escaped every prior pattern); loader.ts + the style-guard
  support trio joined cs2 (two-phase desync eliminated); env-var-NAME positions
  spelled out in brief + residual-env-vars; six invariant prompts got survivor
  carve-outs (identifier property access, SCREAMING identifiers, skill-dir names,
  src-dir join literals, absence-assertion tombstones, legacy-format-vs-cutover
  scope); survivor baselines re-derived with corrected patterns (objectives-tree
  and XDG exclusions); production-embedded `ts/packages/**/src/**.md` now routes
  to chunk 1. Model economics: haiku (simple) / sonnet (complex+verify) sufficed —
  zero capability-attributable misses across ~190 agents; opus overrides optional.
