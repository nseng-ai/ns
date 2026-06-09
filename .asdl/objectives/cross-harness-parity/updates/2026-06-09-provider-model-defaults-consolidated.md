# Provider Model Defaults Consolidated Behind Shared Seam

## Summary

Closed the provider-default consolidation roadmap row. Shared (non-adapter) code and skills no longer carry hardcoded provider model refs; defaults come from one configurable source.

What landed:

- New seam `ts/packages/plans/src/model-defaults.ts`: `DEFAULT_FAST_MODEL_REF` (`openai-codex/gpt-5.4-mini`) as the single default literal, plus `parseModelRef`, `resolveModelRef(env, envVar, defaultRef)`, and the asserted `DEFAULT_FAST_MODEL` parsed form, all exported from `@asdl/plans` with unit tests.
- The three byte-identical `model-slug.ts` copies (`pi-extensions`, `ccc/autobranch`, `planned-branch`) are deleted; the canonical helper now lives in `@asdl/plans` with an optional `model` parameter and a `resolveSlugModel(env)` resolver over the new `ASDL_SLUG_MODEL` env var. All slug call sites (planned-branch content slugs, pi-extensions handoff/plan content slugs, ccc autobranch branch slugs) resolve the env var and surface invalid values through the existing `SlugModelFailure` paths.
- `ccc/src/cmux/sidebar.ts` dropped its local default ref and `parseModelRef` duplicate; it imports both from `@asdl/plans` while keeping the `ASDL_CCC_SIDEBAR_MODEL` override and fallback-with-warning behavior.
- `pi-extensions/src/fast-text-draft.ts` models are now overridable via `PI_DRAFT_MODEL` (full `provider/modelId` ref or bare modelId for the codex-pi harness; model string for the claude-cli harness); the codex default derives from `DEFAULT_FAST_MODEL`, the claude-cli branch keeps `claude-haiku-4-5` as a named, documented, overridable default, and invalid overrides warn and fall back.
- Shared prompt guidance `packages/asdl-core/src/asdl_core/prompts/defaults/subagent-launch.md` (and its checked-in `.asdl/prompts/` mirror) now describes the harness's configured cheap/fast and stronger escalation models generically instead of naming `openai-codex/gpt-5.4-mini:medium` / `openai-codex/gpt-5.5:high`.
- `skills/refactor-swarm/SKILL.md` speaks of the harness's cheapest fast model tier, keeps `model='haiku'` only as an explicitly labeled Claude-harness example, and documents the omit-the-model-parameter fallback for harnesses without a haiku-tier model or per-dispatch selection.

Evidence: lock-in grep sweep (`gpt-5.4-mini|gpt-5.5|claude-haiku|openai-codex` over `ts/packages/*/src`, `skills/*/SKILL.md`, `packages/asdl-core/src`) leaves only the accepted survivors — the single default in `plans/src/model-defaults.ts`, the env-mitigated `asdl-dev` checkpoint default, and the overridable claude-cli branch default. The `internal-code-submit` / `internal-code-checkpoint` skills also mention the `asdl-dev` default, but only as documentation of the `ASDL_DEV_CHECKPOINT_MODEL` override. Verification: full `just` passed (python checks, dprint, ts-check, ts tests, pytest); targeted prompt-resolver tests passed.

## Objective Impact

The provider lock-in drift risk recorded by the 2026-06-09 full sweep is de-risked: every named lock-in site now resolves through the `@asdl/plans` model-defaults seam or a per-purpose env override. The model-text assumption is now validated for slugs: slug derivation routes through one configurable helper rather than three Pi-adjacent copies. No parity-table changes — no Pi command or tool surface changed.

asdl-dev intentionally stays standalone (already env-mitigated by `ASDL_DEV_CHECKPOINT_MODEL`); the default ref literal therefore exists in exactly two places (`plans/src/model-defaults.ts` and `asdl-dev/src/text-generation.ts`), an accepted trade against adding a workspace dependency for one literal.

## Follow-Ups

- The `plans` vs `pi-extension-runtime` `command-runtime.ts` near-duplication was observed but deliberately left out of scope; consider a future roadmap row if it grows.
- Diff-scoped parity review should keep checking new code for reintroduced hardcoded provider refs; the sweep grep in this update is the reusable check.
