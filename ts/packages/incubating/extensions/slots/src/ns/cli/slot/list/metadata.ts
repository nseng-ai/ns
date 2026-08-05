import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: "List worktree pool slots derived from Git worktree state.",
		aliases: ["ls"],
	};
}
