/**
 * Public surface for the `stack-view` module — the plausible promotion boundary
 * for a future `@ns/stackview` capability. Exposes the presentation model and
 * status derivation (types.ts), the stack loader (data.ts), and the plain-text
 * snapshot / summary-prompt renderers (render.ts). Interactive overlay internals
 * (overlay-model, overlay-ui), GraphQL, and objectives helpers are deliberately
 * kept off this surface; import them from their own modules when needed.
 */
export {
	deriveStatus,
	type StackViewCheckBucket,
	type StackViewCheckEntry,
	type StackViewModel,
	type StackViewPr,
	type StackViewPrChecks,
	type StackViewPrStatus,
	type StackViewPrThreads,
	type StackViewStatusInput,
	type StackViewThreadDetail,
} from "./types.ts";

export { loadStackView, type LoadStackViewParams, type LoadStackViewResult } from "./data.ts";

export { renderPlainSnapshot, buildSummaryPrompt } from "./render.ts";
