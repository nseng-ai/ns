# CLI Pushdown Scope Decisions

## Summary

A grill session narrowed the Initiative CLI pushdown into a short-stack plan with explicit command boundaries.

Key decisions:

- Ship the CLI in a new `asdl-initiatives` package with a standalone `initiative` CLI and plugin wiring.
- Make `initiative exec list` a pure filesystem inventory command: no git inspection, no changed/touched path facts, and no selection hint.
- Include open and closed Initiatives in `list` by default, sorted by slug ascending.
- Rename the record-reading command from `context` to `read-initiative`.
- Require `read-initiative` callers to pass an explicit slug or path; missing selection should be a stable error.
- Support both `--format json` and `--format md` in the initial steelthread.
- Keep JSON outputs focused on stable facts, paths, and presence information.
- Emit raw Initiative Markdown through `read-initiative --format md` by default, not embedded in JSON by default.
- Include all update files in `read-initiative --format md` for now; add a limit later only if histories become too large.
- Require `tracking-gate-facts` callers to pass an explicit `--base-ref <ref>`; the CLI must not infer trunk or Graphite stack parent.
- Keep base-ref choice in `initiative-next`: use user or harness input when obvious, use repo/Graphite context for stacked work when appropriate, otherwise use trunk, and ask when uncertain.
- Deliver the work as a short stack: skill selection simplification, package skeleton, `list`, `read-initiative`, `tracking-gate-facts` plus `initiative-next` usage.

## Initiative Impact

The roadmap now starts with simplifying existing Initiative skill selection before adding CLI support. The first behavior change removes auto-selection from changed/touched Initiative files; when no explicit slug or path is supplied, skills should list candidates and ask the user to choose.

The CLI plan now has clearer responsibilities:

- `list` inventories repository Initiative records and stays independent of git state.
- `read-initiative` reads exactly one explicit Initiative and uses Markdown output for raw Initiative prose.
- `tracking-gate-facts` reports path-level git/worktree evidence from an explicit base ref while leaving materiality judgment and base-ref choice to the skill/agent.

This preserves the no-Markdown-parsing boundary while reducing mechanical tool work for agents.

## Follow-Ups

- Define compact Markdown renderer shapes for `list` and `tracking-gate-facts` without hiding important JSON fields.
- Add an updates limit flag later if `read-initiative --format md` output becomes too large.
- When simplifying `initiative-next`, write concise base-ref selection guidance instead of embedding Graphite logic in the CLI.
