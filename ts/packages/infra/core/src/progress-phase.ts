// Typed phase events for long-running, multi-step commands (e.g. `flow submit` / `flow cp`).
//
// These drive ORDERED SEQUENCING across process layers: a lower layer (graphite submit, the
// checkpoint workflow) emits `phase-started`/`phase-failed` keyed by a stable `phaseKey`, and a
// presentation driver switches on that key to advance a phase list. `label`/`detail` are purely
// presentational — never load-bearing for sequencing.
//
// Pure types: no runtime, no display dependency. Lives in `@sdl/core` because the emitting layers
// already depend on core; the display driver (clinkr-backed) lives in `flow`, keeping clinkr free of
// any domain dependency and never imported by graphite.

/** A single progress event. `phaseKey` is the stable sequencing identity; text fields are cosmetic. */
export type ProgressPhaseEvent =
	| { type: "phase-started"; phaseKey: string; label?: string }
	| { type: "phase-progress"; phaseKey: string; label: string }
	| { type: "phase-done"; phaseKey: string; detail?: string }
	| { type: "phase-failed"; phaseKey: string; detail: string };

/** Listener a lower layer invokes as it moves through its phases. */
export type ProgressPhaseListener = (event: ProgressPhaseEvent) => void;
