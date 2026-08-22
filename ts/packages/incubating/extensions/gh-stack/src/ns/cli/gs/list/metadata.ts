import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"List active stacks from the official GitHub gh-stack provider in the current repository.",
	};
}
