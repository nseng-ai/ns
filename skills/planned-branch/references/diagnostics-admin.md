# Planned-branch diagnostics and administration

Use this reference for non-happy-path planned-branch work. Keep diagnostics narrow, inspect before mutating, and refuse ambiguous destructive changes.

## General diagnostics posture

- Prefer `enriched-plan exec resolve` for saved-plan resolution.
- Prefer `enriched-plan list` for read-only local saved-plan store inspection across branch-key directories in the current repo.
- Prefer `planned-branch exec load-plan` for attached-plan loading.
- Use `brmem list/get` read-only only when diagnosing Branch Memory attachment state.
- Scope filesystem inspection narrowly to the relevant repo key under `~/.asdl/enriched-plan/`; do not perform broad home-directory traversals.
- Prefer deterministic CLI helpers over manual file or Branch Memory operations when available.

## Common recovery cases

- No saved plan found: ask for an explicit saved plan path or run the write-plan workflow first.
- Target branch exists: stop and ask whether to choose another branch or inspect the existing branch.
- Branch Memory entry exists: stop; do not overwrite the attached plan manually.
- Graphite setup fails after branch creation: report the partial branch state; do not attach a plan manually unless the user explicitly directs recovery.
- Multiple attached plans: rerun `planned-branch exec load-plan` with the desired key/slug from the error or listing.
- Current branch is trunk/default/detached for implementation: stop and ask for the intended implementation branch.
- Stale plan content: report the observed mismatch and ask or adjust scope before implementing beyond the plan.

## Local plan store inspection

Path convention:

```text
~/.asdl/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md
```

For current-repo read-only inspection, prefer:

```bash
enriched-plan list
```

When manually inspecting saved plans:

- Compute or verify the encoded branch path segment: branch slashes become `---`.
- Inspect only the relevant `<repo>` or specific `<encoded-source-branch>` directory.
- Do not search broadly from the home directory.
- Treat the saved-plan filename slug as a local locator, not as proof of the planned-branch slug.

## Read-only attached-plan inspection

Inspect Branch Memory attachments directly only for diagnostics — not as a replacement for the create/load workflows:

```bash
brmem list --namespace planned-branch --branch <branch>
brmem get <key> --namespace planned-branch --branch <branch>
```

## Admin examples

### Retarget or change source branch

When wording clearly says retarget or change source branch, move the saved plan by default.

Before moving:

- identify the current path and intended target source branch;
- compute the target Local plan store path;
- check for a target path collision;
- stop unless replacement/destructive intent is explicit.

After moving:

- update only obvious planning-time/source-branch metadata lines inside the Markdown body when clearly metadata;
- leave historical narrative and incidental branch mentions untouched;
- remove the old source-branch directory only if it is empty;
- report old path, new path, branch/source evidence, and metadata edits.

### Copy or make available on another source branch

When wording clearly says copy or make available on another source branch, copy the saved plan instead of moving it.

Before copying:

- compute the target path;
- check for a target path collision;
- stop unless replacement/destructive intent is explicit.

After copying, report both paths and any obvious metadata edits made in the copy.

### Ambiguous move vs copy wording

If the user asks in a way that could mean either move or copy, ask which behavior they want before changing files.

## Future deterministic helper

If a CLI helper such as this exists in the future, prefer it over manual `mv`/edit operations:

```bash
planned-branch exec retarget-plan \
  --plan-file <path> \
  --source-branch <branch> \
  --format json
```
