# Pi Gateway Local Slices Implemented

## Summary

The Reviews capability now has a `PiProcessReviewRunner` selected by `vercel-ai-gateway/<model>` references while preserving the Claude Code and Codex routes. The runner invokes catalog-pinned Pi in text mode, sends the assembled review prompt on stdin, exposes only `read` and `bash`, suppresses ambient extensions/skills/templates/context, and accepts exactly one findings JSON object through strict schema validation.

Both Reviews profiles now use Vercel AI Gateway references. The Reviews workflow uses only `AI_GATEWAY_API_KEY`, removes the global Claude Code/Codex setup and Codex login, exposes the existing `@nseng-ai/ns` package's pinned Pi binary on `PATH`, and verifies `pi --version`. Exactly the two quick Tripwires are now CI-eligible; the four deep definitions remain local-only.

## Objective Impact

The runner implementation and workflow migration roadmap rows are complete. Focused Reviews tests and full `just` validation pass, and `ns reviews list --ci --format json` returns exactly `ns-typescript-style-tripwire` and `reinvented-abstractions-tripwire`.

The profile row remains partial because its required deep end-to-end run has not executed. `AI_GATEWAY_API_KEY` is available in the local environment, but `ns reviews run` writes the Reviews Branch Memory log and the attached-plan implementation protocol forbids Branch Memory mutation in this session. The CI row also remains partial until a real non-draft same-repository PR proves both quick matrix jobs and findings publication.

Implementation evidence resolved two planning questions. Pi `0.80.5` supports the chosen flags and piped stdin. Pnpm does not link `pi` at `ts/node_modules/.bin`; the pinned executable is linked under existing consumer packages, so CI adds `ts/packages/hosts/ns/node_modules/.bin` rather than globally installing a duplicate version.

## Follow-Ups

- In a session without the attached-plan Branch Memory mutation prohibition, run a local deep review through `ns reviews run` using the configured `reviews.deep` profile and record the findings envelope.
- Open or update a suitable real PR that touches applicable production TypeScript, then verify both quick review matrix jobs and guarded `reviews exec publish-findings` behavior.
- If the live deep run shows text-mode extraction is unreliable, record that evidence before separately evaluating Pi JSONL final-message parsing.
