# Parent Sequencing Inputs Settled and the Package Set Corrected

## Summary

Reconnaissance against the parent umbrella `professional-repo-curation`'s roadmap resolved two of the three sequencing inputs the code-level rename plan was waiting on, and corrected the package-set arithmetic that plan will depend on.

### Settled: no `extensions/` role directory ever exists

The parent's demotion row commits to creating a flat `ts/packages/incubator/` and `git mv`-ing the residents of `ts/packages/capabilities/` — plus both hosts and the rough tools/internal packages — into it. `references/blast-radius-inventory.md` left this conditional ("Rename physical role directory `ts/packages/capabilities/` to its extension-based destination *unless* the parent demotion moves those packages directly into the flat incubator first"). The parent has taken the flat-incubator branch, so the role directory disappears rather than being renamed to `extensions/`. The inventory's step-2 dependency is discharged and its warning about an intermediate move that "would immediately be undone" no longer applies.

### Settled: `extension-kit` stays clean-zone top-level

The parent's demotion row enumerates what moves into the incubator, and the kit is not among them. So `capability-kit` → `extension-kit` is a rename in place in the clean zone, not a move. This answers the placement half of the Objective's open question about the kit.

### Still open: the commit boundary

Whether the code cutover lands inside the demotion commit or in one immediately adjacent hard-cutover commit remains undecided here, and it couples to the parent's own open question of whether the demotion is a spawned Subobjective or executed directly. The rename plan cannot be finished without this decision.

### Corrected: the directory-move set and the tier-value set are different lists

`references/blast-radius-inventory.md` describes `ts/packages/capabilities/` as holding "11 package manifests" and separately lists 11 capability-tier packages; the parent's roadmap says "all 14 capabilities". Both are right in their own frame, and the reference conflates them in one line. The checkout shows:

- **14 directories** under `ts/packages/capabilities/`: the 11 below plus `cmux`, `retros`, and `vercel`.
- **11 packages declaring `"ns": { "tier": "capability" }`**: `branch-context`, `flow`, `handoffs`, `harness-artifacts`, `herdr`, `ns-init`, `objectives`, `plans`, `pr-feedback`, `reviews`, `slots`.
- `cmux`, `retros`, and `vercel` carry **no `tier` field at all** — they are directory residents without a tier declaration.

The rename plan must therefore treat the move set (14) and the retier set (11) as distinct. A plan phrased as "retier everything under `capabilities/`" would invent tier declarations on three packages that have none, and the parent's parked notes already expect `cmux` to be deleted rather than graduated and `vercel` to be revisited after ops decoupling.

This update supersedes the affected arithmetic in `references/blast-radius-inventory.md` rather than editing that reference in place.

## Objective Impact

The code-level rename plan row is now writeable except for the commit-boundary decision, which is the single remaining human-gated input. The double-move-churn risk in `objective.md` is partly de-risked — the `capabilities/` → `extensions/` vector is structurally gone, while the in-place kit rename still needs its commit boundary — and the open question about the kit has had its placement half answered. No code, docs, or prose changed in this update.

## Follow-Ups

- Settle the commit boundary with the user, then write the code-level rename plan and hand it to the parent umbrella.
- Carry the 14-vs-11 distinction into the plan's package tables explicitly.
- The prose sweep of live READMEs, `docs/`, and skills remains the open half of the vocabulary-layer row.
