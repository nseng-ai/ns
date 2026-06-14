# asdl-dev

`asdl-dev` is a repo-local developer CLI for `asdl-tools` TypeScript workflows that have not yet moved to SDL.

Pi mirrors selected commands from this CLI's command table into domain-specific slash-command namespaces: `/dev:preview-url` through `.pi/extensions/asdl-dev.ts` and `/code:pr-regen` through `.pi/extensions/code.ts`. Checkpoint creation has moved to `sdl cp` / `/sdl:cp`; submit has moved to `sdl submit` / `/sdl:submit`. For the promotion pattern, see [Exposing Pi Commands Through `asdl-dev`](../../../docs/pi/exposing-pi-commands-through-asdl-dev.md).

## Command shape

`*-dev` CLIs in this repo use a flat list of task commands. Prefer commands like `preview-url` over nested command groups such as `preview url`.

## `preview-url`

Print the Vercel preview URL for a branch.

```bash
asdl-dev preview-url
asdl-dev preview-url --branch feature/demo
asdl-dev preview-url --json
```

If the repo environment has not been loaded, run the same CLI through the `ts/` pnpm workspace, for example `pnpm --dir ts run asdl-dev preview-url`. The migrated TypeScript workspace expects Node `>=24.12.0` and pnpm `>=10.14.0`.

Default output is only the resolved preview URL plus a newline, suitable for shells and agents.

### Options

- `--branch TEXT`: branch to look up. Defaults to the current git branch.
- `--project TEXT`: Vercel project.
- `--scope TEXT`: Vercel scope/team.
- `--json`: emit structured JSON on stdout for both success and failure.
- `-h`, `--help`: show command help.

### Project and scope precedence

Project resolution uses the first nonblank value from:

1. `--project`
2. `VERCEL_PROJECT`
3. `.vercel/project.json` `projectName`
4. hardcoded default `asdl-tools`

Scope resolution uses the first nonblank value from:

1. `--scope`
2. `VERCEL_SCOPE`
3. hardcoded default `schrockns-projects`

### Vercel evidence

`preview-url` queries Vercel preview deployments with GitHub-backed metadata only:

```text
githubCommitRef=<branch>
```

It selects the newest READY preview deployment returned by that query, inspects it, and resolves the displayed URL by this policy:

1. Use `branchAlias` only when it appears in inspected aliases.
2. Otherwise use the first inspected alias.
3. Otherwise use the immutable deployment URL.

## Submit migration

`asdl-dev submit` has been removed. Use:

```bash
sdl submit
sdl submit --restack
```

Pi exposes the same workflow as `/sdl:submit`; `/code:submit` is not retained as a compatibility alias.

## `pr-regen`

`asdl-dev pr-regen` remains here until its own SDL migration decision. It regenerates the current branch PR's title and body with the asdl PR-description prompt, replacing any existing body.

Most users hit this behavior through `/code:pr-regen`.

Generation uses `ASDL_DEV_PR_DESCRIPTION_MODEL` and resolves the system prompt from `ASDL_DEV_PR_DESCRIPTION_PROMPT`, `.asdl/prompts/pr-description.md`, then the built-in prompt.

### Testing architecture

CLI scenario tests call `runCli(...)` with semantic in-memory gateways. Real gateway tests own exact `git`, `gh`, and `vercel` command construction, parsing, and failure mapping.
