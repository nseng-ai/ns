# Landing chunk 1-production — skip triage (174 entries)

Engine report: `1-chunk-1-production-report.json` (94/103 simple changed, 9/9
changesets, 0 failures, 174 skips). 150 skips auto-bucket to documented survivor
classes (`@sdl/*` import specifiers ×82, Sdl/SDL TS identifiers ×21, brand-prose
deferrals ×22, already-applied-before-resume ×7, package names ×7, src/sdl path
segments ×11); each sampled note cites the controlling brief rule — **survivor-confirm**.
24 residue entries hand-reviewed below.

## Survivor-confirms (hand-reviewed residue)

- mermaid `sdl` node names + objective slug in `skills/architecture-topology-report/scripts/example-spec.mjs` (per file note)
- `gh api graphql` line in download-feedback.ts; `gt` command text; `git symbolic-ref` text (per file notes)
- `HARNESS_SESSION_ID`, `PI_DRAFT_MODEL` values (no sdl content)
- render-cli-shim.mjs dynamic message + identifiers (no literals)
- cs5 `~/sdl-root` fixture VALUE (arbitrary test data, env NAME renamed)
- cs6 absence-assertion tombstones kept (per brief)
- cs9 graphite-command-channel.ts:233 prose "unrelated sdl invocations" (brand prose)
- graphite-maintenance.ts / submit-format.ts: stale hint line numbers; agents
  re-located all occurrences by content grep and renamed the stated counts — verified intent honored, no action
- land-test-helpers.ts TOPOLOGY_COMMAND (×2 files) — chunk-2 owned, expected two-phase desync

## Fix-list for §B3 fix round 1 (plan gaps; all brand MACHINE literals per owner

## rulings b/c and the standing "no sdl-brand literal survives" resolution)

1. **extension-manifest.test.ts** (cs2/cs3 race): inline zod key `sdl:` (line 9) and
   `manifest.sdl.commands` (line 27) → `ji` — manifest on disk already has `"ji":` key.
   Without this §B4 fails.
2. **refs/sdl/flow-land-backup(-prev)** → `refs/ji/...`:
   `flow/src/land/stack/constants.ts:13-14` + duplicate literals in
   `ccc/test/land-command.test.ts:45-46` (byte-equal twins). LAND_BACKUP_RECOVERY_HINT
   interpolates the constants — stays coherent automatically.
   *Machine-migration note: pre-cutover backup refs under refs/sdl/ become invisible
   to recovery hints; restore manually if ever needed.*
3. **pr-description brand tokens**: `flow/src/submit/pr-description.ts:27-30`
   `<!-- generated-by: sdl-dev pr-description v1 -->` → `ji-dev`,
   `<!-- sdl-pr-description:begin/end` → `ji-pr-description`,
   `"sdl-pr-description-v2"` → `"ji-pr-description-v2"`; plus every test literal
   `generator: "sdl-pr-description-v2"` (regenerate-pr-command.test.ts,
   pr-description-orchestration.test.ts, pr-description.test.ts — re-grep after
   chunk 2 in case cohort-tests-5 already renamed).
   Precedent: sdl-reviewer marker ruling (b) — recognition of pre-cutover PR bodies
   knowingly breaks; regenerate-pr rewrites the managed region on next run.
4. **`sdl.pi-agent.v1` → `ji.pi-agent.v1`** (coordinated, fails loudly):
   `hosts/pi/src/runtime/agent-definition.ts:8` + checked-in
   `.ji/pi/agents/investigator.md:2`, `.ji/pi/agents/runner.md:2` +
   `docs/pi/runner-subagent-helper.md:40` + test literals in
   investigate.test.ts / parity.test.ts / pi-agent-definition.test.ts
   (re-grep after chunks 2/3 — cohort-tests-10 and docs cohorts may handle their sites).
5. **"sdl shell integration" family → "ji shell integration"**: rc-file sentinel
   markers `# >>> sdl shell integration >>>` / `# <<< ... <<<` in
   `kernel/src/cli/shell.ts:17-18` and duplicate consts in
   `slot/src/sdl/extension.ts:107-108`, plus prompt/message prose shell.ts:46,52 and
   extension.ts:183,191,192,225,227,228 (chunk 1 already renamed shell.ts render
   messages 85-90; without this the surfaces are incoherent).
   *Machine-migration note: existing rc files keep the old sdl sentinel block;
   `ji slot shell install` will not recognize it — owners must remove the old block
   (or accept a stale sdl wrapper) when migrating machines.*

Fix round 1 executes after chunk 3 (single coordinated round; site lists re-derived
by grep first so chunk-2/3 cohort edits are not double-applied).

# Landing chunk 2-tests — skip triage (31 entries)

Engine report: `2-chunk-2-tests-report.json` (3/3 simple, 17/17 changesets,
0 failures). All 31 skips reviewed:

- **Survivor-confirms**: @sdl/* specifiers; Sdl identifiers; describe()/test()
  brand-prose labels (explicit brief exclusion — cohort-tests-13 flagged the
  resulting label-vs-content inconsistency, accepted, branding row); sdl-tools
  repo-name literals; sdl-typescript-style(-tripwire) review/skill keys;
  sdl-flow-real-gt- package-derived prefix; fixture branch names
  (sdl-extension-api-*), arbitrary quoting/filler fixtures ("sdl\\ tools",
  "asdl-tools", "asdl-cli-runtime-"), raw-model-output slug fixture
  (plan-content-slug.test.ts), "through the sdl prompt pipeline" prose.
- **Reasonable in-window renames flagged for visibility** (accepted):
  /tmp/sdl-directive → /tmp/ji-directive; sdl-core-temp-test-/sdl-core-json-test-
  → ji-core-* (brand-word prefixes, not the enumerated sdl-flow/sdl-capability-kit
  package survivors); kernel-test sdl-flow-extension-* prefixes renamed as
  non-package-derived (harmless arbitrary tmpdir strings either way).
- **Resolved mid-run races** (verified on disk, no action):
  branch-context-extension-support.ts now writes `.ji/prompts` fixtures
  (cohort-tests-1 owned it; cohort-tests-2's 2 observed test failures are gone);
  `.ji/prompts/plans-write.md` `sdl flow cp` text is chunk-3 cohort-dottree-2's work.
- **Expected two-phase desyncs already on the fix-list**: refs/sdl twins
  (cohort-tests-3 correctly deferred), sdl-pr-description-v2 test literals
  (cohorts 4/5 correctly deferred), sdl.pi-agent.v1 test literals (cohorts 10/15
  correctly deferred).
- **Fix-list ADDITIONS** (source renames in round 1 must carry these test sites):
  - item 4 += `hosts/pi/test/dispatch-runner-subagent.test.ts:226`
    (`schema: sdl.pi-agent.v1`)
  - item 5 += `kernel/test/.../shell-cli.test.ts` marker assertion
    (`# >>> sdl shell integration >>>`) — agent verified it mirrors source,
    renames with the source constants.

# Landing chunk 3-skills-docs — skip triage (61 entries) + invariant decomposition

Engine report: `3-chunk-3-skills-docs-report.json` (16/16 simple, 13/13 changesets,
0 failures, 22 invariants checked, 8 failed). All 61 skips reviewed: 57 documented
survivor classes; 4 residue confirmed correct (ASDL is a distinct term; brmem is a
separate tool; `ccc exec autobranch` has no sdl form; 'an sdl Objective'
brand-adjective prose defers). `parity-table-bundled` passed — the
cross-harness-parity table edit landed with rows 38/51 scoped per plan.

## The 8 invariant failures → fix round 1 (all covered)

| invariant                                                                           | violation                                                                                                                                       | disposition                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| real-extensions-test-helpers + residual-dot-sdl + manifest-key-ji (checks 1–4 pass) | extension-manifest.test.ts `sdl:` zod key / `manifest.sdl.commands`                                                                             | fix 1 (pre-collected: cs2/cs3 race)                                                                                                                                                           |
| manifest-key-ji check 5                                                             | extension-discovery.test.ts:84 fixture dir `missing-sdl`                                                                                        | fix round 1                                                                                                                                                                                   |
| residual-dot-sdl                                                                    | `.claude/plans/plan-the-deletion-of-humming-tide.md` `.sdl/` paths                                                                              | survivor-confirm — documented §C historical-record skip; invariant prompt lacks the `:!.claude/plans` exclusion that residual-snake-codes has (prompt amendment candidate, not a repo defect) |
| residual-namespace                                                                  | preflight.ts:324 `/sdl:flow:land` in live suggestedAction                                                                                       | fix round 1 (genuine plan escape)                                                                                                                                                             |
| residual-bin-argv                                                                   | skill-reviews.ts:43 ACRONYMS `["sdl","SDL"]`                                                                                                    | keep + add `["ji","JI"]` — the entry humanizes SURVIVING sdl-* skill/review dir names; removing it would regress display of survivor keys                                                     |
| residual-command-instructions                                                       | CONTEXT-MAP.md lines 20,22,29,30,31,64,66,69,72 command-face prose (plan hint was scoped to 4 locations) + agent-flagged `sdl.tier` lines 19,97 | fix round 1, comprehensive pass                                                                                                                                                               |
| residual-machine-keys                                                               | pr-description family (pre-collected) + `sdl-git-test-` / `sdl-test@example.com` in sdl-capability-kit git/testing.ts                           | fix round 1                                                                                                                                                                                   |
| residual-env-vars                                                                   | example-spec.mjs:90 doc string `SDL_TS_BAN_...` vs renamed `JI_TS_BAN_...` rule                                                                 | fix round 1                                                                                                                                                                                   |

Fix round 1 = 24 single-file precise fixes (run `wf_1e418aa6-bbc`), which also carries
the four pre-collected plan-gap families (refs/sdl backup-ref namespace,
sdl-pr-description tokens, sdl.pi-agent.v1 schema across all 8 reader/writer files,
sdl shell integration markers+prose across kernel/slot/test). Invariants not
re-riding the fix round; §B3 residual greps re-run by the orchestrator afterward.
