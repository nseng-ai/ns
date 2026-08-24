# GS-native architecture and contract baseline established

## Summary

The installed official `github/gh-stack` extension was revalidated at exactly v0.1.0 through public help and disposable, no-remote Git repository experiments. The resulting evidence is captured in `docs/research/gh-stack-v0.1.0-workflow-baseline.md`: local `init`, `add`, and `view --json` behavior is observed directly, while networked `sync`, `submit`, `link`, and `merge` claims remain explicitly unverified.

ADR 0061 accepts GS-native lifecycle ownership and narrowly supersedes ADR 0049's anticipated neutral Flow adapter direction for gh-stack. The GS README now records the exact version policy, everyday-loop boundary, independent postcondition rule, four outcome classes, and forward-only recovery contract without claiming that unsettled network mutations are implemented.

## Objective Impact

The Architecture and contract baseline roadmap row is complete. The exact initial provider baseline question is resolved to v0.1.0, and the assumption that the public provider surface can support the target loop is strengthened but remains conditional on focused remote experiments.

The next slice can build narrow GS-owned public-command adapters and semantic facts. It must not encode help-text claims about networked atomicity or rollback as guarantees, read provider-private state for lifecycle operations, introduce a Flow dependency, or preempt the later reconciliation, submit, and land experiments.

## Follow-Ups

- Build the GS provider module against the exact v0.1.0 baseline with version-drift, malformed-output, process-failure, and provider-versus-Git disagreement coverage.
- Use the roadmap's focused reconciliation, submit, and land slices to settle remote phase boundaries and authoritative GitHub postconditions before promising those workflows.
- Keep the GS README and supporting capability documentation synchronized as each workflow contract becomes observed ground truth.
