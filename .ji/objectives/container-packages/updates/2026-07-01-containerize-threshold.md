# Containerize threshold: four or more subpackages

User decision while reviewing the projected target topology: a package
containerizes only when its proposed **end-state** split yields **four or
more** subpackages; three or fewer means the package stays a **standalone
package** for now (recorded as keep-flat with the threshold as rationale,
revisitable later).

Counting rule: the threshold judges the final state, not a mid-conversion
declaration. A core-style subpackage created to claim loose root files
counts toward the four; the transitional remainder does not. Borderline
counts are resolved at inventory review, not by the runner.

Pilot clarification (user-confirmed): `@sdl/core` containerizes — its end
state is expected to hold several subpackages, clearing the threshold. The
current PR #2677 declaration of only `time` + remainder is the first step
of core's incremental conversion, not a threshold violation; no pilot
exemption is needed. The concrete end-state split for core is proposed at
inventory review (an Open Question records this).

Effect on the projection: containers drop from ~12–15 to roughly 4–6
(`@sdl/core`, `flow` ~5 units, `hosts/pi` ~4, `slot` 3–4 borderline),
subpackages from ~35–45 to roughly 15–20, and conversion PRs shrink
accordingly (total Objective PR count on the order of 8–11 instead of
15–25). Most mid-size packages (`objective`, `address`, `handoff`, `ccc`,
`aretro`, `branch-context`, `brmem`, `areg`, `roaster`) fall at 2–3 units
and stay standalone under this rule.

Terminology signal: the user said "standalone package" for the keep-flat
end state — noted as the front-runner for the open naming question, to be
canonized in the vocabulary slice, not silently adopted into CONTEXT.md.
