# ns core cutover — runbook

End-to-end, re-runnable procedure for the ji→ns core cutover landing window
(PR-4 of the rename-ji-to-ns stack). A fresh session with no prior context should
be able to execute everything here mechanically. This pipeline instance was
re-parameterized 2026-07-03 from `.ji/objectives/ji-core-cutover/cutover/` (the
sdl→ji pipeline — read its runbook's Decisions log for inherited rulings); the
execution engine is the generic `.claude/workflows/refactor-swarm-workflow.js`
(reused unmodified — read its header).

> **Consumer artifact — no promotion intended.** One-shot instance for the
> rename-ji-to-ns landing window, consumed once and archived with this Objective
> (`docs/conventions/platform-and-consumer.md`). If a third rename ever happens,
> promote the *pattern* (deterministic generator → anchored classification →
> assembled engine args → adversarial invariants), not these files.

## Ground rules carried from the plan

- **Anchored ji forms only.** No bare `ji`→`ns` substitution anywhere. `ns` is
  never searched for (collision register: `BRMEM_NS_SEGMENT`, `<ns>`
  placeholders, `migrate-areg-and-ns-skills`); ns-correctness is proven by the
  gate + smoke tests, ji-absence by the residual greps.
- **Phase split.** PR-4 (this pipeline) renames the bin, `.ji/` paths, `/ji:*`
  namespaces, `JI_*` env names, XDG segments, refs, sentinels, machine keys,
  active docs/skills, and the 4 `skills/ji-flow-*` dirs. PR-5 (pkg-scope-sweep)
  owns `@ji/*`, `src/ji/`, `ji-*.ts` filenames, the `"ji"` manifest key, `jicc`,
  `ji.toml`. Four baselines in `cutover-plan.json` pin PR-5's input; the
  `phase-two-surface` skips in the plan must each reappear as a PR-5 target
  (audit them when authoring/landing PR-5).
- **History is verbatim.** `git mv .ji .ns` moves record paths, never content.

## Artifact inventory (this directory)

| file                            | role                                                                                                                                            | regenerate with                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `generate-candidates.sh`        | deterministic candidate-list generator (G1–G13 anchored-ji greps + G7 allowlist + 4 phase-two baselines); `--post-mv` for post-move reruns      | is the generator                        |
| `lists/`                        | frozen generator + prepass output (per-surface lists, candidates.txt, baselines, auto-buckets, needs-classification, evidence)                  | `generate-candidates.sh` + `prepass.sh` |
| `prepass.sh`                    | subtracts anchored files, auto-buckets by path rule, emits classification residue + per-file grep evidence                                      | is the prepass                          |
| `anchors.json`                  | FIXED changeset membership (cs1–cs11), inventory-named simple hints, mv-only/bracket inventory, path rules — all file:lines verified 2026-07-03 | hand-maintained; edit deliberately      |
| `classify-workflow.js`          | Workflow-tool script fanning out read-only classifier agents over the residue (retargeted — the prior one was NOT parameterized)                | is the workflow                         |
| `classification-decisions.json` | frozen classifier output — NOT YET GENERATED; produced by step A3                                                                               | run `classify-workflow.js`              |
| `brief.md`                      | the shared engine brief (anchored-forms rule + collision register + DO-NOT-TOUCH)                                                               | hand-maintained                         |
| `invariants.json`               | 25 adversarial verify invariants (named traps incl. cd-directive-split-brain, shell-sentinel, refs, skill-dir integrity; residual-ji greps)     | hand-maintained                         |
| `assemble-plan.py`              | synthesizes + hard-validates `cutover-plan.json` (totality, disjointness, anchor coverage, skip audit incl. phase-two-surface)                  | is the assembler                        |
| `cutover-plan.json`             | the locked engine args content — NOT YET GENERATED; produced by step A4; ALL PATHS POST-MV                                                      | `assemble-plan.py`                      |
| `dry-run/`, `landing/`          | artifacts captured during rehearsal / the real window                                                                                           | produced by executing this runbook      |

## A. Full pipeline run (fresh session, pre-window or drift re-check)

Run from the repo root. Steps 1–2 are cheap and deterministic; rerun them any
time. Steps 3–4 only need re-running for files that drifted.
**Orchestrator does all of §A** (steps 1, 2, 4 are direct shell/python; step 3 is
a Workflow-tool invocation). Engine agents are not involved until §B2.

1. **Regenerate candidates**:
   `bash .ji/objectives/rename-ji-to-ns/tools/cutover/generate-candidates.sh .ji/objectives/rename-ji-to-ns/tools/cutover/lists`
   (post-mv variant, only after the §B1 moves have run:
   `bash .ns/objectives/rename-ji-to-ns/tools/cutover/generate-candidates.sh /tmp/ns-cutover-lists-postmv --post-mv`)
   On a drift re-check, diff each `g*-*.txt` against the frozen `lists/` copies —
   the per-surface split tells you WHICH rename surface grew. Also diff the four
   `baseline-*.txt` phase-two counts (at authoring: @ji files 962, src/ji occ
   143, ji.toml files 1, manifest-key files 29).
2. **Run prepass**:
   `bash .ji/objectives/rename-ji-to-ns/tools/cutover/prepass.sh .ji/objectives/rename-ji-to-ns/tools/cutover`
   (the argument is the cutover dir itself — prepass reads `$1/anchors.json` and
   `$1/lists/`). `lists/anchored-not-candidate.txt` must stay EMPTY — a non-empty
   file means an anchor went stale, a generator pattern regressed, or a
   pattern-blind anchored file is missing from the G7 allowlist. Fix first.
   Authoring-time counts: 52 changeset files, 54 simple anchors, auto-buckets
   49 skills / 44 docs / 15 dottree / 166 tests, **114 needs-classification**.
3. **Classify the residue** (orchestrator runs this via the Workflow tool — never
   inline): invoke `classify-workflow.js` with args
   `{ repoRoot: "<repo root>", evidencePath: ".ji/objectives/rename-ji-to-ns/tools/cutover/lists/evidence.txt", batches: [[…paths…], …] }`
   — batch `lists/needs-classification.txt` ~15 files per batch (114 files ⇒ 8
   batches). Write the returned `decisions` array to
   `classification-decisions.json` as `{"decisions": [...]}`. On a drift
   re-check, classify only the NEW files and merge. Triage every
   `suspectedNewCoupling` line: promote real silent-failure couplings to a new
   changeset in `anchors.json` (precedent: sdl→ji cs8/cs9), leave loud
   test-gated pairs as simple entries.
4. **Assemble + validate**:
   `cd .ji/objectives/rename-ji-to-ns/tools/cutover && uv run --no-project python assemble-plan.py`
   (stdlib-only; `--no-project` keeps uv from binding a parent project env; repo
   rule: always `uv run python`, never bare python3).
   Must print `OK cutover-plan.json: …` and exit 0. Review the printed
   `phase-two-surface` skip count — each such skip must be reconcilable against a
   PR-5 target (rename-map/manifest-rewrite/hand-edit list); record the audit in
   the objective before the window.
5. **Post-mv path check** (paranoia, cheap): every work-list path in
   `cutover-plan.json` must map back to an existing pre-mv file — map
   `.ns/`→`.ji/`, `.pi/extensions/ns.ts`→`ji.ts`, `skills/ns-flow-*`→
   `skills/ji-flow-*`, then `test -f`. There is NO toml mapping.

## B. Landing window (identical for dry-run and real landing)

**Preconditions:** clean tree; baseline `corepack pnpm --dir ts install` + `just`
green; PRs 1–3 of the stack (records + this pipeline) exist beneath the landing
branch. Dry-run PR-4 once in a throwaway worktree first (sdl→ji precedent):

```sh
git worktree add /tmp/ns-cutover-dryrun -b ns-cutover-dryrun
cd /tmp/ns-cutover-dryrun && corepack pnpm --dir ts install && just   # baseline green
```

Nothing merges from a dry-run except findings folded back into these artifacts.

### B1. Caller brackets — file moves (ORCHESTRATOR-owned; engine agents NEVER rename files)

**First, read `cutover-plan.json` into memory** — the mvs below relocate this
whole directory to `.ns/objectives/rename-ji-to-ns/tools/cutover/`; every later
reference (§B2 args, §B5 baselines) uses that post-mv path.

```sh
git mv .ji .ns
git mv .pi/extensions/ji.ts .pi/extensions/ns.ts
# NO ji.toml mv — phase two.
for s in autobranch branch-latest-commit cp submit; do
  git mv "skills/ji-flow-$s" "skills/ns-flow-$s"
  # recreate BOTH tracked symlink layers (.claude chains through .agents):
  git rm ".agents/skills/ji-flow-$s"
  ln -s "../../skills/ns-flow-$s" ".agents/skills/ns-flow-$s"
  git add ".agents/skills/ns-flow-$s"
  git rm ".claude/skills/ji-flow-$s"
  ln -s "../../.agents/skills/ns-flow-$s" ".claude/skills/ns-flow-$s"
  git add ".claude/skills/ns-flow-$s"
done
find .agents/skills .claude/skills -type l ! -exec test -e {} \; -print  # must be empty
```

(`.pi/extensions/ns.ts` content is all phase-two survivors — mv only, no content
edit. The `.gitignore` `.ji/tmp`→`.ns/tmp` line is a CONTENT edit owned by the
engine's `.gitignore` simple anchor, not this bracket.)

### B2. Engine runs — three sequential chunks (ORCHESTRATOR invokes; ENGINE AGENTS edit)

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

Engine quirks to respect (inherited, all confirmed in the sdl→ji window):

- **A run with zero simple+complex entries no-ops and SKIPS invariants** — never
  attempt a verify-only invocation; invariants ride the last non-empty chunk.
- The engine only WARNS on file-ownership collisions; `assemble-plan.py` is the
  hard gate — do not hand-edit the chunks without re-running it.
- `args` may arrive as a JSON string; the engine normalizes.
- Per-changeset `model: "opus"` overrides (cs1/cs2/cs4/cs5/cs6/cs9) fall back to
  the complexModel tier if the harness rejects the model — acceptable; their
  instructions are written to be executable at sonnet (sdl→ji evidence: haiku/
  sonnet sufficed across ~190 agents, zero capability-attributable misses).

Save every engine report verbatim to `landing/<n>-chunk-<name>-report.json` (or
`dry-run/` for the rehearsal). The reports' `skipped[]` judgment calls MUST each
be hand-triaged by the orchestrator: fix-list, survivor-confirm, or plan
amendment. The cs8 nav.ts `owner: "dagster-io"` drift is already
ruled (2026-07-03, recorded in anchors cs8 notes): both fields change —
owner → "nseng-ai", repo → "ns".

### B3. Fix rounds (ORCHESTRATOR; budget ≤2)

Between and after chunks, the orchestrator runs the residual greps directly
(they are the `residual-*` invariant prompts in `invariants.json` —
copy-paste runnable, all leftover-ji-only). Build a fix-list args payload from
violations (same shape: simple entries with hints), re-invoke the engine, save
the report. If two fix rounds don't converge, stop and re-partition rather than
iterating blindly.

### B4. Caller brackets — regenerate + gate (ORCHESTRATOR)

```sh
rm -rf ts/node_modules && corepack pnpm --dir ts install
# MANDATORY rm -rf: on an existing checkout pnpm install (even --force) no-ops
# and never relinks bins — .bin/ji would survive and .bin/ns never appear
# (sdl→ji dry-run-1 finding). NEVER hand-edit ts/pnpm-lock.yaml.
just dprint-fix      # markdown table widths shift when renames change lengths
just ts-format-fix   # edit agents leave minor TS formatting drift
env -u FORCE_COLOR just   # full gate: dprint, tsgo, oxlint, ~4000 Vitest
# (env -u FORCE_COLOR: clinkr caps/io tests stub TERM/COLORTERM but not
# FORCE_COLOR; harness shells exporting it fail those tests spuriously.)
```

**skills-lock regeneration.** How skills-lock.json is actually maintained
(verified 2026-07-03): the lockfile is written by the external `npx skills` CLI;
for LOCAL skills `computedHash` is captured at install time and `areg check`
validates only its FORMAT (64-hex), never content — and the in-repo precedent
for a skill-dir rename (commit 6d51a05b1, code-*→sdl-flow-*) carried the old
hashes verbatim. So: cs10's hand-edit of the four entry keys + `source` paths
with hashes kept verbatim already passes the gate. To additionally recapture
hashes after the 49-file skill content sweep (the plan's "regenerate in-window"
step), run per moved/edited skill:

```sh
INSTALL_INTERNAL_SKILLS=1 npx skills add ./skills/<name> --agent codex claude-code -y
# then, per skill-management known quirks 3 and 6:
#  - normalize "source" back to "skills/<name>" if an absolute path was captured
#  - restore .agents/skills/<name> to the ../../skills/<name> symlink if the CLI
#    replaced it with a copy (and re-verify the .claude chain link)
#  - review the skills-lock.json diff: only intended entries may change
git diff skills-lock.json .agents/skills .claude/skills
```

Then re-run `env -u FORCE_COLOR just` if anything changed.

### B5. Smoke tests (ORCHESTRATOR; completion evidence — from the plan's Verification section)

```sh
# `ns` is NOT on PATH in a throwaway worktree — use the workspace shim explicitly
export PATH="$PWD/ts/node_modules/.bin:$PATH"
ns --help                                    # bin exists under the new name
test ! -e ts/node_modules/.bin/ji            # old shim gone (after the rm -rf install)
ns objective list --minimal --format md      # storage roots + extension discovery work
ns objective exec load-orientations --format md   # AGENTS.md chain end-to-end
ns shell 2>/dev/null | grep -F '# >>> ns shell integration >>>'   # sentinel renders
ns shell 2>/dev/null | grep -F 'NS_CD_DIRECTIVE_FILE'             # wrapper derives NS_
# cd-directive round-trip (the named trap, end to end):
d=$(mktemp) && NS_CD_DIRECTIVE_FILE="$d" ns slot list >/dev/null 2>&1; rm -f "$d"
# brmem prompt resolution: .ns/prompts + XDG ns/… + refs/brmem/ns/ UNTOUCHED:
git grep -n 'BRMEM_NS_SEGMENT = "ns"' -- ts/packages/infra/brmem/src/ref-layout.ts  # must still hit
```

Then re-read the invariant results from the final chunk's report: all 25 must
pass. `scope-untouched-baselines` compares against `cutover-plan.json`
`.baselines` (values frozen by the latest §A generator run — refresh via §A if
the tree moved since).

### B6. Dry-run teardown / real-landing wrap-up

Dry-run: copy reports + findings into `dry-run/`, fold plan amendments back into
`anchors.json`/`brief.md`/`invariants.json`/`classification-decisions.json`,
re-run `assemble-plan.py`, then:

```sh
git worktree remove --force /tmp/ns-cutover-dryrun && git branch -D ns-cutover-dryrun
```

Real landing: commit on the dedicated branch (Graphite — load the graphite
skill; never commit on master), then immediately proceed to PR-5
(`tools/pkg-scope-sweep/`, same day, its own runbook) and reconcile every
`phase-two-surface` skip against its PR-5 edit. Record a Semantic Update on
this Objective. Machine migration (`tools/machine-migration/migrate.sh`) runs
per-machine after merge: shim, zshrc sentinel-block replacement, XDG dirs with
slots via `git worktree move` only, `JI_*` profile exports, `refs/ji/*` →
`refs/ns/*`.

## C. Decisions log (calls made while authoring this instance, 2026-07-03)

- **Anchors re-verified, not trusted**: every file:line in `anchors.json` was
  checked against the live tree. Corrections vs the plan text: shell.ts
  commandName is at :92 as planned but the sentinel markers are :17-18;
  `capability-kit/src/kit/shell-support.ts:44` is PARAMETERIZED (derives the env
  var from commandName) and carries no ji literal — it is documented in cs2's
  notes but deliberately NOT a changeset member (it needs no edit; putting it in
  anchors would break prepass's anchored⊆candidates check); the cd-directive
  identifier rename pulls in two pattern-blind importers
  (slot/src/core/index.ts, slot/test/unit/api.test.ts — G7-allowlisted);
  graphite-command-channel.ts's literals moved to :24/:221/:232/:234 (plan said
  :210-223); `docs/xdg-base-directory-spec.md` moved to
  `docs/research/xdg-base-directory-spec.md`; the `.claude/skills/ji-flow-*`
  symlink layer exists in addition to `.agents/skills/*` (bracket + invariant
  cover both).
- **`resolveSdlXdgPath` identifier: DEFERRED to PR-6.** Fan-out is 8 files /
  19 sites — not "small"; renaming it here would drag pattern-blind files into
  the window. Recorded in cs4's notes.
- **ADR 0005 NOT allowlisted this time** (it was in the sdl→ji window): its one
  `~/.ji/planned-branch` mention now narrates a historical FROM-path; docs/adr
  stays wholly excluded per the plan's history stance. Owner may overrule by
  adding a G7 allowlist entry + simple anchor and re-running §A.
- **kernel/package.json is split**: bin key `"ji": "./src/cli/index.ts"` renames
  (PR-4, simple anchor); manifest key `"ji": {` survives (PR-5, baseline).
  The manifest-key baseline pattern `"ji": \{` is brace-anchored precisely so the
  bin-key rename cannot move the baseline.
- **`ji_toml_invalid` is phase-two** (rides the ji.toml family), unlike
  `ji_extension_contribution_import_failed` and `ji_reviewer_marker` which
  rename now. Carved out in G11's comment, the brief, and residual-snake-codes.
- **classify-workflow.js was NOT reusable unchanged** (the task's "if truly
  parameterized" check failed): its prompt hard-codes the rename surfaces,
  survivor classes, and reason enum. Retargeted; reason enum now matches
  assemble-plan.py's SKIP_REASONS including `phase-two-surface`.
- **skills-lock hashes**: keys/sources hand-renamed with hashes verbatim is
  gate-valid (see B4 evidence); `npx skills add` recapture is the optional
  strict step. `areg check` does not content-verify local hashes.
- **nav.ts `owner: "dagster-io"`** is drifted (origin is nseng-ai/ns) but the
  plan scopes cs8 to the `repo` field; the edit agent is instructed to surface
  it in `skipped[]` for an owner ruling rather than widen scope.
