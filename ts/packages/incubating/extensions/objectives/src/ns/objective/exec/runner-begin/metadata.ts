import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Check preconditions and emit step facts plus the subagent prompt for one decomposed Objective Runner step (ADR 0024).",
	};
}
