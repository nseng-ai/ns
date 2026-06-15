# Semantic Update: `areg init` TypeScript port

## Summary

Ported the visible `areg init` project-bootstrap command to `ts/packages/areg`.

Implemented behavior includes:

- visible `areg init [target]` command registration with repeatable `--agent`, `--yes`, and `--no-append` surface;
- Git worktree-root enforcement through `@asdl/core/git`;
- direct bootstrap install through the existing `AregNpxSkillsGateway` with `dagster-io/asdl-tools --skill skill-management --skill skillx`;
- package-local prompt gateway for managed-block confirmations;
- package-local init project gateway for constrained inspection and write application;
- agent resolution precedence from explicit agents, `asdl.toml`, legacy `areg.json`, then `codex`/`claude-code` defaults;
- line-based `[areg]` TOML section rendering/replacement using `smol-toml` only for parse/validation;
- managed `AGENTS.md` and `CLAUDE.md` block planning, including `@AGENTS.md` de-duplication;
- `.claude/settings.local.json` template creation while preserving existing settings;
- plan → `npx skills add` → revalidated writes ordering;
- real adapter symlink/path safety and post-`npx` parent revalidation.

## Validation

Focused gates passed:

```bash
pnpm --dir ts --filter @asdl/areg run check
pnpm --dir ts --filter @asdl/areg run test
```

Coverage added:

- scenario tests for command success, repeatable `--agent`, TOML preservation, legacy migration, prompts, `--yes`, `--no-append`, malformed managed markers, invalid legacy bypass with explicit agents, npx non-destructiveness, Git-root/subdirectory rejection, and JSON output;
- unit tests for TOML/legacy parsing, `[areg]` rendering/replacement, managed marker bounds, append newline behavior, and Claude include control;
- real gateway tests for init inspection, traversal refusal, symlinked `.claude` parent revalidation, and settings parent creation under the project root.

## Accepted divergence / note

Clinkr represents `--no-append` as a negated boolean over an internal `append` request field, because Commander treats long options beginning with `--no-` as negations. The visible CLI surface is still `--no-append`, and the command behavior matches the Python durable contract. This affects the generated input schema name only, not the user-facing flag.

The Python progress line `Installing bootstrap skills via npx skills add...` was not reproduced; TS Clinkr rendered-command handlers currently emit final human output rather than streamed mid-command progress. Final output still includes `Install more persistent skills with \`npx skills add ...\``.

## Remaining follow-ups

- Port `areg update-skills`.
- Port `areg command convert|revert|list`.
- Decide TypeScript distribution/install model.
- Cut over public callers and retire the Python package only after remaining command slices and distribution evidence exist.
