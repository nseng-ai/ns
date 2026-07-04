# Pivot to Generation-Time Convergence

## Summary

A red-team critique of the cache/ledger design, grounded in the roaster, brmem,
and address packages plus the CI workflow, found three defects that together
motivated a pivot:

- **The motivating scenario was uncovered.** On a resolve→resubmit push the
  diff necessarily changes, so the Review cache misses, the LLM re-runs, and
  re-found findings drift in phrasing and line position — defeating any
  fingerprint keyed on content/location. Roaster's existing durable sha256
  inline-marker dedupe is the same scheme and has not stopped the treadmill.
  The old completion criteria only tested the identical-diff and unchanged-code
  cases.
- **The hash-parity assumption was contradicted as shaped.** CI checks out the
  PR *merge commit* (`actions/checkout` default on `pull_request`) while local
  runs diff the branch head, so `origin/base...HEAD` diffs match only while the
  base has not advanced past the fork point; the diff command also leaves
  `diff.algorithm`, `diff.renames`, and `core.quotepath` unpinned against
  laptop gitconfig.
- **Branch Memory Pull/Push was a new distributed-sync primitive, not a wiring
  extension.** brmem is entirely clone-local today: the `setup-git` fetch
  refspec is non-force in-place (fails on divergence), CAS has no retry loop,
  and no merge machinery exists. Meanwhile GitHub already durably holds
  roaster's prior findings (marker-keyed comments, inline threads) and an
  addressed signal (thread resolution).

The pivot: converge at generation time. Feed each review run its own prior
surfaced findings (with resolution status) and a Last-reviewed head stamped in
the summary comment; instruct the model to hold already-reviewed unchanged
regions to the prior standard while reviewing changed regions at full strength.
Semantic suppression by the model is the only mechanism that recognizes a
rephrased re-nitpick.

## Objective Impact

The Objective remains open and still targets convergence of the
resolve→resubmit loop. Thesis, Scope, Non-Goals, Completion Criteria, and
roadmap were rewritten:

- Review cache, execution-contract cache identity, Canonical reviewed diff,
  shadow mode, and local→CI compute reuse moved to Non-Goals/Parked — deferred
  on cost grounds, blocked on diff parity, and not a convergence mechanism.
- Branch Memory origin distribution (Pull/Push, fan-in `contents: write` job)
  dropped; convergence state lives on the PR, and the workflow keeps
  `contents: read`.
- The fingerprint Publication ledger is replaced by Prior-findings context in
  the prompt; the existing exact-match marker dedupe stays as a deterministic
  backstop.
- Completion criteria now cover the motivating changed-diff cycle (no rephrased
  re-raises on unchanged code) and an anchoring guard (new work still gets
  full-strength review).
- Supporting vocabulary updated: the six cache/ledger terms in the roaster
  CONTEXT.md and the Branch Memory Pull/Push terms in the brmem CONTEXT.md
  (all introduced alongside the original objective, unmerged) were replaced by
  Prior-findings context and Last-reviewed head.

## Follow-Ups

- Write the ADR, including the rejection rationale and evidence above.
- Decide the Prior-findings context cap and the resolved/unresolved prompt
  treatment.
- Decide whether local runs fetch PR context by default or opt-in.
