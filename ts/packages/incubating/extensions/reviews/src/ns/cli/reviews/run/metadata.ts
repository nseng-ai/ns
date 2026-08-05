import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		summary: "Run a configured Reviews review over the current diff.",
		description: `Run a configured Reviews review over the current diff.

This ns command adapts ns execution context to Reviews gateway-injected runtime, delegates review execution through the shared Reviews operation wrapper, writes the Reviews Branch Memory review log, and preserves review-run failure semantics. Discovery and group help read only manifest metadata; selected execution may run git, model, and Branch Memory operations.`,
	};
}
