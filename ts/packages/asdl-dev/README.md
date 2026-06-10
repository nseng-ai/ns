# asdl-dev

`asdl-dev` is a repo-local developer CLI for `asdl-tools` TypeScript workflows.

Pi mirrors selected commands from this CLI's command table into domain-specific slash-command namespaces: `/dev:preview-url` through `.pi/extensions/asdl-dev.ts`, and `/code:cp` plus `/code:submit` through `.pi/extensions/code.ts`. For the promotion pattern, see [Exposing Pi Commands Through `asdl-dev`](../../../docs/pi/exposing-pi-commands-through-asdl-dev.md).

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

## `submit`

Checkpoint outstanding worktree changes with `asdl-dev cp`, submit the current Graphite stack with `gt submit -nps --no-ai`, verify that `gt pr` reports a PR for the current branch, then generate title/body descriptions for PRs newly created by that submit.

```bash
pnpm --dir ts run asdl-dev submit
pnpm --dir ts run asdl-dev submit --restack
```

Before touching Graphite, `submit` inspects the worktree. If there are pending changes, it creates a model-authored `[cp]` checkpoint commit using the same model environment variables as `cp`. After that, it runs a dry-run first. If Graphite says the stack needs a restack, interactive direct CLI and Pi invocations ask before running `gt restack --no-interactive`; non-interactive invocations fail with guidance unless `--restack` is supplied. Pass `--restack` to skip the prompt and run `gt restack --no-interactive` automatically before submitting.

PR description generation uses `ASDL_DEV_PR_DESCRIPTION_MODEL` and resolves the system prompt from `ASDL_DEV_PR_DESCRIPTION_PROMPT`, `.asdl/prompts/pr-description.md`, then the built-in prompt. Existing PRs are not refreshed by submit; run `asdl-dev pr-regen` on a branch to regenerate its current PR. `pr-regen` refuses to overwrite a non-empty body without the generated marker unless `--force` is passed.

### Testing architecture

CLI scenario tests call `runCli(...)` with semantic in-memory gateways. Real gateway tests own exact `git`, `gt`, and `vercel` command construction, parsing, and failure mapping.
