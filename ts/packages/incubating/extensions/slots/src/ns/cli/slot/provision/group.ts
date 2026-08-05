import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr/app";

export function group(): ClinkrGroupDefinition {
	return {
		description: "Copy declared gitignored files between the per-repo store and slot worktrees.",
	};
}
