# Strangler Closed: Rebaseline Off "Open, In-Progress" Framing

## Summary

Trunk-explicit refresh (target `HEAD`, baseline `67cb27a59`). The Objective was
anchored on `pr-address-strangler-rewrite` being **open and actively updating the
same files**. Ground truth contradicts that:

- `.asdl/objectives/pr-address-strangler-rewrite/closed.md` exists with
  `closed: completed`; the latest update is
  `2026-06-18-closeout-guidance-and-closure.md`. The strangler is **closed /
  completed**, not open.
- Its download-only deletion has already landed. Verified absent on the current
  surface (`ts/packages/pr-address/src`): `read-feedback-detail`, `payload-store`,
  session/checkpoint machinery (`rg checkpoint|session-store|continue_on_error`
  → no matches), and resolve mutation helpers (`rg resolveThread|...Reply` → no
  matches).
- No "dangerous mutation parity" follow-up Objective exists. The strangler
  closeout explicitly parks any future addressing workflow as "create a new
  Objective" on demand.
- No RunEngine contract exists; the strangler's cutover was download-only, so the
  Non-Goals' "replaced by the new RunEngine contract" (#6) was never true.

The three in-scope findings were independently re-verified as **still present and
unfixed**, so active scope is unchanged:

- `-F`/`@` file-read primitive: `reviewThreadPageArgs` (gateways.ts:430) and
  `reviewThreadCommentPageArgs` (gateways.ts:448) still pass `threadCursor` /
  `threadId` / `commentCursor` via `-F`.
- Silent comment drop: `numericId` (gateways.ts:528) coerces non-integer ids to
  `0`, and comments are dropped via `.filter(c => c.id !== 0)` (gateways.ts:297,
  495).
- Re-export barrels: `gateways.ts` re-exports types from `./core/gateways.ts`
  (incl. `PRLookupMiss`); `index.ts` re-exports `runCli`/`CliDeps` from
  `./cli.ts`. `stdoutModeRequestShape` confirmed already removed.

## Objective Impact

Rebaselined the strangler-status framing without changing active scope or
Completion Criteria:

- **Thesis** / legacy-zone note: "open … freezing and will eventually delete" →
  closed/completed, code already deleted.
- **Non-Goals**: reframed from "deferred to the strangler and its planned
  mutation-parity follow-up" to "targeted code already deleted by the completed
  strangler"; corrected the non-existent RunEngine rationale for #6.
- **Assumptions**: the downloader-only surface is now stable; no further
  strangler reshaping expected.
- **Risks**: the strangler rebase/merge-friction risk is marked **retired** (it
  has landed); the re-export-barrel fan-out risk remains.
- **roadmap.md Parked**: "Deferred to strangler …" rows relabeled "Retired with
  deleted surface — strangler completed."

No Objective was closed; no `## Closure` was added.

## Follow-Ups

- The three active scope findings remain open for implementation.
- If a full addressing/mutation workflow is ever revived, it gets a fresh
  Objective per the strangler closeout — do not reopen the deleted surface.

Provenance: objective-refresh basis target=HEAD from=67cb27a59
