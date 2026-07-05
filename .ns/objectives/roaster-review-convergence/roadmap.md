# Roadmap

## Work

- [x] Write the ADR: generation-time convergence, GitHub-as-durable-state, compute layering (PR context optional), and the rejected cache/ledger design with parity and fingerprint-drift evidence
  - Evidence: `docs/adr/0027-roaster-generation-time-review-convergence.md` is present at trunk HEAD and records the rejected alternatives (review compute cache, fingerprint publication ledger, Branch Memory origin distribution, hard input-level delta scoping) with the parity and fingerprint-drift rationale. Landed via PR #2879 (merged).
- [x] Stamp the Last-reviewed head (PR head SHA — not CI's merge-commit `HEAD` — + reviewed base ref and its merge-base SHA) and the cumulative capped Prior-findings block machine-readably in the summary Findings comment at publish, surviving the body overwrite
  - Evidence: `src/core/findings-comment.ts` writes a `roaster-state:v1` block into the marker-keyed summary comment alongside the existing `<!-- roaster:<key> -->` marker, carrying the reviewed head/base/merge-base and the capped cumulative findings union across the body overwrite. Landed via PR #2880 (merged).
- [x] Build Prior-findings context gathering: read the stamped findings block + review-thread resolution status (reusing the `@ns/capability-kit/github/pr-feedback` GraphQL surface) for a review key on a PR, with an explicit cap; degrade to a context-free review on gathering failure
  - Evidence: `src/core/prior-findings-context.ts` gathers the stamped block plus thread resolution as an optional input with an explicit cap; `test/unit/prior-findings-context.test.ts` covers it fake-driven. Landed via PR #2881 (merged); hardened by follow-on refactors #2893, #2895, #2898 (all merged).
- [x] Thread Prior-findings context and changed-since-Last-reviewed-head guidance into the review prompt as an optional input; keep `ns roaster review run` PR-free by default
  - Evidence: `src/gateways/review-runner-prompt.ts` and the `prior_findings_*` prompt assets thread context and changed-since guidance; the `--prior-findings-pr-number` CLI input is `.optional()` in `src/operations/cli-operations.ts`, so the default run stays PR-free. Landed via PR #2882 (merged).
- [x] Write the convergence prompt instructions with the anchoring guard; unit-test prompt assembly
  - Evidence: `prior_findings_context.md` carries the anchoring guard ("suppress only the same underlying prior issue; still surface genuinely new issues"); `prior_findings_last_reviewed_head_{available,unavailable}.md` encode the changed-since / Prior-findings-only fallback; `test/unit/review-runner-prompt.test.ts` exercises no-context and with-context assembly. Landed via the prompt-context stack and remediation PR #2890 (merged), which moved convergence guidance into prompt asset files.
- [x] Wire PR context into the CI matrix review jobs (existing `PR_NUMBER`/`GH_TOKEN`/`pull-requests: write`; no permission changes)
  - Policy: direct execution; no new permissions or triggers — any change needing them is ask-first.
  - Evidence: `.github/workflows/roaster.yml` passes `--prior-findings-pr-number "$PR_NUMBER"`, computes the base merge-base, and stamps `--reviewed-head-sha`/`--reviewed-base-merge-base-sha` at publish; the `permissions:` block stays `contents: read` / `pull-requests: write` with no `contents: write`, new triggers, or draft-gating. Landed via PR #2883 (merged).
- [ ] Validate empirically on representative PRs: resolve→resubmit does not re-raise surfaced findings on unchanged code (including rephrased variants), a content-preserving `gt restack` force-push re-raises nothing, and new work still gets full-strength review
  - Policy: steer first — needs real PRs, LLM compute, and GitHub writes; a human drives this slice.
  - Status: the only remaining semantic Work row and the gate on the empirical Completion Criteria; not yet performed. Evidence expected: targeted tests plus a documented real-PR demonstration of the three cases.

## Parked

- [ ] Review compute caching / local→CI reuse — revisit only if LLM compute cost proves material; requires first resolving CI merge-commit vs local branch-head diff parity and pinning remaining git diff config
- [ ] Branch Memory origin distribution (Pull/Push, fan-in `contents: write` job) — no consumer after the pivot to PR-held state
- [ ] Draft-gating / CI trigger changes — revisit only if generation-time suppression proves insufficient
- [ ] Provenance / signing of shared review state — moot without pushed-up cache records
