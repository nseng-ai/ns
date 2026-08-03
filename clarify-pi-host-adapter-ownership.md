# Prevent false NS/Pi ownership findings for host adapters

## Goal and user-visible outcome

Tighten the repository’s `ns-typescript-style-tripwire` instructions so the automated review no longer mistakes a correctly located `pi-ns-*` Pi host adapter for a harness-independent ns extension merely because both package trees contain an `extensions/` path segment.

After this change, the tripwire must preserve the actual ownership rule:

- harness-independent ns extension packages under `ts/packages/{public,incubating}/extensions/<domain>/` must not own Pi integration or presentation;
- Pi host adapters under `ts/packages/{public,incubating}/hosts/pi/extensions/pi-ns-<domain>/` are the correct owners of Pi registration, lifecycle integration, interaction, and presentation;
- a `pi-ns-*` adapter is still reportable when it bypasses its matching extension’s exact `@nseng-ai/<domain>/api` commitment boundary, reaches into private extension source, or otherwise takes ownership of harness-independent domain behavior.

The change should land as a separate, single-thesis review-precision PR rather than as a follow-up commit on Herdr PR #4084. It is repository-wide review doctrine, not part of the Herdr prompt-visibility behavior change.

## Context and discovered facts

### Triggering false positive

Herdr PR #4084 changed:

`ts/packages/incubating/hosts/pi/extensions/pi-ns-herdr/src/pi/impl-session.ts`

The change controls the rendering of a Pi custom transcript entry. The automated `ns-typescript-style-tripwire` reported:

> Pi-host presentation logic is owned by the ns extension

and recommended moving the behavior to the Pi adapter/integration boundary. The file is already in `@nseng-ai/pi-ns-herdr`, the dedicated Pi host adapter. Its package README and CONTEXT explicitly say that this package owns Pi registration, interaction, and presentation. The finding therefore inverted the intended boundary.

The unresolved #4084 thread remains a verifiable decline/already-satisfied item: no Herdr production change is needed to comply with it. This plan improves the repository-wide review instructions separately so the same path-classification error is less likely to recur.

### Authoritative package topology

`ts/packages/README.md`, in **Host ownership: Pi**, is the authoritative operational package-topology contract. It currently establishes that:

- Pi’s host category vocabulary includes `runtime/`, `extensions/`, `tools/`, and `subagents/`;
- live Pi adapters include `incubating/hosts/pi/extensions/{pi-ns-branch-context,pi-ns-flow,pi-ns-handoffs,pi-ns-herdr,pi-ns-objectives}/`;
- a Pi integration over an ns extension is named `pi-ns-<domain>` and consumes the matching extension specifically through `@nseng-ai/<domain>/api`;
- source ownership is judged by the LM-run tripwire rather than syntax heuristics.

The wording is architecturally correct but does not explicitly warn that `extensions/` has two context-dependent meanings: an owner directly beneath a disposition root versus Pi’s host-owned extension category beneath `hosts/pi/`.

ADR `docs/adr/0045-release-disposition-and-owner-nested-package-ontology.md` records the accepted architecture: ns extensions are harness-independent domain owners and Pi integrations belong in separately owned `pi-ns-<domain>` host packages. ADRs are immutable time-in-place records and must not be edited for this clarification. `ts/packages/README.md` is the appropriate present-tense operational doctrine.

### Active review definition

`.ns/reviews/ns-typescript-style-tripwire/review.md` is the exact instruction body supplied to the automated review model. Its active Tier A rule 24 currently begins:

> **NS/Pi extension ownership commingling.** Flag changed source in an ns extension under `ts/packages/{public,incubating}/extensions/` when it owns Pi-host integration rather than harness-independent domain behavior.

It later says to flag a `pi-ns-*` adapter that bypasses the matching `/api` boundary. Although the first path does not literally match `hosts/pi/extensions/`, the fast LM inferred ownership from the repeated path word and emitted a false positive. The prevention must therefore be explicit and positive, not merely implied by path shape.

The review definition’s provenance block currently names the portable TypeScript skill, the ns TypeScript overlay, fake-driven gateway guidance, consumer-gateway composition guidance, and `ts/AGENTS.md`. Rule 24 also derives from the package ontology, so the provenance should additionally name `ts/packages/README.md` as its authoritative operational source and tell future refreshes to preserve the distinction between ns extension ownership and Pi’s host-owned `extensions/` category.

Do not move rule 24 to `tier-b.md`: package ownership is intended to remain an active Tier A review rule. The correction narrows its false-positive behavior without weakening the real `/api` and domain-placement checks.

### Existing regression-test pattern

`ts/packages/incubating/extensions/reviews/test/unit/review-definition.test.ts`:

- loads `.ns/reviews/ns-typescript-style-tripwire/review.md` through `parseReviewDefinition`;
- verifies the real review definition parses with the expected profile and applicability;
- contains a targeted test named `preserves the actionable undefined tripwire instructions` that asserts important instruction text survives future edits.

A corresponding targeted instruction-preservation test is the narrow deterministic regression seam for this change. It cannot prove how every LM will reason, but it can prevent a future refresh from silently dropping the explicit host-adapter exclusion. Do not introduce a live model invocation into the unit suite.

### Relevant domain vocabulary

`ts/packages/incubating/extensions/reviews/CONTEXT.md` defines a **Tripwire** as a fast Reviews definition that cheaply flags likely issues; it produces findings but is not exhaustive and does not remediate. The existing vocabulary is already accurate and requires no update.

## Scope

### In scope

1. `.ns/reviews/ns-typescript-style-tripwire/review.md`
   - correct Tier A rule 24;
   - update provenance/refresh guidance so the correction survives regeneration.
2. `ts/packages/README.md`
   - clarify the two distinct `extensions/` path contexts in the authoritative Host ownership: Pi section;
   - state positively that `pi-ns-*` packages under `hosts/pi/extensions/` own Pi host integration and presentation.
3. `ts/packages/incubating/extensions/reviews/test/unit/review-definition.test.ts`
   - add deterministic regression assertions for the corrected instruction contract.

### Out of scope

- Herdr behavior, renderer code, tests, README, or CONTEXT on PR #4084.
- Moving any existing `pi-ns-*` package or changing package manifests/exports.
- Weakening the rule that harness-independent ns extensions cannot own Pi integration.
- Weakening the exact `@nseng-ai/<domain>/api` consumption boundary.
- Editing ADR 0045 or any other ADR.
- Adding a live/remote LM test to the default unit suite.
- Reworking Reviews publication, finding schemas, or GitHub thread handling.
- Resolving or replying to the #4084 review thread as part of source implementation; GitHub mutation requires the appropriate confirmed addressing workflow.

## Files, symbols, and tests

### `.ns/reviews/ns-typescript-style-tripwire/review.md`

Relevant areas:

- top provenance comment block;
- `## Active Tier A rules`;
- rule 24, `**NS/Pi extension ownership commingling.**`.

Required semantics for rule 24:

1. Continue to flag Pi-owned source placed directly in an ns extension package under `ts/packages/{public,incubating}/extensions/<domain>/`.
2. Explicitly distinguish `ts/packages/{public,incubating}/hosts/pi/extensions/pi-ns-<domain>/` as Pi host-adapter ownership.
3. Explicitly state that Pi command/tool registration, Pi lifecycle hooks, and Pi-specific interaction/presentation are expected in that host adapter and are not findings by themselves.
4. Continue to flag adapter boundary violations: private/deep source access, bypassing the matching exact `/api` commitment boundary, or ownership of harness-independent domain behavior.
5. Tell the fast reviewer to use the full owner path rather than treating any `/extensions/` segment as an ns extension.
6. Preserve the instruction to skip ambiguous findings rather than invent intent.

Keep the rule concise enough for a fast per-diff model. Prefer one positive path contrast plus a short list of actual adapter violations over a long architectural essay.

Provenance update:

- add `ts/packages/README.md` as the authoritative operational package-topology/host-ownership source for rule 24;
- in regeneration instructions, explicitly preserve the distinction between `<disposition>/extensions/<domain>/` and `<disposition>/hosts/pi/extensions/pi-ns-<domain>/`.

### `ts/packages/README.md`

Relevant section: `### Host ownership: Pi`.

Add a compact operational clarification near the category vocabulary and adapter naming paragraphs. It should explain that:

- `extensions/` directly beneath a disposition root denotes the harness-independent ns extension owner tree;
- `hosts/pi/extensions/` is Pi’s host-owned category for Pi runtime extensions/adapters;
- therefore `incubating/extensions/herdr/` owns harness-independent Herdr behavior, while `incubating/hosts/pi/extensions/pi-ns-herdr/` correctly owns Pi registration, interaction, and presentation;
- path classification must use the full owner path, not the terminal category word in isolation.

Do not duplicate a full package inventory or introduce new ontology terms. Keep `ts/packages/README.md` synchronized with, but not a rewrite of, ADR 0045.

### `ts/packages/incubating/extensions/reviews/test/unit/review-definition.test.ts`

Add a test adjacent to `preserves the actionable undefined tripwire instructions`, using the same parse-real-definition pattern. A suitable name is:

`preserves the NS/Pi host-adapter ownership distinction`

Assertions should establish that parsed instructions contain:

- the ns extension owner path shape;
- the Pi host-adapter path shape;
- positive wording that Pi-specific presentation/integration in the host adapter is not a violation by itself;
- the retained exact `/api` boundary obligation.

Use stable semantic fragments rather than asserting the entire rule paragraph. This guards the essential contract while allowing later editorial refinement.

## Implementation steps

### 1. Establish a separate implementation branch/PR thesis

Implement this plan independently of Herdr PR #4084. The intended change thesis is “make the NS/Pi ownership tripwire classify Pi host adapters correctly.” Do not add the work as another commit to the Herdr prompt-visibility PR.

If the downstream implementation session begins on the Herdr branch because this Saved Plan was authored there, first create or switch to a clean dedicated branch based on the current local `master` using the repository’s normal branch workflow. Revalidate that the three scoped files match the anchors above after switching. Do not carry Herdr-only commits into the review-precision PR.

### 2. Clarify the operational package doctrine

Read the complete Host ownership: Pi section in `ts/packages/README.md`, then make a precise semantic edit that distinguishes the two owner paths and provides the Herdr path pair as a concrete example.

Keep all existing rules about adapter naming, exact `/api` consumption, declared curated cross-extension exports, and source-level LM judgment intact.

### 3. Correct and harden tripwire rule 24

Edit the review definition’s provenance and rule 24 together so the rule and its derivation remain synchronized.

Use explicit positive classification. The essential shape is:

- flag Pi ownership in `<disposition>/extensions/<domain>/`;
- do not flag Pi integration/presentation merely because it is in `<disposition>/hosts/pi/extensions/pi-ns-<domain>/`;
- flag the host adapter only for exact API-boundary, private-source, or domain-ownership violations.

Do not add broad exclusions for all files under `hosts/pi/`: the host adapter can still violate its extension boundary. Do not convert the rule into path-only logic; semantic ownership remains relevant after the correct package class is identified.

### 4. Add a deterministic instruction-contract regression

Extend `review-definition.test.ts` with the targeted preservation test described above. Parse the actual review definition and assert the critical path/ownership fragments. Do not mock a model, run network services, or add nondeterministic LM output assertions.

### 5. Inspect the resulting diff for accidental weakening

Read the complete new rule 24 and verify these examples mentally:

- changed Pi renderer in `incubating/extensions/herdr/` → report;
- changed Pi renderer in `incubating/hosts/pi/extensions/pi-ns-herdr/` using `@nseng-ai/herdr/api` → no ownership finding;
- `pi-ns-herdr` deep-imports `extensions/herdr/src/...` → report;
- `pi-ns-herdr` imports the Herdr package root instead of its exact `/api` commitment boundary → report;
- host adapter begins owning reusable Herdr branch-selection/domain policy → report on semantic ownership grounds.

## Execution strategy

This plan contains three related but semantically different edits: review instructions, canonical package-topology prose, and a TypeScript regression assertion. Per `skills/incubating/branch-context/enriched-plan-save/references/refactor-execution-strategy.md`, use **precise per-file semantic edits** after reading each affected section. There are only three files, and the prose has different ownership in each; do not use an opaque `text.replace()` script, codemod, or refactor swarm.

After editing, use a bounded terminology/path check for `NS/Pi extension ownership`, `hosts/pi/extensions`, and `pi-ns-` across the three scoped files to confirm the doctrine and regression remain aligned.

## Validation guidance

Run focused validation first:

```bash
pnpm --dir ts exec vitest run packages/incubating/extensions/reviews/test/unit/review-definition.test.ts
```

Validate the review Markdown exactly as required by its provenance block:

```bash
dprint check .ns/reviews/ns-typescript-style-tripwire/review.md
```

Because a TypeScript test changed, run the Reviews package checks:

```bash
pnpm --dir ts --filter @nseng-ai/reviews test
pnpm --dir ts --filter @nseng-ai/reviews check
```

Run formatting checks and use repository autofixers only if checks identify drift. For Markdown/TOML drift, use `just dprint-fix`; for TypeScript formatting drift, use `just ts-format-fix`, then rerun the corresponding checks.

Run the final repository baseline:

```bash
just
```

Perform a final bounded search:

```bash
rg -n \
  --glob '!*.map' \
  --max-columns 300 \
  --max-columns-preview \
  'NS/Pi extension ownership|hosts/pi/extensions|pi-ns-' \
  .ns/reviews/ns-typescript-style-tripwire/review.md \
  ts/packages/README.md \
  ts/packages/incubating/extensions/reviews/test/unit/review-definition.test.ts |
head -n 200
```

Every relevant statement should classify the full owner path correctly.

Optional proportional smoke: run the tripwire locally against a small synthetic or real diff containing a presentation-only change under a `pi-ns-*` adapter and inspect whether it avoids the old ownership finding. Treat this only as model-behavior evidence, not a deterministic gate; do not publish findings or mutate GitHub during the smoke.

## Risks, assumptions, and open questions

### Risks

- **Overcorrection could disable valid findings.** A blanket exclusion for `hosts/pi/extensions/` would hide private-source imports or domain ownership inside adapters. Preserve the adapter-side checks explicitly.
- **Instruction length can reduce fast-model precision.** Keep rule 24 direct and contrastive; move no additional architecture essay into the active review body.
- **Brittle test wording.** Assert several stable semantic fragments, not the complete paragraph.
- **Doctrine drift during future regeneration.** The provenance update must name `ts/packages/README.md` and preserve the path distinction explicitly.
- **Branch contamination.** This Saved Plan originates from the Herdr feature-branch session, but the user selected a separate PR. The implementation must not accidentally include #4084’s Herdr commit.

### Assumptions

- `ts/packages/README.md` remains the authoritative operational contract for package topology.
- ADR 0045 remains immutable and already expresses the accepted architecture correctly.
- Review-definition unit tests are the correct deterministic seam for preserving critical instruction wording.
- No product command surface, storage behavior, compatibility promise, or user-visible Herdr behavior changes in this work.

### Open questions

None material. The structured grill resolved placement as a separate single-thesis PR. Exact prose can be refined during implementation provided the semantic contract and regression assertions above remain intact.

## Review and remediation

Before completion, review the final diff specifically for:

1. whether the full path, rather than the word `extensions`, determines package class;
2. whether a correct `pi-ns-*` adapter is positively recognized as the Pi presentation owner;
3. whether private/deep imports and exact `/api` bypasses remain reportable;
4. whether harness-independent domain ownership is still kept out of the host adapter;
5. whether provenance and regression coverage prevent a later refresh from dropping the clarification;
6. whether changed files remain exactly within the three-file scope.

A TypeScript-style review should treat this as a review-definition precision change, not an invitation to redesign Reviews. Fix local mechanical findings, rerun focused validation, then rerun `just`.

For PR #4084, the original thread’s code-level disposition remains decline/already satisfied because the renderer was already in `@nseng-ai/pi-ns-herdr`. This separate PR may be cited later as repository-wide false-positive prevention once it has a stable PR number, but source implementation does not itself authorize replying to or resolving that GitHub thread. Use the confirmed PR-feedback addressing workflow for any such mutation.
