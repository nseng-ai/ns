# Roadmap

## Work

- [ ] Fold `code-gt-restack-resolve` into Flow: rename into the `ns-flow-*` family
      with cross-reference sweep (`code-just-the-stack`, `code-fix-gh-stack`, `graphite`
      skill pointers), and establish the Flow README workflows tier — the "commands you
      run vs. workflows your agent drives" split, the `pull-trunk` → restack narrative,
      and the `ns address` boundary reference. Wire preflight to
      `ns slot gt exec restack-preflight` when it lands; the fold-in itself is not
      hard-gated on that primitive.
- [ ] Fold `code-just-the-stack` into Flow: resolve the validation-point open
      question (`flow.validate` vs. reuse of `flow.submit.pre`), generalize the hardcoded
      `just` through the chosen point, rename per the naming open question, update
      cross-references, and document in the README workflows tier.
- [ ] Fold `code-gt-linearize-descendants` into Flow: rename, retarget its per-branch
      evidence loop at `ns slot gt exec descendants-report`, document in the README
      workflows tier. Gate: start after `slot-gt-restack-preflight` lands
      descendants-report — that Objective already names linearize as a waiting consumer.
- [ ] Fold `code-fix-gh-stack` into Flow: rename the hardened skill, confirm its
      triage facts route through the enriched `ns address exec` surface, document in the
      README workflows tier. Gate: sequenced behind `stack-repair-loop-hardening`'s final
      skill rewrite so Flow absorbs the hardened loop, not the current one.

## Parked

- [ ] Evaluate the `code-workflows` router's stack-lifecycle commands
      (`delete-stack`, `stackify-branch`, `stacker-agent`) as future Flow workflow-tier
      candidates once the four fold-ins settle the tier's shape.
