# Roadmap

## Work

- [x] Write the ADR: generation-time convergence, GitHub-as-durable-state, compute layering (PR context optional), and the rejected cache/ledger design with parity and fingerprint-drift evidence
  - Evidence: `docs/adr/0027-roaster-generation-time-review-convergence.md` added on local branch `roaster-review-convergence/adr-generation-convergence`; `just dprint-check` and `just docs-check` passed.
- [ ] Stamp the Last-reviewed head (PR head SHA — not CI's merge-commit `HEAD` — + reviewed base ref and its merge-base SHA) and the cumulative capped Prior-findings block machine-readably in the summary Findings comment at publish, surviving the body overwrite
- [ ] Build Prior-findings context gathering: read the stamped findings block + review-thread resolution status (reusing the `@ns/capability-kit/github/pr-feedback` GraphQL surface) for a review key on a PR, with an explicit cap; degrade to a context-free review on gathering failure
- [ ] Thread Prior-findings context and changed-since-Last-reviewed-head guidance into the review prompt as an optional input; keep `ns roaster review run` PR-free by default
- [ ] Write the convergence prompt instructions with the anchoring guard; unit-test prompt assembly
- [ ] Wire PR context into the CI matrix review jobs (existing `PR_NUMBER`/`GH_TOKEN`/`pull-requests: write`; no permission changes)
  - Policy: direct execution; no new permissions or triggers — any change needing them is ask-first.
  - Evidence: workflow diff references only existing env/permissions; touched TS validated with targeted tests.
- [ ] Validate empirically on representative PRs: resolve→resubmit does not re-raise surfaced findings on unchanged code (including rephrased variants), a content-preserving `gt restack` force-push re-raises nothing, and new work still gets full-strength review
      Evidence: targeted tests and relevant repo checks passed.
  - Policy: steer first — needs real PRs, LLM compute, and GitHub writes; a human drives this slice.

## Parked

- [ ] Review compute caching / local→CI reuse — revisit only if LLM compute cost proves material; requires first resolving CI merge-commit vs local branch-head diff parity and pinning remaining git diff config
- [ ] Branch Memory origin distribution (Pull/Push, fan-in `contents: write` job) — no consumer after the pivot to PR-held state
- [ ] Draft-gating / CI trigger changes — revisit only if generation-time suppression proves insufficient
- [ ] Provenance / signing of shared review state — moot without pushed-up cache records
