# Cache Convergence Grill Decisions

## Summary

A grill session resolved the plan-level decisions needed before implementation makes broad progress:

- Review cache is a distinct Roaster concept from Review log. Review logs remain run history; Review cache records are structured reusable compute artifacts.
- Review cache identity is the full execution contract: Canonical reviewed diff hash, Review definition content hash, resolved model/profile, and Roaster prompt/schema/cache-version identity. Commit SHAs and bounded prompt-input coverage are audit fields, not key fields.
- The Canonical reviewed diff is the exact full filtered Git diff text after Roaster exclusions. V1 preserves current Git diff defaults beyond Roaster's existing command shape, so cache lookup may land in shadow mode, but LLM-skipping cache hits require local↔CI hash parity evidence first.
- The proposed opaque `brmem sync` primitive is replaced in the plan by first-class Branch Memory Pull / Branch Memory Push semantics: fetch remote Snapshot refs, Entry-union-merge remote into local Snapshots, push with non-fast-forward rejection, and require pull-before-retry behavior. A future `sync` command may be sugar.
- Publish-time suppression uses a branch-scoped Roaster Publication ledger keyed by review key + Finding fingerprint, suppressing repeated findings from both summary and inline output.
- CI should persist Branch Memory, but only a no-model fan-in persistence job should hold `contents: write`; model-running review jobs stay read-only.

## Objective Impact

The Objective remains open and still targets convergence, local→CI reuse, and durable origin-backed Branch Memory state. The roadmap now separates material-progress slices from trust gates:

- cache plumbing may be implemented in shadow mode before trusted hit-skipping;
- trusted cache hits are blocked on Canonical reviewed diff local↔CI parity evidence;
- origin-backed durability depends on Branch Memory Pull/Push rather than a Roaster-local sync operation;
- publication convergence depends on the Publication ledger rather than only GitHub comment marker dedupe.

The ADR row expanded to capture the decisions above, and the Open Questions were narrowed to remaining conflict-policy, fixture-set, PR-republication, and GC-lifetime details.

## Follow-Ups

- Write the ADR with the resolved vocabulary and trade-offs.
- Define the local↔CI parity fixture set for Canonical reviewed diff hashes.
- Design Branch Memory Pull/Push conflict behavior, especially outside content-addressed Review cache records.
- Implement shadow cache lookup before enabling LLM-skipping hits.
