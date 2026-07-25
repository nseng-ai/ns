---
edges:
  - objective: harness-session-generation
    annotation: "Survives the closed architecture exploration as the canonical Reviews outcome: Pi/Vercel AI Gateway is the configured path, while the direct Claude Code and Codex compatibility runners remain supported."
---

# Reviews via the Pi Harness and Vercel AI Gateway

## Thesis

The reviews capability gains a `pi` harness so review model calls route through pi's built-in `vercel-ai-gateway` provider, collapsing review execution — local and CI — onto one installed CLI and one credential (`AI_GATEWAY_API_KEY`). With that in place, the CI review lane turns back on: the two quick tripwire reviews stop being `local_only` and run again on every PR, and the `reviews.yml` workflow sheds its Claude Code + Codex install/login steps and dual provider secrets.

Harness selection stays implicit in the model reference's provider prefix (the existing design): `vercel-ai-gateway/<model>` refs resolve to the new `pi` harness, alongside the kept `anthropic/*` → claude-code and `openai/*`, `openai-codex/*` → codex mappings.

## Scope

- Extend `ReviewsHarness` and `resolveReviewsModelReference` (`ts/packages/capabilities/reviews/src/core/review-model-reference.ts`) so `vercel-ai-gateway/<rest>` provider refs resolve to a new `pi` harness.
- New `PiProcessReviewRunner` implementing `ReviewHarnessRunner` (`gateways/review-runner.ts` seam): headless pi invocation (`--provider vercel-ai-gateway --model <modelId> --no-session --no-extensions --mode text --print`, per the precedent in `capability-kit/src/kit/model-slug.ts`), findings-JSON contract in the system prompt, parsed through `reviewResponseFromFindingsPayload`. Wire into `RoutingReviewRunnerOptions` and `core/context.ts`, with unit tests beside the existing runner tests.
- Route both `ns.toml` review model profiles (`reviews_quick`, `reviews_deep`) through `vercel-ai-gateway/...` refs, so quick CI reviews and deep local reviews all execute on the pi harness.
- Update `.github/workflows/reviews.yml`: install the pi CLI instead of Claude Code + Codex, drop `codex login`, and pass only `AI_GATEWAY_API_KEY`.
- Re-enable exactly the two quick tripwire reviews for CI by removing `local_only: true` from `.ns/reviews/ns-typescript-style-tripwire/review.md` and `.ns/reviews/reinvented-abstractions-tripwire/review.md`.

## Non-Goals

- Enabling any of the four deep reviews (`code-smell-review`, `dry-but-not-too-dry`, `improve-codebase-architecture`, `thermonuclear-review`) in CI. They stay `local_only`; putting them in CI would be a new decision outside this record.
- Removing or deprecating the Claude Code and Codex review runners or their provider-prefix mappings. They remain supported compatibility harnesses and are intentionally kept even though the configured quick and deep profiles route through Pi.
- Migrating Reviews onto a unified foundation harness-session architecture. The closed `harness-session-generation` Objective explored that design, but the unimplemented architecture was superseded by the simpler Pi/Vercel AI Gateway route rather than becoming a prerequisite here.
- Adding an explicit harness field to review frontmatter; harness stays derived from the model provider prefix.
- Changing the review definitions' content, applicability globs, or the findings/publishing pipeline.

## Completion Criteria

- The `pi` harness runner is landed in the reviews capability with unit tests covering arg construction, output parsing, and failure mapping, and `resolveReviewsModelReference` accepts `vercel-ai-gateway/<model>` refs.
- Both `ns.toml` review profiles reference `vercel-ai-gateway/...`, and a local deep review run (`ns reviews run` with the deep profile) succeeds end-to-end through the pi harness.
- `reviews.yml` installs pi as the only review harness CLI and carries only `AI_GATEWAY_API_KEY` as a model credential.
- The two quick tripwire reviews are CI-enabled (`ns reviews list --ci` returns them).
- Proof: a real PR shows both quick reviews running green in the CI matrix and posting findings via `reviews exec publish-findings`.

## Assumptions and Risks

**Assumptions**

- The `AI_GATEWAY_API_KEY` secret already exists in the GitHub repository secrets (user-confirmed at creation, 2026-07); no secret provisioning work is in scope. If this proves wrong, adding the secret is a small human action, not a design change.
- Pi's built-in `vercel-ai-gateway` provider authenticates via the `AI_GATEWAY_API_KEY` env var (confirmed in `@earendil-works/pi-ai` `dist/env-api-keys.js` and `dist/providers/vercel-ai-gateway.js` at creation time).
- The Vercel AI Gateway serves the currently configured models (`openai/gpt-5.6-luna`, `openai/gpt-5.6-terra`) under those ids, matching the existing `fast = "vercel-ai-gateway/openai/gpt-5.6-luna"` precedent in `ns.toml`.
- Headless pi (`--mode text --print`, no session, no extensions) is adequate for review execution; the repo already relies on this invocation shape in `capability-kit`.

**Risks**

- Structured output: unlike Codex's `--output-schema` enforcement, pi text mode returns free text, so findings-JSON parsing may be brittle. Mitigation: a strict findings-JSON contract in the system prompt plus tolerant extraction/parse tests; if unreliable in practice, escalate to `--mode json` parsing of the final assistant message.
- Deep local reviews change harness (Codex → pi) as a side effect of moving `reviews_deep`; review quality or latency may drift. Rollback is config-level: point the profile back at `openai/...` and the kept Codex runner takes over.
- The kept-but-unrouted Claude Code and Codex runners could rot unnoticed once no profile routes to them. This is an accepted compatibility cost: their qualified provider mappings, focused runner tests, structured findings behavior, input-coverage propagation, cancellation/failure mapping, and cleanup behavior remain the preservation boundary; no migration to a shared session substrate is planned by this Objective.
- Pi version drift is de-risked by using the workspace catalog/lock pin (`0.80.5`) and verifying the existing `@nseng-ai/ns` package's linked `pi` binary in CI; no second global install or version literal is required.
- The local deep review and real-PR publication proofs remain open evidence gates. The credential is available locally, but the implementation session's attached-plan protocol forbids the Branch Memory log write performed by `ns reviews run`; a later unconstrained session must run the proof without weakening Reviews logging.

## Open Questions

- Whether a credentialed deep review confirms text-mode extraction is reliable in practice; focused tests support the selected single-object parser, so JSONL final-message parsing remains only a separately justified remediation if live evidence fails.

## Closure

**Outcome: deferred (2026-07-25).** The Pi/Vercel AI Gateway runner, provider routing, configured profiles, CI workflow migration, and quick-tripwire eligibility are implemented and tested. The Objective closes rather than competing with the higher-priority `professional-repo-curation` rename, package-move, CI, and operational-decoupling work.

**Restart pointer:** resume only when Reviews is selected for a supported ship or sponsored graduation. Trust the implemented runner tests, provider-prefix compatibility contract, profile migration, and `ns reviews list --ci` evidence as the baseline. Rebaseline package paths, Pi invocation/version, Vercel and GitHub configuration, workflow installation, credentials, and the current review command names after the repository reorganization. Then complete the two partially finished roadmap rows: run a credentialed local deep review end-to-end and prove on a real PR that both quick reviews execute and publish findings. If live text-mode extraction fails, evaluate JSON-mode final-message parsing from observed evidence rather than preemptively redesigning the runner.

The direct Claude Code and Codex runners remain an intentional compatibility boundary; closure does not deprecate them.
