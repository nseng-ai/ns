# Branch-context diagnostics and administration

Use this reference for non-happy-path branch-context work. Keep diagnostics narrow, inspect before mutating, and refuse ambiguous destructive changes.

## General diagnostics posture

- Prefer `enriched-plan exec resolve` for saved-plan resolution.
- Prefer `enriched-plan list` for read-only local saved-plan store inspection across branch-key directories in the current repo.
- Prefer `ns branch-context exec load` for attached-plan loading.
- Prefer `ns branch-context exec list/check` for read-only branch-context entry inspection.
- Use `brmem list/get` read-only only when branch-context helpers are insufficient for diagnosing Branch Memory attachment state.
- Scope filesystem inspection narrowly to the relevant repo key under `$XDG_STATE_HOME/ns/enriched-plan/` (default `$HOME/.local/state/ns/enriched-plan/`); do not perform broad home-directory traversals.
- Prefer deterministic CLI helpers over manual file or Branch Memory operations when available.

## Common recovery cases

Step-skill operations carry their own Recovery sections — creation/attachment failures (no saved plan, target branch exists, Branch Memory entry exists, Graphite setup failure) live in `branch-context-from-plan`; attached-plan loading failures (missing/unexpected/ambiguous key, trunk/detached checkout) live in `branch-context-impl`. Only the orphan cases with no owning step skill live here:

- Stale plan content: report the observed mismatch and ask or adjust scope before implementing beyond the plan.
- Ambiguous admin wording (move vs copy, retarget scope): ask before changing files — see Admin examples below.

## Local plan store inspection

Path convention:

```text
$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md
```

For current-repo read-only inspection, prefer:

```bash
enriched-plan list
```

When manually inspecting saved plans:

- Compute or verify the encoded branch path segment: branch slashes become `---`.
- Inspect only the relevant `<repo>` or specific `<encoded-source-branch>` directory.
- Do not search broadly from the home directory.
- Treat the saved-plan filename slug as a local locator, not as proof of the branch-context slug.

## Read-only attached-plan inspection

Inspect branch-context entries with deterministic helpers first:

```bash
ns branch-context exec list --branch <branch> --format json
ns branch-context exec check <key> --branch <branch> --format json
ns branch-context exec load [<key>] --prompt-file <path> --format json
```

Inspect Branch Memory attachments directly only as a diagnostic fallback — not as a replacement for the create/load workflows:

```bash
brmem list --namespace branch-context --branch <branch>
brmem get <key> --namespace branch-context --branch <branch>
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
ns branch-context exec retarget-plan \
  --plan-file <path> \
  --source-branch <branch> \
  --format json
```
