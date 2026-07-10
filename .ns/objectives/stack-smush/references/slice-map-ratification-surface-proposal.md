# Slice-map ratification surface proposal

Task artifact for the **Slice-map ratification surface proposal** roadmap row of the
`stack-smush` Objective. This is a **proposal for a later live decision**, not a
settled spec: where a real choice exists it is written as options plus a
recommendation, and the final surface choice stays with the user. It proposes (1) how
the human *sees* a packaged stack's Slice Map — cut points, decision/span
classification, per-cut rationale — and (2) how the human *reshapes* it
asynchronously, with the reshape flowing back into a re-run of smush rather than into
hand-edited state.

Grounding: the resolved Packaging semantics and Packaging mechanics rows in
[`../roadmap.md`](../roadmap.md), the frontier grilling resolutions
(`../updates/20260710T111652Z-frontier-grilling-session-resolutions.md`), the
packaging mechanics resolution
(`../updates/20260710T122903Z-packaging-mechanics-design-resolved.md`), the observed
mechanics in
[`graphite-slicing-mechanics-survey.md`](graphite-slicing-mechanics-survey.md), the
canonical Slice Map vocabulary in the root `CONTEXT.md`, and the real candidate
surfaces surveyed below from repo source (paths cited inline are relative to the repo
root).

## Settled ground this proposal builds on (not reopened)

- **The Slice Map is derived, never stored.** The packaged stack itself — branch
  structure, classification-bearing branch names, commit-message rationale — is the
  only durable carrier. Any surface must re-derive the map on every render; no hidden
  state, no ad-hoc map files, no approval-gate artifact (root `CONTEXT.md`, *Slice
  Map*).
- **No structured markers or trailers.** Narrative prose is the signal in commit
  runs; in the *packaged* stack, classification lives in branch names and rationale
  lives in commit messages (decision boundary commits keep their why-paragraph; a
  squashed span commit carries rationale plus a narration digest).
- **Smush is local-only and never touches PRs.** PR labels, bodies, and anything
  post-submission are outside the skill. It reports orphaned close-candidate PRs
  loudly rather than closing them.
- **Slicing authority is fully agent; ratification is asynchronous and
  by-reshaping.** The human does not approve cuts before they happen; they inspect
  the packaged result whenever they choose and reshape on disagreement.
- **Repackaging is the same operation re-run.** Reshape never means hand-editing
  packaging state; it means invoking packaging again over the existing stack.
- **Classification vocabulary (Decision PR / Span PR) is packaging's.** Surfaces
  render packaging's judgment; they do not own or extend the vocabulary.

## What "ratification" concretely is

Two verbs, deliberately asymmetric:

- **See.** Render the Slice Map from the stack: the ordered slices bottom-up, each
  slice's classification, its cut point (boundary SHA), the commits it contains, and
  the rationale for why the cut and the classification are what they are. Because the
  map is derived, seeing is always available, always current, and needs no packaging
  session to still be alive — this is what makes ratification *asynchronous*.
- **Reshape.** Disagree with a cut, a classification, or a span's size, and have that
  disagreement flow back into a smush re-run. Silence is consent: a map the human
  never reshapes is ratified by the act of submitting and landing the stack.

Ratification is therefore not a gate and produces no artifact. There is nothing to
"mark approved" — an approval record would be exactly the durable Slice Map state the
design forbids.

## The derivation contract

Whatever surface wins, it derives the map from the same inputs the same way. This
contract is the load-bearing part of the proposal; the surfaces are skins over it.

| Map element                   | Derived from                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack topology (slice order)  | `ns slot gt exec stack-branches --format json` (branches, edges, trunk, current) or `stack-map-branches` for graph + slots; never parse `gt log` |
| Cut points                    | `git rev-parse <branch>` per slice branch — the boundary SHA is the branch pointer                                                               |
| Slice membership              | `git log <parent-branch>..<branch>` per slice (subjects + bodies)                                                                                |
| Classification                | The slice's branch name (classification-bearing by packaging-mechanics resolution)                                                               |
| Per-cut / per-slice rationale | Commit messages: the decision boundary commit's why-paragraph; the squashed span commit's rationale + narration digest                           |
| Health/warnings               | `stack-map-branches` warnings and `needsRestack`; orphaned close-candidate PRs are re-reported by smush itself on repackaging                    |

Notes on the contract:

- The read-side commands exist today: `ns slot gt exec stack-branches` emits
  `{branches, trunk, current, scope, edges, warnings}`
  (`ts/packages/capabilities/slots/src/lifecycle/operations/gt/exec/stack-branches.ts`)
  and `stack-map-branches` adds the branch graph, slot assignments, restack flags,
  and metadata warnings
  (`.../gt/exec/stack-map-branches.ts`). Both are hidden `gt exec` commands built for
  exactly this skill/agent read-side use, reading the Graphite metadata store rather
  than parsing `gt log` — matching the packaging-mechanics rule.
- **Classification parsing needs the branch names to be legible.** "Classification-
  bearing branch names" is settled, but the exact shape (for example
  `<run>--d1-<slug>` vs. `<run>--s2-<slug>`) is not yet fixed anywhere; it belongs to
  the **Smush skill authoring** row. This proposal's only requirement on that row:
  whatever naming shape it picks must be mechanically parseable (classification and
  slice order recoverable from the name alone), because every deterministic surface
  option below depends on it. An LM-rendered surface can tolerate sloppier names;
  a deterministic one cannot.
- Rationale extraction is inherently prose-reading. Deterministic surfaces can show
  the raw boundary/squash commit message verbatim (correct and cheap); only an
  LM-driven surface can summarize across slices.

## The real candidate surfaces today

Surveyed from source so the options are grounded, not imagined:

1. **Raw `git`/`gt` in the terminal.** The packaged stack is self-describing by
   design, so `gt log` plus `git log <parent>..<branch>` already *is* a Slice Map
   viewer — zero code, but the human assembles the picture by hand and nothing rolls
   rationale up per cut.
2. **The smush skill's own transcript.** The resolved mechanics make smush
   propose-before-mutation, so a Slice Map rendering already exists once, in the
   packaging session's proposal readback. But a transcript is not a surface: it is
   not re-derivable, goes stale the moment the stack changes, and is unavailable to a
   human arriving later — precisely the asynchronous case ratification must serve.
3. **The `nscc` stack map** (`ts/packages/hosts/nscc`) — the repo's actual stack
   visualization and the thing the roadmap row's "ccc stack map or similar" gestures
   at. A full-screen OpenTUI tab (`src/stack-map-tab.ts`, id `stack-map`) that loads
   its model from `ns slot gt exec stack-map-branches --format json` plus
   `cmux tree --json --all` (`src/stack-map-model-loader.ts`) and renders a
   branch-topology table (TOPO / BRANCH / GT / CMUX columns), selection, filtering,
   and cmux-tab activation (`src/stack-map.ts`). It renders **branch-graph facts
   only** — no commit messages, no per-branch commit lists — so classification could
   ride today's model (branch names are already there) but rationale would need a new
   read-side input.
4. **CCC's cmux surfaces** (`ts/packages/capabilities/ccc/src/cmux/`). The dispatch
   surfaces are mapped in
   [`ccc-disjoint-scope-dispatch-proposal.md`](ccc-disjoint-scope-dispatch-proposal.md);
   the *rendering* surfaces are the sidebar summaries
   (`sidebar.ts`, `objective-sidebar.ts`: LM-written session / branch-state /
   Objective summaries pushed into the cmux sidebar) and the worktree-status
   renderer. These are ambient status — glanceable one-liners — not an inspection
   surface a human would ratify cuts from.
5. **A new read-side push-down.** Nothing today emits "the Slice Map as JSON". The
   Parked roadmap section already reserves `ns slot gt exec` as the home for
   packaging push-downs, all gated on real-run evidence; a read-side
   `slice-map` command would be a new, smaller entry in that same parked family.

## Decision 1 — the viewing surface

- **Option A — a map mode of the smush skill (LM-rendered, on demand).** Invoking
  the skill in a read-only mode (or a sibling "smush map" prompt) re-derives the map
  per the contract and renders it as terminal/transcript markdown: slices bottom-up,
  classification, boundary SHA, commit subjects, rationale excerpts, warnings. Zero
  new TypeScript, consistent with the wholly LM-driven v1 posture, and the renderer
  is the same mind that will execute a reshape — the map and the reshape
  conversation live in one place. Costs: an LM invocation per render (latency,
  tokens), no ambient presence, quality depends on the skill's prompt.
- **Option B — extend the `nscc` stack map.** Add a classification column (parsed
  from branch names) and a selected-slice detail pane showing the boundary/squash
  commit message (rationale verbatim) and the slice's commit subjects. Deterministic,
  instant, ambient — the human already has this TUI open for slot/cmux work, and
  ratification becomes part of normal stack situational awareness. Costs: real
  TypeScript work in a host package plus a rationale read-side (either per-slice
  `git log` calls from nscc or the Option C command below); hard dependency on a
  mechanically parseable branch-name shape; and it is a *viewer* only — reshaping
  still routes to the skill, so the surface can at most hint the reshape command.
- **Option C — a `ns slot gt exec slice-map` read-side push-down feeding A and B.**
  One hidden command emitting the derived map as JSON (slices in order, each with
  name, classification, boundary SHA, parent, commit subjects, boundary/squash
  message body, warnings). Both the skill and any TUI/renderer consume it, so
  derivation logic exists exactly once. Costs: new CLI, which the v1 resolution
  deliberately avoided; classification parsing lands in tested TypeScript, which
  hard-freezes the branch-name shape earlier than the skill row may want.

**Recommendation: Option A for v1, with B and C named as graduation candidates gated
on real-run evidence — the same posture every other smush mechanic already follows.**
The first real packaged stack will reveal whether map rendering is a repeated
mechanical operation (evidence for C, then cheaply B on top of it) or an occasional
conversational one (A suffices). Choosing B or C now would freeze the branch-name
grammar before the skill-authoring row has exercised it once. Surface 4 (sidebar) is
rejected as the ratification surface — ambient one-liners cannot carry per-cut
rationale — though a one-line "packaged: 2 decisions, 3 spans" digest in the
branch-state sidebar summary is a cheap later garnish. Surface 1 (raw git/gt) remains
the always-available floor and is what Option A degrades to when no agent is at hand.

## Decision 2 — what the map shows

Proposed content, per slice, bottom-up (trunk-adjacent first, matching review order):

- Slice branch name and classification (Decision / Span, as packaging judged it).
- Cut point: the boundary SHA and its parent branch.
- The commits inside the slice: count plus subjects. For a squashed span this is one
  commit whose message already embeds the narration digest of what was collapsed —
  the surface shows it rather than reconstructing pre-squash history.
- Rationale: the decision boundary commit's why-paragraph, or the span squash
  message's rationale, verbatim or lightly excerpted. Per-cut rationale is *why the
  boundary is here and why the slice is classified as it is* — packaging wrote it
  into exactly these messages so the surface never has to invent it.
- Health: `needsRestack` / metadata warnings from the read-side commands, and — on a
  repackaged stack — the orphaned close-candidate PR report smush emitted, repeated,
  since the human handling those PRs is part of ratifying the reshape.

Explicitly not shown: any approval state (none exists), PR metadata (post-submit
concern outside the skill; a later surface iteration may hyperlink PRs the way the
worktree-status renderer already does, but the map must render identically before and
after submission), and diffs (the map is about structure and rationale; `gt`/GitHub
already show diffs).

## Decision 3 — how a reshape flows back

- **Option A — prose re-invocation of smush.** The human states the disagreement in
  packaging's vocabulary, referencing the rendered map: "move the cut below
  `<sha>`", "that span is hiding a decision about X — promote it", "merge spans 2
  and 3". Smush re-runs as the same operation: backup ref, propose, fold what needs
  folding (`gt fold` without `--close`, per the mechanics resolution), re-slice,
  re-validate boundaries, report orphaned PR candidates. The reshape request is
  conversational input, not state; nothing survives it but the reshaped stack.
- **Option B — interactive reshaping in a TUI.** Keybindings on the stack map to
  drag cuts and toggle classifications, executing mutations directly. Rejected for
  v1: it would move stack mutation out of the skill's propose-first, backup-ref,
  boundary-validation discipline into a host UI, duplicate the repackaging logic, and
  bolt a mutation surface onto a viewer — all before the mechanics have been proven
  once on real work. At most, a later TUI iteration composes with Option A by
  *drafting* the prose reshape request for the selected slice.
- **Option C — an editable map file smush consumes.** The human edits a rendered map
  document; smush diffs it against the derived map and applies the delta. Rejected:
  a human-authored map file is durable Slice-Map-as-state in all but name — it
  invites drift from the stack it claims to describe, and hand-editing packaging
  state is exactly what the settled design rules out. (Smush's own transient
  step-to-step JSON is process input and stays internal to a run; it is not a
  ratification channel.)

**Recommendation: Option A.** It is the only option that already exists once the
skill exists, and it keeps a single writer — packaging — for every mutation of a
packaged stack.

Asynchrony falls out naturally: because the map is re-derived on every render, the
human can ratify hours or days after packaging ran, from any session; the reshape
conversation starts by rendering the *current* map, so a stale memory of the stack
can never be the basis of a mutation. Two cost asymmetries the surface should state
when relevant, so the human reshapes with open eyes (both owned by the
**Repackaging under change** prototype row for observation): pre-submit reshapes are
cheap (renames and re-slices are local metadata); post-submit reshapes can break
branch↔PR association on rename and orphan PRs on fold — smush reports, never
mutates PRs. Re-slicing a previously squashed span is the known-hard case and an
accepted cost of the squash decision.

## What the later live decision must settle

- The viewing surface (Decision 1 — recommend the skill's map mode for v1; nscc
  column/pane and a `slice-map` read-side push-down as evidence-gated graduations).
- The map's content set (Decision 2 — recommend the slice/cut/rationale/health list
  above; in particular whether boundary-greenness results are worth re-running or
  only worth reporting from the packaging run's transcript).
- The reshape channel (Decision 3 — recommend prose re-invocation only).
- Whether the branch-name grammar chosen by the **Smush skill authoring** row is
  mechanically parseable enough to unlock the deterministic surfaces — feed this
  requirement into that row.

## Out of scope here

- Implementing anything: no skill text, no nscc/CCC/CLI changes, no read-side
  command. This row produces the proposal only.
- PR labels, PR bodies, and post-submit review-policy surfaces (resolved
  Review-policy row; outside the local-only skill).
- Observing post-submit reshape fate (PRs, review threads, CI) — owned by the
  **Repackaging under change** prototype row.
- The branch-name grammar itself — owned by **Smush skill authoring**; this proposal
  only constrains it to be parseable.
