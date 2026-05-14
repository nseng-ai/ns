# Initiative CLI Pushdown

## Thesis

The Initiative skills currently own both semantic judgment and deterministic repository mechanics. The next improvement is to push only the repeated, testable mechanics into hidden `initiative exec` CLI commands while keeping all Initiative meaning in the skills and human-authored Markdown.

The scoped steelthread is two commands: `initiative exec list` and `initiative exec read-initiative`. These commands return stable JSON facts about Initiative records, closed markers, file presence, and update inventory, plus `--format md` renderers for direct agent reading. Raw Initiative Markdown is emitted by the Markdown renderer, not embedded in JSON by default. The commands must not parse or interpret Markdown prose, choose next work, decide whether progress is meaningful, infer Initiative selection from changed paths, or mutate Initiative files. A third originally-scoped command, `initiative exec tracking-gate-facts`, was explicitly descoped from this Initiative on 2026-05-14 and is no longer planned here; if Tracking Gate evidence becomes worth deterministic CLI support, it will be picked up in a separate Initiative.

## Scope

Implement a first pass of Initiative CLI tooling that is useful to agents but narrow enough to preserve the markdown-only Initiative model.

In scope:

- Simplify the existing Initiative skill selection rules before adding CLI support: do not auto-select an Initiative from changed/touched files; when no explicit slug or path is supplied, list candidates and ask.
- Add a new `asdl-initiatives` package with an `initiative` CLI surface and hidden `exec` subgroup for agent-facing commands.
- Implement `initiative exec list` as a pure filesystem Initiative inventory: slugs, paths, open/closed state, required top-level file presence, and update counts. It should include open and closed Initiatives by default, sort by slug ascending, support `--format json` and `--format md`, and not inspect git state or return changed/touched path facts.
- Implement `initiative exec read-initiative <slug>` to read one explicit Initiative record. It should require an explicit slug, resolve only `.asdl/initiatives/<slug>/`, report file inventory, detect `closed.md`, and support both `--format json` and `--format md`. Callers that start from a path must select or derive the slug before invoking the CLI; the command itself is slug-only. JSON should return stable facts and paths by default; Markdown output should include the raw `initiative.md`, `roadmap.md`, and all update Markdown by default.
- Update the Initiative skills and canonical docs to call these commands for deterministic mechanics while retaining semantic interpretation in the skill instructions.
- Add tests for JSON contracts, Markdown renderers, slug validation, closed-marker detection, missing files, explicit missing-slug behavior, and filesystem inventory edge cases for the two shipped commands.

Out of scope (descoped on 2026-05-14):

- Do not implement `initiative exec tracking-gate-facts` in this Initiative. Tracking Gate evidence collection remains an LM/skill responsibility, and any deterministic CLI support for it is deferred to a future Initiative.

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
- The two shipped commands (`initiative exec list` and `initiative exec read-initiative`) live under a hidden `exec` subgroup and are covered by scenario and unit tests matching repository CLI conventions.
- Initiative skill docs are shortened where appropriate so repeated deterministic mechanics are delegated to the commands, while narrative interpretation remains in the skills.
- The canonical Initiative documentation explains which mechanics are now CLI-owned and which responsibilities remain LM/human-authored.
- Existing Objective, Branch Memory, slot, reviewer, and PR-address tests remain green.

## Assumptions and Risks

Assumptions:

- A narrow `initiative exec` surface is acceptable even though Initiative v1 began as markdown-only, because the CLI owns deterministic facts rather than Initiative meaning.
- Pure filesystem listing and explicit Initiative record reading will be reused by multiple Initiative skills often enough to justify tested code.
- `read-initiative` can be slug-only because Initiative selection remains a skill/agent responsibility; accepting paths in the CLI would duplicate selection normalization without adding deterministic fact value.
- Emitting raw Initiative Markdown through `--format md` preserves the hard boundary against Markdown parsing while reducing tool calls and avoiding JSON string extraction for prose-heavy reads.
- Revised on 2026-05-14: changed-path facts and Tracking Gate evidence stay entirely with the skill/agent for now. The earlier assumption — that `tracking-gate-facts` was the right home for deterministic changed-path classification while semantic materiality stayed with the agent — was set aside when PR 5 was descoped from this Initiative. Future work may revisit it as a separate Initiative.
- A new `asdl-initiatives` package can host standalone and plugin CLI entry points without introducing runtime coupling to objective-specific storage or Graphite stack metadata. PR 2 confirmed the package skeleton can wire the standalone/plugin entry points and a hidden empty `exec` subgroup without adding objective, Graphite, brmem, git, or Markdown-parsing runtime dependencies.

Risks:

- The CLI boundary could creep from fact collection into Markdown interpretation. Mitigation: tests and docs should assert that commands do not parse headings, checkboxes, or prose meaning.
- The initial command set could become too broad if create/update/close helpers are added before the three read-oriented commands prove useful. Mitigation: park mutation helpers explicitly.
- Removing changed/touched-file auto-selection may add one user prompt when no slug is supplied. Mitigation: `initiative exec list` should make candidate presentation cheap, and the simpler rule avoids unclear git/stack semantics.
- Skill docs could become less clear if they merely say “run the CLI” without preserving decision rules. Mitigation: keep interpretation rules in the skills and document JSON fields precisely.
- Introducing a new CLI package or plugin may add maintenance cost. Mitigation: follow existing package and scenario-test conventions and keep the first contract small. PR 2 reduced this risk by limiting the first package slice to wiring-only behavior with targeted scenario coverage and a green full repository suite.
- Resolved-by-descope on 2026-05-14: PR 5 (`initiative exec tracking-gate-facts`) was removed from this Initiative's scope. The mechanical trigger was a Graphite stack reshape that dropped the `add-tracking-gate-facts-and-git-path-change-suppor` branch from the `validate-initiative-steelthread` lineage, leaving the downstream skill/doc delegation cherry-pick (`64977cb1`) and the PR 468 scenario tests (`598105c8`) referencing a missing command and a missing `GitPathChange` git type. Rather than restoring the dropped work, this Initiative now ships only `initiative exec list` and `initiative exec read-initiative`; the affected skill/doc lines and the `tracking-gate-facts`-coupled scenario tests on this branch need to be revised or removed as a follow-up before the Initiative can be considered done. The two 2026-05-14 updates that previously claimed PR 5 done (`skill-and-doc-audit-landed` and `steelthread-validated`) are preserved for history but are superseded by `updates/2026-05-14T093556Z-tracking-gate-facts-descoped.md`.

## Open Questions

- If Initiative update histories grow too large, should `read-initiative --format md` add an updates limit flag later?
- Should a future Initiative pick up deterministic Tracking Gate evidence collection as its own scope, now that this Initiative has descoped `initiative exec tracking-gate-facts`?
- Resolved on 2026-05-14: the skill/doc references to `initiative exec tracking-gate-facts` and the coupled scenario tests were revised in-place on `validate-initiative-steelthread` rather than carried as a separate follow-up PR.
