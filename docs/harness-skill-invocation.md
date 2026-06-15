# Harness Skill / Command / Prompt Invocation Mechanics

**Researched:** 2026-06-13, against live official vendor docs (Claude Code, Codex) and the Pi source at `github.com/badlogic/pi-mono` (`packages/coding-agent`).
**Why it exists:** input to an `areg` feature for "converting" imperative skills into invoke-only commands across the three harnesses this repo targets — Claude Code, Codex, and Pi — without polluting the model's ambient context. Records exactly how each harness discovers, surfaces, and gates skills/commands/prompts.
**Staleness warning:** this space moves fast (Codex deprecated custom prompts in Jan 2026; Claude Code merged commands into skills). Treat as a snapshot, not a contract. Re-verify load-bearing facts before building.

## The concept that matters

There is exactly one axis that controls context pollution: **ambient-discoverable vs explicitly-invoked.**

- **Ambient-discoverable** — the harness injects the resource's name + description into the model's system context at session start so the model can decide to use it. This is the per-resource token cost that accrues to *every* session.
- **Explicitly-invoked** — the resource is invoked by name (a human typing `/foo`, or a reference that already knows the name). Its description need not be ambient; its body loads only on invocation.

"Skill vs command vs prompt" is **not** the useful axis — Claude Code and Codex have both collapsed commands/prompts into the [Agent Skills](https://agentskills.io) standard. The useful question per harness is: *can a resource be explicitly-invocable while contributing zero ambient context, and can it be namespaced?*

## Cross-harness summary

| Property                                     | Claude Code                                                                 | Codex                                                        | Pi                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Canonical unit                               | skill (`.agents/skills` standard)                                           | skill (`.agents/skills` standard)                            | skill (`.agents/skills` standard)                                            |
| Skill/command read roots                     | `.claude/skills/`, `.claude/commands/` (does **not** scan `.agents/skills`) | `.agents/skills/` only                                       | `.agents/skills/`, `.pi/skills/`, `~/.pi/agent/skills/`, `~/.agents/skills/` |
| Skills injected ambient by default           | yes (name+desc)                                                             | yes (name+desc)                                              | yes (name+desc, XML `<available_skills>`)                                    |
| **Zero-ambient explicit-only flag**          | **`disable-model-invocation: true`**                                        | `allow_implicit_invocation: false` (in `agents/openai.yaml`) | **`disable-model-invocation: true`**                                         |
| Does that flag drop it from ambient context? | **yes**                                                                     | **no** (still ambient; only blocks implicit invoke)          | **yes**                                                                      |
| Explicit invoke form                         | `/name`, or `/ns:cmd` via `commands/` subfolders                            | `$name`                                                      | `/skill:name`                                                                |
| `:` namespacing for our artifacts            | yes (`.claude/commands/ns/cmd.md`)                                          | no                                                           | only via TS extension (not file-based)                                       |
| File-based prompt surface                    | merged into skills                                                          | deprecated, user-home only                                   | `.pi/prompts/*.md` (flat, no `:` namespacing)                                |

**The single most load-bearing fact:** Claude Code **and** Pi both honor `disable-model-invocation: true` — it removes the entry from the model's context. **Codex is the only one of the three that cannot make an explicit-only skill zero-ambient.** A command-converted skill now also gets a Pi `-skills/<name>` force-exclusion, so Pi users invoke the verified replacement extension command instead of `/skill:<name>`.

## Claude Code

Source: <https://code.claude.com/docs/en/slash-commands> (the `docs.anthropic.com` URL 301-redirects here).

- **Commands merged into skills:** *"A file at `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way."* Same ambient budget, same lazy body-load. `.claude/commands/` is **not** cheaper than a skill.
- **Invocation-control table (verbatim):**
  - default → description **always in context**.
  - `disable-model-invocation: true` → description **not in context**, you-invoke-only. *"This removes the skill from Claude's context entirely."*
  - `user-invocable: false` → description always in context, model-only.
- **Read roots:** `.claude/skills/<name>/SKILL.md` (name = directory name → `/name`), `.claude/commands/<file>.md` (name = filename). Claude Code does **not** scan `.agents/skills`; in this repo it sees skills via `.claude/skills/X → .agents/skills/X` symlinks.
- **Subfolder namespacing:** `.claude/commands/release/notes.md` → `/release:notes`. Real, but has an open flakiness bug ([anthropics/claude-code#2422](https://github.com/anthropics/claude-code/issues/2422)) in some versions. A skill *directory* under `.claude/skills/` is always flat `/name`; the only documented `:` namespacing is command subfolders and plugins.
- **Budget:** skill names always included; descriptions share ~1% of context window, shrunk for least-used first; per-entry text capped at 1,536 chars.

## Codex

Sources: <https://developers.openai.com/codex/skills>, <https://developers.openai.com/codex/custom-prompts>.

- **Custom prompts are deprecated:** *"Use skills for reusable instructions that Codex can invoke explicitly or implicitly."* Prompts lived in `~/.codex/prompts` (user-home, **not shared through the repo**). Dead end for cross-harness, repo-shared commands.
- **Skill read roots (fixed, not configurable):** `$CWD/.agents/skills` walking up to repo root, then `$HOME/.agents/skills`, `/etc/codex/skills`, bundled. **There is no `.codex/skills`, and no config key to add custom skill search paths.** `.codex/` is config-only (`~/.codex/config.toml`); its one skill knob is `[[skills.config]]` to enable/disable an existing skill (user-level).
- **Explicit-only:** `allow_implicit_invocation: false` (skill policy). When set, Codex won't *implicitly* invoke; explicit `$skill` still works — **but the description stays in context** (no token saving).
- **Namespacing:** none — skills are referenced by `name` only.
- **Consequence:** Codex is permanently pinned to `.agents/skills/` and is the only harness that pays ambient cost for explicit-only skills. Nothing on the filesystem changes this.

## Pi

Source: `github.com/badlogic/pi-mono`, `packages/coding-agent` (verified against source, not docs).

- **Honors `disable-model-invocation: true`** (`src/core/skills.ts`; `formatSkillsForSystemPrompt` in `packages/agent/src/harness/system-prompt.ts`): such skills are filtered out of the system prompt but remain invocable via `/skill:<name>`. This is the key parity with Claude Code.
- **Skills injected ambient by default** as XML `<available_skills>` (name + description + location; body loaded on demand via the `read` tool) — progressive disclosure, same shape as the other two.
- **Skill read roots** (`src/core/package-manager.ts` `addAutoDiscoveredResources`): `~/.pi/agent/skills/`, `~/.agents/skills/`, `.pi/skills/`, and `.agents/skills/` walked from cwd to git root. Also additive: `settings.skills[]`, package `skills/`, and CLI `--skill <path>`.
- **Settings (`.pi/settings.json` / `~/.pi/agent/settings.json`)** parsed in `src/core/settings-manager.ts`. Relevant keys: `skills: string[]` (override patterns and additive paths), `prompts: string[]`, `extensions: string[]`, `enableSkillCommands: boolean` (default true — registers `/skill:name`). Current local Pi package-manager behavior supports exact force-excludes with `-path` entries, so `"-skills/<name>"` hides a project-local skill discovered from `.agents/skills/<name>` / `skills/<name>`.
- **`--no-skills` / `-ns`** (`src/cli/args.ts`): global; disables all auto-discovery, leaving only CLI `--skill` paths and `additionalSkillPaths`. CLI flag only, not settable via `settings.json`.
- **`.pi/prompts/*.md` prompt templates** (`src/core/prompt-templates.ts`): loaded from `.pi/prompts/` and `~/.pi/agent/prompts/`. **Non-recursive — no subdirectory namespacing** (name = basename, so `.pi/prompts/objective-close.md` → `/objective-close`, never `/objective:close`). Symlinks supported; frontmatter `description` + `argument-hint`. **Zero ambient cost** — only expanded when a human types `/name`. Not useful for our case: flat-only and would double-surface against `/skill:name`.
- **Namespaced `/ns:cmd` in Pi** requires a hand-written TypeScript extension (`pi.registerCommand` in `.pi/extensions/*.ts`), out of scope for file-based projection.

## Implications for `areg` skill profiles

1. **Root coupling is real but manageable.** Codex and Pi both read `.agents/skills/` and it cannot be diverged by symlinks (same-path readers see the same thing). Pi can force-exclude a discovered skill with `-skills/<name>` while Codex ignores that Pi setting. Only Claude Code reads a separate root (`.claude/`).
2. **Profiles map to concrete artifacts, not desired-state config:**
   - `normal` removes managed invocation artifacts.
   - `invoke-only` adds `disable-model-invocation: true` and Codex `agents/openai.yaml`, but leaves native direct invocation available.
   - `command-backed` is the old command-conversion lifecycle: add `disable-model-invocation: true`, write `agents/openai.yaml`, and add `.pi/settings.json` `"-skills/<name>"` after verifying that a replacement Pi extension command exists.
   - `ambient-only` removes explicit-only artifacts, adds `user-invocable: false`, and reports Pi/Codex native direct-invocation disabling as not enforced.
3. **Replacement Pi commands must read backing skills directly.** A command-backed skill may be hidden from `pi.getCommands()`, so specialized and generic `/ns:cmd` extensions read `skills/<name>/SKILL.md` from the repo instead of expanding ambient `skill:<name>` registrations.
4. **Namespacing (`/ns:cmd`) is extension-owned in Pi.** Pi cannot file-namespace prompts or skills; repo-local TypeScript extensions register namespaced commands and either keep richer specialized behavior or fall back to generic backing-skill command wrappers.
5. **Codex ambient cost is unavoidable for invoke-only and command-backed skills.** The only mechanism that would make converted commands zero-ambient *and* model-invocable on Codex is a deferred index (`areg commands run <query>`), not any per-harness flag.
