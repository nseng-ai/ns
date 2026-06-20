# areg package findings

Scope: `ts/packages/areg/src/**`. Well-typed and disciplined at the boundary (no
`as unknown as`, errors-as-values, a deliberately domain-scoped project gateway
with an explicit "no generic FS gateway" doc-comment at `gateways.ts:221-252` —
that boundary is RIGHT, keep it). The problems are file-size god-files and one
dramatic policy-fork simplification.

## 1. [BLOCKER] real-gateways.ts (1358) is a god-file: 6 unrelated gateways + a 600-line FS library [VERIFIED 6 classes]

Not one cohesive gateway. Contains six independent gateway classes
(`real-gateways.ts:150,171,215,242,282,300`) — host, github, npx,
skillx-workspace, prompt, project — sharing essentially nothing.
`RealAregHostGateway` (PATH lookup), `RealAregGithubGateway` (gh shell-out),
`RealAregPromptGateway` (readline) have zero coupling.

Below the classes sits a ~600-line private filesystem/path-safety library
(`:516-1358`): `inspectPath`, `inspectTextFile`, `resolveAllowedProjectTarget`,
`validateTextWriteTarget`, `nearestExistingParent`, `requirePathAtOrBelow`,
`canonicalSkillKindPath`, etc. — the actual mass, serving *only*
`RealAregProjectGateway`.

Decomposition:

- `src/gateways/host-gateway.ts` (~20 lines) — `RealAregHostGateway` +
  `isExecutable`.
- `src/gateways/github-gateway.ts` (~45) — `RealAregGithubGateway`.
- `src/gateways/npx-gateway.ts` + `buildNpxSkillsAddArgs`.
- `src/gateways/skillx-workspace-gateway.ts` — the skillx class +
  `inspectInstalledSkills`/`inspectOneSkill`/`listRelativeFiles`/
  `cleanupSkillxWorkspace`.
- `src/gateways/prompt-gateway.ts` — readline confirm.
- `src/gateways/project-gateway.ts` — `RealAregProjectGateway`.
- `src/gateways/project-fs.ts` — the path-state + write-target-validation toolkit
  (`inspectPath`, `inspectTextFile`, `resolveAllowedProjectTarget`,
  `validateTextWriteTarget` family, `requirePathAtOrBelow`, `isPathAtOrBelow`,
  `isNodeErrorCode`, `errorInfo`).

The file fails cohesion, not just a line budget.

## 2. [HIGH] the "init vs skill-kind policy" fork threaded through the whole write path

`AregProjectMutationPolicy = "init" | "skill-kind"` is branched on at every layer:

- `resolveWriteTextFileTarget` (`real-gateways.ts:523-536`) — `request.policy ===
  "init" ? resolveAllowedInitTarget : resolveAllowedSkillKindTarget` and again for
  validation.
- `writeTextFile` (`:439-459`) — branches twice more to pick error codes and
  revalidators.
- Two near-identical validator wrappers `validateInitWriteTarget` (`:1146`) and
  `validateSkillKindWriteTarget` (`:1164`) differing *only* in error-code string
  prefixes (`init-*` vs `skill-kind-*`), both delegating to the same
  `validateTextWriteTarget`.
- Two allowlist resolvers (`resolveAllowedInitTarget` `:1056`,
  `resolveAllowedSkillKindTarget` `:1073`) differing only in an allow-predicate,
  an error code, and `shouldCheckUnsupportedFirst`.

The entire distinction is two data values: an allowed-relative-path predicate and
an error-code namespace. Collapse: pass a `{ isAllowed, codePrefix }` descriptor
(or take `allowedRelativePaths`/predicate + prefix as request fields). Delete
`resolveAllowedInitTarget`, `resolveAllowedSkillKindTarget`,
`validateInitWriteTarget`, `validateSkillKindWriteTarget`, plus the
`shouldCheckUnsupportedFirst` knob in `resolveAllowedProjectTarget`
(`:1095-1115` — exists only to flip "unsupported" vs "unsafe" precedence between
the two policies; pick one order). ~80 lines and a concept that leaks into
`gateways.ts`, `project-mutations.ts`, and the fake. Do this *during* the split.

## 3. [HIGH] fake reimplements spec-resolution POLICY (not just IO), and diverges

`FakeAregProjectGateway.resolveLocalSkillSpec` (`fake-gateways.ts:247-301`)
reimplements the real symlink/dir/file ladder and re-derives skill names via a
bespoke `fakeResolveSkillName` (`fake-gateways.ts:722-732`) that is a *different
algorithm* from the real `resolveSkillKindSpec`/`classifyCanonicalSkillPath`
(`real-gateways.ts:801-878`). Real rejects nested specs and resolves symlinks via
`realpath`; the fake does a "last `skills/` segment" heuristic. So a test passing
against the fake guarantees nothing about the real path-canonicalization rules
(the security-relevant part). The error-string ladder (`fake:268-299`) is also
copy-pasted from real (`:378-407`).

Remedy: extract `classifySkillSpecResolution(skillName, dirState, mdState):
AregSkillKindResolveResult` (a pure function: given path-states, produce
ok/error) into a shared non-IO module. Real calls it after canonicalization; fake
calls it after its lookup. The fake then only fakes the *IO* (which name + which
path-states), not the *policy*.

## 4. [MED] fake-gateways.ts (795) heavy from hand-written deep-copy + dual bookkeeping

Dominated by copy helpers: `copyProjectOperation`, `copyFakeCheckSkill`,
`copyCheckSkill`, `copySkillKindSkill`, `copyPathState`, `copyTextFileState`,
`copyPairingDirectory`, `copyGithubState`, `copyInstalledSkill`, `copyErrorInfo`,
`normalizeTextFileState` (`:645-795`). `copyProjectOperation` (`:645-656`) is a
4-arm switch where every arm is identical (`{ ...operation }`) — delete it,
inline a spread. More fundamentally: the fake keeps parallel state in `this.files`
(a Map) *and* `this.localSkills`/`this.checkSkills` arrays, manually synced in
`writeTextFile`/`deleteFile` (`:359-364,379-382`) — a divergence risk and the
source of most copy code. A single path→state Map (the real gateway's actual
model) would let `inspectCheckSkill`/`inspectLocalSkill` derive views from one
source of truth.

## 5. [MED] non-atomic init mutation: writes happen after `npx skills add`, no rollback

`runInit` (`init.ts:199-247`): preflight (execute:false) → `npx skills add`
(mutates disk/network) → apply writes. If the second `applyProjectMutationPlan`
fails partway, it stops at the first failure (`project-mutations.ts:138-150`)
leaving earlier writes applied and later ones `not_attempted` — a
partially-initialized project plus already-installed bootstrap skills. Inherent
to filesystem mutation (true atomicity isn't free), and the code is honest via
`operationStatuses`, so MED not blocker. But the ordering (irreversible `npx`
install sandwiched between preflight and writes) is worth a comment or reorder so
cheap reversible local writes commit before the expensive external install. A
TOCTOU between preflight and apply means the bootstrap install already ran.

## 6. [MED] inspection orchestration fully sequential where embarrassingly parallel

`collectProjectInspectionFacts` (`project-inspection.ts:61-81`) awaits
`inspectProjectBase` → `inspectPiArtifacts` → `inspectSkillNameInventory` in
series; only the first feeds the others (`base.projectDir`), so the last two are
independent and could `Promise.all`. `collectSkillInspections` (`:159-166`) loops
`skills.push(await inspect(...))` one at a time — N sequential `lstat`/`readFile`
round-trips when fully independent. Same in `inspectInitProject`. Pure read
fan-outs; `Promise.all` is the boring correct tool (repo convention prefers
parallel for independent IO).

## 7. [MED] operationStatusesForPlans re-correlates plans↔statuses by index-matching tuples

`skill-kind-apply-plan.ts:356-396` reconstructs which status belongs to which
planned op by scanning `operationStatuses` for an unconsumed entry whose
`type`+`path`+`description` match, tracking `consumedStatusIndexes`. Fragile
positional re-association invented because `applyProjectMutationPlan` returns a
flat status list detached from the per-skill plan structure. Remedy:
`applyProjectMutationPlan` should return statuses carrying enough identity (or be
grouped per submitted plan) so callers don't reverse-engineer the mapping.

## 8-10. [LOW] casts / dead distinctions

- `lockfile.ts:55` `result.data as SkillsLockfileData` after a successful
  `safeParse` — the cast exists only because `skillsLockfileSchema` is annotated
  `z.ZodType<SkillsLockfileData>`. Drop the annotations (`:33,:40`), let Zod
  infer, the cast disappears.
- `fake-gateways.ts:436` `Object.entries(...) as Array<[AregHostToolName, string
  | null]>` and `:747` `value as AregTextFileState` — localized test-infra casts;
  `:747` can lie if a caller-supplied object has a non-valid `type` field.
- `real-gateways.ts:781-784` `listLocalSkillKindNames` catch returns `[]` for
  ENOENT *and* everything else — the `isNodeErrorCode` check is dead (both
  branches identical). Propagate non-ENOENT or delete the check. Same dead
  distinction (deliberate) in `listChildNames` (`:938-940`).

## Recommended attack order

1. Split `real-gateways.ts` per-gateway + extract `project-fs.ts` (#1).
2. Collapse the init/skill-kind policy fork to data (#2) — during the split.
3. Extract shared pure `classifySkillSpecResolution`; fake stops reimplementing
   policy (#3).
4. Parallelize independent inspection fan-outs (#6); reconsider the fake's dual
   state model (#4).
