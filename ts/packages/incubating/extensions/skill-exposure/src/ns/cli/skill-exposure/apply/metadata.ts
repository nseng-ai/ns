import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		summary: "Apply one exposure policy to explicit skill paths.",
		description:
			"Resolve and preflight the complete batch before writing. Managed deletions require --yes outside an interactive host.",
	};
}
