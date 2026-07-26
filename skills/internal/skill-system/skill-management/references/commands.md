# `npx skills` command reference

Load this reference when the workflow in `../SKILL.md` needs command details.
For first-party operations, always supply the explicitly approved full canonical
destination (`$DEST`) and flat identity (`$IDENTITY`). Do not infer either from
the examples.

## `add <source>` (`a`)

`<source>` may be a GitHub shorthand or URL, git/GitLab URL, or local path. A
first-party local source is the exact nested path, for example:

```bash
DEST=skills/internal/skill-system/skill-management
IDENTITY=skill-management
npx skills add "./$DEST" --agent codex claude-code -y
# After confirming this identity is the bootstrap copy, remove that exact copy.
rm -rf ".agents/skills/$IDENTITY"
ln -s "../../$DEST" ".agents/skills/$IDENTITY"
```

The committed local lock source is the exact repo-relative `$DEST`, not the
absolute path captured during bootstrap and not `skills/<identity>`.

Useful flags:

| Flag                     | Use                                                               |
| ------------------------ | ----------------------------------------------------------------- |
| `-g`, `--global`         | Install at user scope, not project scope.                         |
| `-a`, `--agent <agents>` | Select agents. This repo uses `--agent codex claude-code`.        |
| `-s`, `--skill <skills>` | Select identities from a multi-skill source.                      |
| `-l`, `--list`           | List skills available from a source.                              |
| `-y`, `--yes`            | Skip confirmation. Required by the canonical install form.        |
| `--copy`                 | Force copies. Do not use in this repo layout.                     |
| `--all`                  | Select all skills and agents. Do not use for targeted management. |
| `--full-depth`           | Search all subdirectories even when a root `SKILL.md` exists.     |

GitHub examples:

```bash
npx skills add withgraphite/agent-skills --skill graphite \
  --agent codex claude-code -y
npx skills add dagster-io/fake-driven-testing \
  --skill fake-driven-testing fdt-refactor-mock-to-fake \
  --agent codex claude-code -y
```

## `remove [skills]` (`rm`)

```bash
npx skills remove "$IDENTITY" --agent codex claude-code -y
```

For a first-party skill, this removes installed surfaces but not necessarily the
canonical source. Confirm `$DEST` from the lock entry and symlink before
removing exactly that directory. Never use `--all`, `skills/*`,
`skills/<disposition>/*`, `.agents/skills/*`, or `.claude/skills/*` for a
targeted removal.

Flags include `-g` (global), `-a` (specific agents), `-s` (specific skills), and
`-y`. `--all` is intentionally excluded from this workflow because it is an
installation-wide destructive operation.

## `list` (`ls`)

```bash
npx skills list
npx skills list --json
npx skills list -a claude-code
INSTALL_INTERNAL_SKILLS=1 npx skills list | rg '<identity>'
```

`--json` emits machine-readable output; `-g` lists global scope.

## `find [query]`

Interactive source search:

```bash
npx skills find
npx skills find typescript
```

## `check` and `update`

`check` inspects remote sources only. Local first-party skills are edited in
place and are not checked or updated by these commands.

```bash
npx skills check
```

`update` updates all remote-sourced skills. Prefer targeted `add` with explicit
`--skill` selections so a curated source does not unexpectedly install more
skills.

## Other subcommands

- `init [name]`: generic scaffold; copy a suitable local shape only after the
  new skill has an approved canonical destination.
- `experimental_install`: restore from `skills-lock.json`; usually unnecessary
  when overlays and vendored content are committed.
- `experimental_sync`: sync npm-packaged skills. This belongs to npm-package
  acquisition and does not replace ns first-party provisioning or
  `ns skill-exposure`.

## Agent layout

Universal agents read flat `.agents/skills/<identity>`. Claude Code receives a
flat dedicated symlink at `.claude/skills/<identity>` targeting
`../../.agents/skills/<identity>`. Explicit `--agent codex claude-code -y`
avoids accidental auto-detected directories.

For first-party content, `.agents/skills/<identity>` targets
`../../<exact-canonical-destination>`. For GitHub-sourced content, that entry is
a real vendored directory. Never replace vendored content with a first-party
canonical symlink.

## `skills-lock.json`

```json
{
  "version": 1,
  "skills": {
    "<identity>": {
      "source": "skills/<disposition>/<family>/<identity>",
      "sourceType": "local",
      "computedHash": "<64-character-lowercase-sha256>"
    }
  }
}
```

Approved top-level product exceptions omit `<family>` but still use their exact
approved path. Regenerate local hashes through supported `npx skills` behavior,
normalize only the source to the exact repo-relative destination, inspect the
diff, and restore the identity's `.agents` symlink if bootstrap replaced it.
Never stage placeholders such as `PENDING_REGEN`.

A GitHub lock source remains its upstream identifier, such as
`withgraphite/agent-skills`, with `sourceType: "github"`.

## Visibility and exposure

`metadata.internal: true` affects `npx skills` discovery. Use
`INSTALL_INTERNAL_SKILLS=1` to list or install such a skill. It is distinct from
canonical disposition and from Skill Exposure Policy.

`ns skill-exposure` owns exposure overlays on explicit skill paths. `npx skills`
does not apply exposure policy, and npm-module-bundled provisioning remains the
separate `ns skills` / `ns update` channel.
