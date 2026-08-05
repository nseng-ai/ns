import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return {
		description: "Check out a branch into an available pool slot worktree.",
		aliases: ["co"],
	};
}
