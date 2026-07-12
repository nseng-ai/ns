# Roadmap

Frontier of typed Question Rows (ideation). Rows are unordered beyond their explicit
blocked-by references; the Frontier is the open, unblocked rows. Resolve one row per
session: record the decision as a Semantic Update, mark the row `[x]`, graduate any
Fog the answer makes stateable, and rewire or drop invalidated rows.

## Work

- [x] (grilling) Submission-class surface — resolved as separate verbs:
      `ns flow submit` is the fast WIP push with no reviews or PR prose;
      `ns flow ship` is the completion/readiness pipeline that validates, reviews,
      autofixes, reconciles stack-wide PR titles and managed descriptions, pushes,
      and attests. Agent completion workflows must route to `ship`; raw `gt submit`
      is an explicit recovery fallback, not a semantic substitute.
- [ ] (grilling) Stack-tip review semantics — what diff the tip review sees
      (merge-base of the whole stack against trunk?), and whether findings map back to
      owning branches or stay stack-scoped.
- [ ] (grilling) AUTO classification axis — review-level eligibility gate
      (frontmatter, e.g. `auto_apply`) plus per-finding `disposition` alongside
      `severity` in `ReviewFinding`; schema and review-prompt changes.
- [ ] (research) Latency reality check — measure wall-clock of quick-profile reviews
      run in parallel over representative whole-stack diffs on this repo; produce a
      short linked summary. Confirms or disproves the core latency assumption.
- [ ] (grilling) Validation bar for surviving fixes — what must pass before an AUTO
      fix is kept (scoped native `tsc`/lint on touched packages vs full `just`); defines
      "safe to push a model fix".
- [ ] (prototype) Fixer engine — standalone `ns roaster exec review-fix` (or
      equivalent) running review → classify → fix → validate offline against a real
      branch; linked prototype, dogfoodable before any submit integration.
      Blocked by: AUTO classification axis; Validation bar for surviving fixes.
- [ ] (grilling) Fix placement across the stack — single labeled autofix commit at
      the tip vs per-branch distribution (absorb-style); restack cost, visibility,
      and revertability of model-written fixes.
      Blocked by: Stack-tip review semantics.
- [ ] (grilling) Anti-incremental review state encoding — how a local stack-tip run
      participates in the convergence state the remote path already stamps in the
      GitHub Findings comment (last-reviewed head + capped prior-findings union;
      `ts/packages/capabilities/reviews/src/core/findings-comment.ts`, ADR 0027) versus
      an alternative store (git note, diff-hash key); what keys it and who reads/writes
      it locally versus in CI.
      Blocked by: Stack-tip review semantics.
- [ ] (grilling) Ship pipeline integration — phase position in the Flow phase stream,
      the never-block/never-dirty invariant, escape hatch, and TTY confirmation before
      pushing auto-fixes. Include a stack-wide metadata reconciliation postcondition:
      every submitted branch receives a PR plus title/managed-description disposition;
      incomplete prose may degrade to a plain push, but the result is "submitted, not
      shipped" and no ship attestation is recorded. Add an incident-regression scenario
      for a three-branch new stack so partial metadata cannot report ship success.
      Note: PR title/description generation currently lives inside `ns flow submit`
      (default for new PRs and, since trunk commit 5636cb792, for existing PRs with
      empty bodies); this row also owns moving that prose work to `ship` so `submit`
      can honor its decided no-prose contract.
      Blocked by: Fixer engine.
- [ ] (grilling) Remote roaster's residual role — whether the remote review workflow
      (`.github/workflows/reviews.yml`) keeps running tripwires as a backstop, shrinks
      to un-attested deltas only, or retires; how it honors review state written by
      local prod submission given its own existing convergence stamping.
      Blocked by: Anti-incremental review state encoding.

## Parked

- (none)
