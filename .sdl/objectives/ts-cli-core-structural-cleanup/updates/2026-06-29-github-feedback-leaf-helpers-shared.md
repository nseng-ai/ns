# GitHub feedback leaf helpers shared

Implemented the neutral GitHub PR feedback leaf-helper cleanup slice.

- `@sdl/core/github-pr-feedback` now intentionally exports narrow helper leaves: `ghAuthorSchema`, `normalizeAuthor`, `numericGithubIdentity`, and the failure-agnostic `parseGithubJson` / `GithubJsonParseResult` JSON+Zod primitive.
- `@sdl/roaster` imports those helpers through the curated `@sdl/core/github-pr-feedback` subpath and no longer defines local `ghAuthorSchema`, `normalizeAuthor`, or `numericId` copies in `src/gateways/github.ts`.
- Roaster keeps its own gateway, review-log, file, marker, mutation, and failure-mapping policy. The shared JSON helper only reports parse vs schema errors; Roaster still maps those into `github-json-invalid` and `github-response-invalid`.
- Roaster discussion comments now use Core's positive safe numeric GitHub identity policy. Missing, non-numeric, zero, and negative ids in listed comments or add/update mutation responses produce `github-response-invalid`; positive numeric string ids remain accepted and normalized to numbers.

Validation:

- `pnpm --dir ts --filter @sdl/roaster test`
- `just ts-format-check` after `just ts-format-fix`
- `just ts-deps-check`
- `just ts-lint`
- `just ts-check`
- `just ts-test`
- `just ts-test-integration`
