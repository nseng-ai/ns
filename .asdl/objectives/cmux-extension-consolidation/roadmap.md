# Roadmap

## Work

- [x] Reuse canonical command helpers in the cmux suite. Replace `slot-dispatch-plan.ts`'s
      local `formatCommand`, `formatOutputSection`, `tailText`, `formatArg`, and `shellQuote`
      with imports from `command-runtime.ts` (extend it only if a plain-section variant is
      genuinely required); have `slot.ts` keep using the canonical ones. One clear decision:
      command-output formatting has a single canonical home. Evidence: `just ts-check`/`just
  ts-test` green; no `test/cmux.test.ts` assertion changes.

- [x] Collapse the duplicated cmux primitives into one shared home. Remove the per-file
      copies of `isRecord`, `formatErrorMessage`, `stringField` (reconciling the two divergent
      signatures), and the re-declared `TextResult` type from `dispatch.ts`,
      `slot-dispatch-plan.ts`, `slot-open-branch.ts`, and `slot.ts`; remove `pi-launch.ts`'s
      private `shellQuote`/`formatShellArg` in favor of the canonical quoter. Decision: the
      shared cmux-local home is `cmux/primitives.ts`; shell quoting lives in
      `command-runtime.ts`. Evidence: ts-check/ts-test green; each targeted primitive is
      defined once in the cmux suite.

- [x] Delegate slot-checkout envelope parsing to `machine-envelope.ts`. Rewrite
      `slot.ts:parseSlotCheckoutEnvelope` to call `parseMachineEnvelopeData` for the
      `{exit_code, data}` validation, keeping only the slot-specific field coercion
      (`slot_name`/`branch_name`/`worktree_path`/`already_assigned`). Evidence: ts-test green;
      slot envelope success/failure tests still pass.

- [x] De-duplicate the branch-slug helpers. Make `cmux/branch-slug.ts` import
      `sanitizeBranchName`, `trimBranchSlugToLength`, `finalizeBranchSlug`, and
      `MAX_BRANCH_SLUG_LENGTH` from the canonical top-level `branch-slug.ts`, leaving only the
      GPT-nano slug/summary generation. Evidence: ts-test green; the verbatim helper copy is
      gone; `branch-slug` tests still pass.

- [x] Unify the `planned-branch-output` message contract. Create one module owning the
      customType constant, the `PlannedBranchEvidence` shape, `formatPlanBranchEvidence`, and a
      typed `extractPlannedBranchEvidence(details)`; have `slot-dispatch-plan.ts` and
      `planned-branch-extension.ts` use it instead of the duplicated formatter/constant; rewrite
      `slot-open-branch.ts` inference to read the structured contract only and delete
      `extractTextPlannedBranchSelection` plus its helper cluster
      (`parseLabeledLine`, `isCustomLikeMessage`, `hasNonSuccessStructuredStatus`,
      `isClearNonSuccessPlannedBranchText`, `contentText`). Decision: the contract lives in the
      top-level pi-extensions module `planned-branch-output.ts`, and structured
      `details.evidence` is the single inference contract. Evidence: ts-test green;
      `test/cmux.test.ts` text-path case covers the dropped inference path;
      `planned-branch-extension.test.ts` green.

- [x] Extract the `openBranchInCmuxSlot` orchestrator and unify the workspace description.
      Move the shared tail (checkout slot → `getWorktreeDescription` → `openCmuxWorkspace` →
      notify, with unified failure formatting) into one helper; reduce `cmux-dispatch`,
      `cmux-slot:open-branch`, and `cmux-slot:dispatch-plan` to "produce branch + optional
      launch command, then call the orchestrator"; set the workspace description to `repo/branch`
      for all three (changing `cmux-dispatch` from the raw slot name). Collapse the duplicate
      error blocks in `validateSavedPlanForCurrentCheckout` and drop the dead `present()`
      success→info downgrade. Evidence: ts-test green; `test/cmux.test.ts` updated for the
      uniform `cmux-dispatch` description; behavior otherwise unchanged.

- [x] Naming normalization (final isolated slice). Renamed `cmux-dispatch` →
      `cmux-slot:dispatch-prompt` with no legacy alias; standardized the TS sidebar module/symbols
      on the sidebar noun; normalized standalone user-facing `CMUX` prose to `cmux`; changed the
      Pi transient sidebar status key to `pi:cmux-sidebar` while keeping `pi-summary` documented as
      the legacy cmux status key cleared by `asdl exec cmux-workspace-summary`. Updated
      `docs/pi/cmux-extension-pattern.md`, `docs/pi/README.md`,
      `ts/packages/pi-extensions/CONTEXT.md`, `docs/asdl-exec/cmux-workspace-summary.md`, and
      `skills/cmux-sidebar/SKILL.md`. Evidence: `just ts-check`, `just ts-test`,
      `just dprint-check`, and `git diff --check` green; targeted `rg` found no `cmux-dispatch` or
      standalone `CMUX` residue in the scoped suite/docs.

## Parked

- [ ] Package-wide `isRecord`/guards consolidation. `isRecord` is re-declared in ~19
      non-cmux files across `pi-extensions`; promote a single canonical guard module and migrate
      callers. Separate objective — out of scope here.

- [ ] Reconcile the two slug-from-content strategies. `cmux/branch-slug.ts`'s GPT-nano
      generation and `autobranch-preparation.ts`'s slug derivation solve the same
      "branch slug from content" problem differently; unify behind one `generateBranchSlug`
      home. Cross-feature; design the shared contract first.
