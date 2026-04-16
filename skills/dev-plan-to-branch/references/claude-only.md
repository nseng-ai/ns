# dev-plan-to-branch — Claude Code notes

Harness-specific procedures for running this skill under Claude Code.
Other harnesses (Codex, Cursor, Gemini CLI, etc.) should follow the
base `SKILL.md` workflow without these additions.

## Plan mode

Claude Code exposes a plan mode that blocks `Write`, `Bash`, and other
mutating tools. While plan mode is active, the skill cannot run its
write / stage / commit steps. The system context exposes a writable
session-plan path that `ExitPlanMode` reads from.

If plan mode is active when the skill is invoked, do these in order
**before** running the base workflow's pre-flight checks (base step 4):

1. Run base step 2 (resolve source plan content) and capture source
   origin metadata.
2. Run base step 3 (generate the slug).
3. Use the `Write` tool to write a short session-plan to the
   harness-provided session-plan path. The session-plan should describe
   exactly what the skill is about to do. Mention source origin as a
   path if file-backed, or as "the most recent `<proposed_plan>` block
   in conversation context" if context-backed.

   Example (file-backed):

   ```
   # Stamp <source-plan> onto a new Graphite branch

   Run `dev-plan-to-branch` to:
   - Create a new branch `<slug>` via `gt create`.
   - Write `plan-<slug>.md` at the repo root containing `<source-plan>`
     verbatim plus the standardized Self-destruct footer.
   - Commit it as the branch's first commit.

   No push, no `gt submit`.
   ```

   Example (context-backed):

   ```
   # Stamp in-context plan onto a new Graphite branch

   Run `dev-plan-to-branch` to:
   - Create a new branch `<slug>` via `gt create`.
   - Write `plan-<slug>.md` at the repo root containing the most recent
     `<proposed_plan>` block from conversation context, verbatim plus
     the standardized Self-destruct footer.
   - Commit it as the branch's first commit.

   No push, no `gt submit`.
   ```

4. Call `ExitPlanMode`. It reads the session-plan file you just wrote
   and requests user approval.
5. After approval, continue with base step 4 (pre-flight checks). Steps
   2 and 3 above have already run and do not need to be re-run. If
   source content came from conversation context, carry that exact
   content forward after exit; do not attempt to rediscover it from
   disk.

If plan mode is **not** active, skip this entire procedure and start at
base step 2.

## Plan directory convention

Claude Code's conventional plan directory is `~/.claude/plans/`. When
applying base step 2.4 (filesystem fallback) under Claude Code, the
concrete command is:

```
ls -t ~/.claude/plans/*.md | head -1
```

## Anti-patterns

- Claiming "plan mode exited" in chat without actually calling
  `ExitPlanMode`. The `Write` and `Bash` tools remain blocked until the
  tool call lands and the user approves.
