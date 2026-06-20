# Intermediate Rephase Before Outstanding Changes Merge

## Summary

Rewrote `repo-ontology` tracking as an intermediate refresh rather than a final inventory freeze. The current checkout baseline still has the root context, `CONTEXT-MAP.md`, 8 in-scope Python package contexts, and `@asdl/pi-extensions`, with root/Pi/asdl-core/brmem foundation already landed. However, outstanding changes are expected to merge before closure and add more contexts, edges, or ambiguity work.

The roadmap is now split into smaller phases: current-checkout map catch-up, a post-outstanding-merge rebaseline, one phase per currently known missing package context, and a final map/readback phase. The final phase is explicitly not immutable; new context phases should be inserted after the post-merge rebaseline if the outstanding changes expand the inventory.

Evidence: clean `master` at `origin/master`; current workspace has 9 tracked Python packages, with `asdl-dispatcher` still operation-less/out of context scope; tracked context files currently exist for root `CONTEXT.md`, `packages/asdl-core/CONTEXT.md`, `packages/brmem/CONTEXT.md`, and `ts/packages/pi-extensions/CONTEXT.md`.

## Objective Impact

- `objective.md`: reframed the Objective as an intermediate baseline plus pending post-merge expansion; updated scope, completion criteria, assumptions, risks, and open questions so closure depends on the final merged context inventory, not only today's checkout.
- `roadmap.md`: collapsed completed old Phases 0–2 into a completed foundation section; added Phase 3 for current-checkout map catch-up; added Phase 4 for a post-outstanding-merge rebaseline; split the currently known missing package contexts into separate phases; moved final map/readback to Phase 11 with explicit permission to insert new phases before it.
- No production code changed.

## Follow-Ups

- Next work remains Phase 3: update `/CONTEXT-MAP.md` to mark brmem present, refresh brmem wording, and label the current map inventory as an intermediate snapshot pending outstanding merges.
- After the outstanding changes merge, run Phase 4 before treating the package-context list or final map work as complete.
