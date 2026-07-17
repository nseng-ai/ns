# Roadmap

## Work

- [ ] **Session 1: Objective mechanics baseline** — run `grill-with-docs` over `CONTEXT.md`, `docs/objective-system.md`, and the Objective skills to confirm the core vocabulary around Objective records, Semantic Updates, Tracking Gates, Objective Updates, Objective Close, and Closure Markers.
  - Evidence target: `CONTEXT.md` changes if terminology shifts, otherwise a Semantic Update explaining that the existing Objective vocabulary held.
- [ ] **Session 2: Branch Memory and handoff artifacts** — run `grill-with-docs` over Branch Memory and branch-handoff docs to clarify Branch Memory, Entry, Entry Key, Namespace, branch-scoped artifacts, handoffs, and their relationship to Objectives and committed documentation.
  - Evidence target: `CONTEXT.md` additions for stable domain terms and any ADR only if storage/placement decisions meet the ADR threshold.
- [ ] **Session 3: Slots and Pi session movement** — run `grill-with-docs` over `asdl-slots` docs and Pi cwd/session notes to clarify Slot, managed worktree, pool, assignment, availability, Pi session cwd, and fresh-session movement between worktrees.
  - Evidence target: `CONTEXT.md` terms or package/Pi doc edits that make the session/worktree boundary unambiguous.
- [ ] **Session 4: Skill-invoked CLI boundary** — run `grill-with-docs` over skill docs, Objective CLI docs, brmem exec commands, pr-address, reviewer, and repo CLI conventions to clarify when behavior belongs in a skill versus a hidden `exec` command versus a human-facing CLI.
  - Evidence target: domain language for deterministic mechanics vs LM/human semantic judgment, plus follow-on Objective candidates if implementation boundaries need work.
- [ ] **Session 5: Review and GitHub feedback workflows** — run `grill-with-docs` over reviewer, pr-address, and GitHub conformance docs to clarify review definitions, harnesses, findings, feedback, gateways, live fixtures, and conformance boundaries.
  - Evidence target: `CONTEXT.md` additions or a parked/split decision if the review and GitHub fixture concepts need separate sessions.
- [ ] **Session 6: Synthesis and governance** — run `grill-with-docs` across the accumulated decisions to define placement rules for `CONTEXT.md`, ADRs, Objectives, Branch Memory, skill docs, package docs, PR comments, and follow-on Objectives.
  - Evidence target: final `CONTEXT.md`/ADR/doc updates plus a Semantic Update recording any remaining open questions or follow-on Objectives.

## Parked

_None._
