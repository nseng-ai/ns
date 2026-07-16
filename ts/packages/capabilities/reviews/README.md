# @nseng-ai/reviews

Reviews runs configured, read-only code reviews against the current PR diff and records structured findings. In this repo the canonical command face is:

```bash
ns reviews ...
```

## Review definitions

Review definitions live in `.ns/reviews/<key>/review.md`. The key is the direct child folder name under `.ns/reviews`; for example `.ns/reviews/ns-typescript-style-tripwire/review.md` is `ns-typescript-style-tripwire`. Reviews loads only direct child `review.md` files, so colocated files such as `references/*.md` are review assets rather than review definitions.

A definition is a Markdown file with YAML frontmatter followed by the review instructions:

```md
---
description: |
  Short human-readable description shown by `ns reviews list`.
model_profile: fast
local_only: false
applies_to:
  include:
    - "**/*.ts"
  exclude:
    - ".agents/skills/**"
---

Review only the supplied diff...
```

Frontmatter fields:

- `description` — required non-empty string.
- `model_profile` — optional non-empty string; defaults to `fast`. Current display groups `fast` as a tripwire and other profiles such as `deep` as deep reviews. `ns reviews run --model-profile ...` can override it for one run.
- `local_only` — optional boolean; defaults to `false`. Set `true` only for reviews that must never run in CI. CI discovery uses `ns reviews list --ci`, which excludes `local_only: true` definitions.
- `applies_to.include` — optional list of repo-relative glob patterns. When present, `ns reviews list --applicable` selects the review only when the diff touches a matching path.
- `applies_to.exclude` — optional list of repo-relative glob patterns removed from applicability. Use this for vendored skill directories or generated areas.

Applicability patterns must be globs, not git pathspecs; keep them repo-relative and do not use `..` segments.

## Model profiles and harnesses

Reviews resolves `model_profile` and `--model-profile` directly as aliases in the shared `[models.profiles]` repository policy. Any configured alias is valid; omitted `model_profile` uses `fast`:

```toml
[models.profiles]
fast = "vercel-ai-gateway/openai/gpt-5.6-luna"
deep = "vercel-ai-gateway/openai/gpt-5.6-terra"
architecture = "anthropic/claude-opus-4-6"
```

Use `--model-profile architecture` to select an alias for one run. Use `--model provider/model-id` only when overriding the configured model reference directly.

Provider routing is explicit:

- `anthropic/<model-id>` runs the local Claude Code CLI.
- `openai/<model-id>` and `openai-codex/<model-id>` run the local Codex CLI.
- `vercel-ai-gateway/<model-id>` runs the local Pi CLI through Vercel AI Gateway.

Bare aliases and other providers are rejected; Reviews never infers a provider from a model ID or falls back to another harness. The full qualified reference is retained in progress, results, and Review logs, while only the model ID is passed to the selected CLI.

Local runs require the selected CLI and its authentication (`AI_GATEWAY_API_KEY` for Pi through Vercel AI Gateway, `ANTHROPIC_API_KEY` for Claude Code, or `OPENAI_API_KEY` for Codex).

Override the concrete model for one run with another qualified reference:

```bash
ns reviews run <review-key> --model anthropic/claude-sonnet-4-6
```

Codex runs with a read-only sandbox, an ephemeral session, ignored user configuration, and schema-validated structured output. Codex token/cost usage is currently reported as `null`.

## Local operation

List all configured reviews:

```bash
ns reviews list
```

List the reviews that CI would consider, before path applicability:

```bash
ns reviews list --ci
```

List the CI-enabled reviews applicable to the current diff against a base branch:

```bash
ns reviews list --ci --applicable --base-ref main
```

Run one review locally:

```bash
ns reviews run <review-key> --base-ref main
```

This command remains the single-review, base-ref compatibility path. It supports one-run model/profile overrides, optional prior-findings context, and writes the existing per-review Review log.

## Revision-range roster API

The curated `@nseng-ai/reviews/api` surface also accepts an already-confirmed Git revision-range expression and a complete, ordered roster:

```ts
const result = await reviews.runReviewRoster(
  {
    revisionRange: "stack-base..stack-head",
    roster: [
      { reviewKey: "typescript-style", selected: true },
      { reviewKey: "docs", selected: false },
    ],
  },
  { onProgress: (event) => renderProgress(event) },
);
```

The roster must include every applicable checked-in Review definition exactly once; malformed catalog definitions are included so they remain visible as definition-stage failures. Because an invalid definition supplies no semantics to which selection can meaningfully apply, it is reported as failed regardless of its supplied `selected` flag. Successfully parsed non-applicable definitions must not be supplied. The supplied order is the confirmed execution order.

Reviews loads the explicit range diff once, runs selected reviews sequentially, and continues after review-local definition, declarative model-resolution, or runner failures. Toggled-off reviews remain in the result without lifecycle events. The timestamped return record retains ordered states, model and coverage evidence for completed reviews, typed failures, and source-attributed verbatim findings; identical finding tuples use a zero-based occurrence scoped to their source review.

This API operation is return-only and read-only: it does not write Review logs, gather or publish GitHub findings, edit the checkout, or accept roster-time model overrides. Progress callbacks are synchronous presentation plumbing and should remain lightweight and non-mutating.

## Review aggregation and resolution API

A completed roster result can be aggregated with one LM call through the same curated API:

```ts
const proposal = await reviews.aggregateReviewRoster({
  rosterResult,
  constraints: { mustGroup: [], mustSeparate: [] },
  decisions: { bulkConfirmUnconflicted: false, clusters: [] },
});
```

The returned clusters contain complete, verbatim source-attributed findings; duplicate text remains distinct through its source review and occurrence. Every roster finding appears exactly once in derived per-finding accounting. Cluster dispositions use `fix`, `fix-manually`, `reject`, or `defer`, and LM judgments remain `model-proposed` until an engineer decision confirms them.

Call the same operation again to correct a proposal. Supply the prior result, content-based grouping constraints, and explicit decisions rather than generated cluster IDs:

```ts
const corrected = await reviews.aggregateReviewRoster({
  rosterResult,
  priorResult: proposal.value,
  constraints: {
    mustGroup: [[findingA, findingB]],
    mustSeparate: [[findingA, findingC]],
  },
  decisions: {
    bulkConfirmUnconflicted: true,
    clusters: [{ findings: [findingC], disposition: "reject" }],
  },
});
```

Bulk confirmation applies only to unconflicted clusters. A recommendation-conflict cluster remains proposed unless an explicit complete-membership decision confirms or overrides it. Results report `all-proposed`, `partially-confirmed`, or `fully-confirmed` completeness. Invalid model output, constraints, prior state, or accounting fails the whole operation without a partial proposal.

Aggregation is return-only and read-only. It does not expose a CLI, persist a checkpoint or Review log, publish to GitHub, execute remediation, or mutate the checkout.

Useful checks after editing a review definition:

```bash
dprint check .ns/reviews/<review-key>/review.md
ns reviews list --ci --format json
ns reviews list --ci --applicable --base-ref main --format json
```

## CI operation

The GitHub Actions workflow is `.github/workflows/reviews.yml`.

Discovery job:

1. Resolves the PR base ref.
2. Fetches `origin/<base-ref>`.
3. Runs:

   ```bash
   ns reviews list --ci --applicable --base-ref "$BASE_REF" --format json
   ```

4. Uses `.data.keys` as the review matrix.

Review job:

1. Installs the TypeScript workspace and exposes the workspace-pinned Pi CLI.
2. Runs each selected review with:

   ```bash
   ns reviews run "$REVIEW_KEY" \
     --base-ref "$BASE_REF" \
     --log-branch "$GITHUB_HEAD_REF" \
     --format json
   ```

3. Pipes the result envelope to `ns reviews exec publish-findings` so findings are posted to the PR summary comment and inline comments when possible.

Operational notes:

- CI exposes `AI_GATEWAY_API_KEY` for the checked-in Vercel AI Gateway profiles and `GITHUB_TOKEN` for PR publication.
- Draft PRs and forked PRs are skipped by the workflow guard.
- A review definition appears in CI only when `local_only` is omitted or set to `false` and its `applies_to` globs match the current diff when `--applicable` is used.
- Review logs are written to Branch Memory under the `reviews` namespace, keyed as `reviews/<review-key>/...`; inspect them with `ns reviews log`.

## Review convergence: how Reviews avoids repetitive feedback

Without convergence, each push re-runs a stateless whole-diff review, and the model rephrases or relocates the same criticism after the author resolves it — a resolve→resubmit treadmill. Reviews prevents this with two complementary mechanisms (design rationale in ADR 0027):

1. **Generation-time semantic suppression** (primary). When a run is supplied with PR context, a gathering step assembles two optional prompt inputs:
   - **Prior-findings context** — a bounded set of previously surfaced findings for that review key on the PR, each with its review-thread resolution status. The prompt instructs the model not to re-raise a previously surfaced finding, resolved or unresolved, unless the underlying issue materially worsened. An anchoring guard limits suppression to the same underlying issue: genuinely new problems still surface, even in the same file or adjacent to a prior finding.
   - **Last-reviewed head** — the PR head SHA, reviewed base ref, and base merge-base recorded at the previous publish. Regions changed since the prior round get full-strength review; unchanged already-reviewed regions are held to the prior round's standard. Changed-since comparison uses PR-delta (merge-base) semantics rather than raw old-head..new-head, so a content-preserving Graphite restack or force-push does not read as churn.
2. **Exact-match publication dedupe** (deterministic backstop). Inline findings carry sha256-derived comment markers; publication skips any finding whose marker already exists on the PR. This catches only byte-identical repeats — the generation-time layer handles rephrased or line-shifted ones.

GitHub is the durable convergence store. Publishing stamps a machine-readable `reviews-state:v1` block into the marker-keyed Findings summary comment: the last-reviewed head SHA, base ref, base merge-base, and a capped cumulative union of surfaced findings, so a successfully suppressed finding does not disappear from state after one quiet round. Gathering reads that stamped block and hydrates thread resolution through the `pr-feedback` GraphQL surface; it never reconstructs state by parsing rendered comment markdown.

Degradation is safe by construction: `ns reviews run` stays PR-context-free by default (CI opts in), any gathering failure falls back to a context-free full review — noisy but never silently wrong — and if changed-since status cannot be computed the run degrades to Prior-findings-only convergence.
