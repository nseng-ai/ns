# SDL CLI Theme Extraction

## Thesis

SDL's house-style CLI presentation should live in a dedicated SDL CLI theme package instead of being baked into `@sdl/clinkr`. Clinkr should remain the generic command/runtime substrate: command definition, IO, caps, exit envelopes, confirmations, raw command support, and stream mechanics. The house visual language — palette, glyphs, result blocks, status lines, table/layout primitives, and SDL-specific presentation grammar — should move to a new house-style CLI theme package and then become the place where follow-on consolidation decisions are made.

This Objective starts with the package boundary change, then deliberately reassesses the duplication findings one by one instead of folding unrelated redesign into the extraction. The goal is a cleaner seam first, then evidence-based consolidation of outcome mapping, warnings, caps usage, navigation footer rendering, table/Markdown rendering, and status-to-intent helpers.

## Scope

- Create the new SDL house-style CLI theme package and move the existing `@sdl/clinkr/theme` implementation, exports, and tests into it with minimal behavioral change.
- Rewire migrated CLI consumers from `@sdl/clinkr/theme` to the new package while keeping machine output, JSON/Markdown contracts, and command behavior stable.
- Preserve Clinkr's generic responsibilities: caps detection/resolution, IO seams, command framework, exit envelopes, confirmations, raw support, and generic stream sink mechanics unless a later assessment finds a better seam.
- Keep `@sdl/clinkr/stream` in Clinkr unless/until evidence shows the stream display grammar itself is SDL-house-style rather than generic terminal mechanics.
- After extraction, assess each identified consolidation candidate on its own merits:
  - outcome/result discriminator to result-block mapping;
  - success-with-warnings rendering;
  - caps-resolution helper placement;
  - Slot navigation footer migration and deletion of the legacy footer;
  - `renderTable` versus `renderTextTable` and Markdown table composition;
  - status-to-intent mapping helpers.
- Update package/context documentation as needed so future agents understand that Clinkr is generic substrate and the new theme package owns SDL house style.

## Non-Goals

- Redesigning the CLI house style itself. The current signed-off house style remains the starting point.
- Combining the package extraction with broad outcome-mapper, table, or navigation redesign in the same first slice.
- Moving domain-specific renderers such as Flow git transcript mining into the theme package unless repeated cross-capability evidence proves a generic interface.
- Moving capability-domain decisions, exit-code policy, or command-specific guardrail classification into a visual theme package.
- Making Clinkr depend on SDL capability packages or SDL domain vocabulary.
- Styling hidden `exec`/agent-only payload surfaces merely because the theme package exists.

## Completion Criteria

- A dedicated SDL CLI theme package exists and owns the former `@sdl/clinkr/theme` primitives and tests.
- `@sdl/clinkr` no longer exports or owns the SDL house-style theme subpath; Clinkr retains only generic command/runtime/terminal substrate responsibilities.
- Existing human CLI output covered by migrated tests remains behaviorally stable except for intentional import/package names.
- All current `@sdl/clinkr/theme` consumers are rewired to the new package or explicitly deferred with rationale.
- Import-boundary tests or equivalent checks enforce the intended dependency direction: generic Clinkr must not import the SDL theme package, and the theme package may depend only on neutral substrate.
- Each consolidation candidate listed in Scope has been assessed and either implemented, parked with rationale, or converted into a follow-on Objective/slice.
- Package/context documentation records the final boundary and any intentionally retained overlap such as caps or stream mechanics.

## Assumptions and Risks

**Assumptions**

- The current `@sdl/clinkr/theme` code is already the right implementation seed; the problem is package ownership and conceptual boundary, not renderer quality.
- The new theme package can depend on Clinkr for `Caps`/render-capability types without making Clinkr depend back on SDL-specific presentation.
- A mechanical extraction first will reduce risk and make later consolidation assessments clearer.
- The CLI UX north-star Objective remains the source of the signed-off house style; this Objective owns package placement and consolidation follow-through.

**Risks**

- A broad extraction could accidentally move generic terminal mechanics, especially caps or stream sink code, into an SDL-specific package and make Clinkr less reusable.
- A theme package can become a dumping ground for command-domain policy if outcome classification and exit-code decisions are promoted too aggressively.
- `@sdl/core/text-table` and `@sdl/clinkr/theme/table` may appear redundant but serve different historical consumers; consolidating them without understanding multiline, width, ANSI, and Markdown requirements could regress list surfaces.
- Rewiring many imports can produce noisy diffs; the first slice should stay mostly mechanical and heavily test-backed.
- This Objective overlaps with `cli-ux-north-star`; coordination is needed so UX rollout tracking and package-boundary cleanup do not contradict each other.

## Open Questions

- Final package name: `@sdl/sdl-cli-theme`, `@sdl/cli-theme`, or another name? The working name for this Objective is the user-requested SDL CLI theme package.
- Should the new theme package depend directly on `@sdl/clinkr` for `Caps`, or should a smaller shared render-capability type move lower?
- Should `@sdl/clinkr/stream` remain in Clinkr permanently, or should any SDL-specific streaming presentation move later?
- Which consolidation candidates belong in the new theme package versus Flow/Slot-local helpers or a different CLI presentation utility layer?
