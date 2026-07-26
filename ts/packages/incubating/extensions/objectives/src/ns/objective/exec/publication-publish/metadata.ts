import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return {
		description:
			"Publish one verified parent checkpoint to its bound branch and best-effort update the existing pull request.",
	};
}
