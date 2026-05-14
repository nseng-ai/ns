# Initiative CLI Pushdown

## Thesis

The Initiative skills currently own both semantic judgment and deterministic repository mechanics. The next improvement is to push only the repeated, testable mechanics into hidden `initiative exec` CLI commands while keeping all Initiative meaning in the skills and human-authored Markdown.

The scoped steelthread is three commands: `initiative exec list`, `initiative exec read-initiative`, and `initiative exec tracking-gate-facts`. These commands should return stable JSON facts about Initiative records, closed markers, file presence, and git/worktree evidence for the Tracking Gate, plus `--format md` renderers for direct agent reading. Raw Initiative Markdown should be emitted by the Markdown renderer, not embedded in JSON by default. The commands must not parse or interpret Markdown prose, choose next work, decide whether progress is meaningful, infer Initiative selection from changed paths, or mutate Initiative files.

## Scope

Implement a first pass of Initiative CLI tooling that is useful to agents but narrow enough to preserve the markdown-only Initiative model.

In scope:

- Simplify the existing Initiative skill selection rules before adding CLI support: do not auto-select an Initiative from changed/touched files; when no explicit slug or path is supplied, list candidates and ask.
- Add a new `asdl-initiatives` package with an `initiative` CLI surface and hidden `exec` subgroup for agent-facing commands.
- Implement `initiative exec list` as a pure filesystem Initiative inventory: slugs, paths, open/closed state, required top-level file presence, and update counts. It should include open and closed Initiatives by default, sort by slug ascending, support `--format json` and `--format md`, and not inspect git state or return changed/touched path facts.
- Implement `initiative exec read-initiative <slug>` to read one explicit Initiative record. It should require an explicit slug, resolve only `.asdl/initiatives/<slug>/`, report file inventory, detect `closed.md`, and support both `--format json` and `--format md`. Callers that start from a path must select or derive the slug before invoking the CLI; the command itself is slug-only. JSON should return stable facts and paths by default; Markdown output should include the raw `initiative.md`, `roadmap.md`, and all update Markdown by default.
- Implement `initiative exec tracking-gate-facts <slug-or-path> --base-ref <ref>` to collect read-only git/worktree evidence used by `initiative-next`: current branch facts, working tree/index changes, committed changes from the explicit base ref to `HEAD`, selected-Initiative changed paths, other-Initiative changed paths, and non-Initiative changed paths. It should support `--format json` and a compact `--format md` renderer for agent reading. The CLI must not infer trunk or Graphite stack parent; the skill or agent chooses the base ref explicitly.
- Update the Initiative skills and canonical docs to call these commands for deterministic mechanics while retaining semantic interpretation in the skill instructions.
- Add tests for JSON contracts, Markdown renderers, slug validation, closed-marker detection, missing files, explicit missing-slug behavior, filesystem inventory edge cases, and changed-path classification for Tracking Gate facts.

## Non-Goals

- Do not implement `initiative exec create-skeleton`, update prechecks, close helpers, PR enforcement, or any mutation command in this Initiative.
- Do not parse Markdown headings, roadmap checkboxes, update prose, or closure meaning in CLI code.
- Do not decide whether repo changes are materially related to an Initiative; the CLI only reports facts for the agent to judge.
- Do not add registries, UUIDs, YAML/frontmatter, hidden attachment metadata, or a state machine.
- Do not infer Initiative ownership from branch names, objectives, PR titles, package names, or roadmap keywords.
- Do not create automatic reconciliation, auto-refresh, or hidden Initiative updates.

## Completion Criteria

- Existing Initiative skill docs no longer auto-select an Initiative from changed/touched files; omitted Initiative selection asks the user to choose from candidates instead.
- `initiative exec list --format json` returns deterministic filesystem inventory, including open and closed Initiatives sorted by slug ascending, without reading Markdown meaning or inspecting git/worktree changed paths; `--format md` renders the same inventory for direct agent reading.
- `initiative exec read-initiative <slug> --format json` handles explicit slug selection, invalid or missing slugs, closed records, and missing expected files with stable JSON facts and paths; `--format md` includes raw `initiative.md`, `roadmap.md`, and all update Markdown by default.
- `initiative exec tracking-gate-facts <slug-or-path> --base-ref <ref> --format json` returns git/worktree path evidence sufficient for `initiative-next` to apply the Tracking Gate without running ad hoc git commands, and `--format md` renders those facts compactly for direct agent reading. The command requires an explicit base ref for committed-change comparison.
- The commands live under a hidden `exec` subgroup and are covered by scenario and unit tests matching repository CLI conventions.
- Initiative skill docs are shortened where appropriate so repeated deterministic mechanics are delegated to the commands, while narrative interpretation remains in the skills.
- The canonical Initiative documentation explains which mechanics are now CLI-owned and which responsibilities remain LM/human-authored.
- Existing Objective, Branch Memory, slot, reviewer, and PR-address tests remain green.

## Assumptions and Risks

Assumptions:

- A narrow `initiative exec` surface is acceptable even though Initiative v1 began as markdown-only, because the CLI owns deterministic facts rather than Initiative meaning.
- Pure filesystem listing and explicit Initiative record reading will be reused by multiple Initiative skills often enough to justify tested code.
- `read-initiative` can be slug-only because Initiative selection remains a skill/agent responsibility; accepting paths in the CLI would duplicate selection normalization without adding deterministic fact value.
- Emitting raw Initiative Markdown through `--format md` preserves the hard boundary against Markdown parsing while reducing tool calls and avoiding JSON string extraction for prose-heavy reads.
- Changed-path facts belong only in `tracking-gate-facts`, where they serve `initiative-next`'s Tracking Gate preflight; semantic materiality and base-ref choice can remain with the agent.
- A new `asdl-initiatives` package can host standalone and plugin CLI entry points without introducing runtime coupling to objective-specific storage or Graphite stack metadata. PR 2 confirmed the package skeleton can wire the standalone/plugin entry points and a hidden empty `exec` subgroup without adding objective, Graphite, brmem, git, or Markdown-parsing runtime dependencies.

Risks:

- The CLI boundary could creep from fact collection into Markdown interpretation. Mitigation: tests and docs should assert that commands do not parse headings, checkboxes, or prose meaning.
- The initial command set could become too broad if create/update/close helpers are added before the three read-oriented commands prove useful. Mitigation: park mutation helpers explicitly.
- Removing changed/touched-file auto-selection may add one user prompt when no slug is supplied. Mitigation: `initiative exec list` should make candidate presentation cheap, and the simpler rule avoids unclear git/stack semantics.
- Skill docs could become less clear if they merely say “run the CLI” without preserving decision rules. Mitigation: keep interpretation rules in the skills and document JSON fields precisely.
- Introducing a new CLI package or plugin may add maintenance cost. Mitigation: follow existing package and scenario-test conventions and keep the first contract small. PR 2 reduced this risk by limiting the first package slice to wiring-only behavior with targeted scenario coverage and a green full repository suite.

## Open Questions

- How compact should the `--format md` renderers be for list and Tracking Gate facts without hiding important JSON fields?
- If Initiative update histories grow too large, should `read-initiative --format md` add an updates limit flag later?
- After the selection-rule simplification lands, which Initiative skill should be converted to the new CLI commands first?
