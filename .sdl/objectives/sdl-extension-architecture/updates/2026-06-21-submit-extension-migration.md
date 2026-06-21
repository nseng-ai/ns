# Submit extension migration

## Semantic Update

`sdl submit` is restored as a project-local SDL extension at `.sdl/extensions/submit.ts`. The SDL kernel remains empty of repository workflow built-ins, and the old inactive built-in wrapper path (`ts/packages/sdl/src/default-commands/submit.ts`) plus submit-failure interpretation module were removed.

The restored extension intentionally uses only the public SDL author API import (`@sdl/sdl/sdk`) plus Node runtime modules in its source. The large local copy is deliberate SDK-pressure evidence: submit currently needs command composition, pending-worktree checkpointing, Graphite dry-run/restack/submit orchestration, GitHub PR metadata reads/edits, PR-description prompt/model/fingerprint handling, progress streaming, raw failure logs, and model-primary failure summarization without relying on `@sdl/core/*` or SDL internal migration exports.

Pi now restores only the flat `/sdl:submit` mirror over `sdl submit`. `/sdl:code:submit`, `/dev:submit`, `/submit`, and other legacy submit aliases remain absent. The command-skill replacement surface for submit now points at the flat `/sdl:submit` surface.

## Validation evidence

- `pnpm --dir ts run test -- packages/sdl/test/scenario/submit-cli.test.ts packages/pi-extensions/test/sdl-extension.test.ts packages/pi-command-surfaces/test/pi-command-surfaces.test.ts packages/pi-extensions/test/push.test.ts packages/areg/test/gateways/real-gateways.test.ts`
  - Vitest reported the full configured suite green: 296 files / 2992 tests passed.

## Follow-up pressure

- Decide which copied submit seams should become future SDK/kernel/lower-package author-facing capabilities, if any.
- Revisit whether future project-local command migrations should allow public lower-package imports, because the SDK-only submit copy is intentionally large.
- `regenerate-pr` remains a separate migration row.
