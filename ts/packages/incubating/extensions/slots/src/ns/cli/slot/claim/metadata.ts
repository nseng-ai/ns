import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: "Move a local branch into the current managed slot or lowest available slot.",
	};
}
