# Branch Memory Entry Locator Helper Reused

## Summary

The current branch exports `mustEntryLocator` from the public `@asdl/brmem` package surface and updates `@asdl/handoff` to use it for Handoff Entry Locator construction instead of keeping a package-local build-and-throw wrapper.

Evidence: local branch diff against `remove-python-handoff-fallback-plugin-path` changes only `ts/packages/brmem/src/index.ts` and `ts/packages/handoff/src/operations/shared.ts`. Targeted validation passed:

```bash
pnpm --dir ts/packages/handoff run check
pnpm --dir ts/packages/handoff run test
pnpm --dir ts/packages/brmem run check
```

## Objective Impact

This confirms the v1 package boundary for Handoff as a Branch Memory consumer: storage operations still go through the public `brmem` CLI boundary, while stable public `@asdl/brmem` validation/ref-layout helpers can be imported directly when they remove local duplication without changing Handoff Namespace, Handoff Key, Handoff Slug, JSON, markdown, or exit-code behavior.

No roadmap checkbox changes are needed from this cleanup. The remaining live roadmap work is still the umbrella TypeScript migration closeout and child Objective closure slice.

## Follow-Ups

- Carry this boundary lesson into the umbrella TypeScript migration `porting-playbook.md` during the closeout row.
- Avoid expanding Handoff into native `@asdl/brmem` storage imports unless a future implementation slice proves a simpler public boundary with tests.
- Run broader TypeScript/workspace validation with the umbrella closeout slice if it changes migration docs or Objective records.
