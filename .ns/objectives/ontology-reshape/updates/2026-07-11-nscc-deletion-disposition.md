# nscc deletion disposition executed

## Summary

The CCC/orchestration grilling session decided to delete the unscoped `nscc` host
rather than rename, scope, or glossary it. This direct trivial slice removes
`ts/packages/hosts/nscc`, its sole-consumer workspace/style-guard/catalog support,
and live documentation claims. The workspace now has 26 tracked packages under
`ts/packages/` and no unscoped package exception.

The similarly named `ns slot gt exec stack-map-branches` surface is not nscc support
and remains intact: `skills/code-smush/SKILL.md` and the stack-smush Objective consume
it. The `nscc cmux report` bootstrap reporter had no external caller.

## Objective Impact

- The `nscc` disposition is executed evidence for the still-open CCC/orchestration
  row; that row remains unresolved because its broader CCC boundary and naming
  decisions are not part of this slice.
- The final package-context decision no longer needs to name or glossary `nscc`.
- Live inventory and consumer documentation now reflects the deletion; historical
  ADR, retrospective, wayfinding-sweep, and Objective evidence remains unchanged.

## Follow-Ups

- Complete the remaining CCC/orchestration grilling decisions and record their
  eventual resolution separately.
- Recompute package/context coverage from live source during the final documentation
  phase rather than carrying forward older sweep counts.
