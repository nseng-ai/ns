import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Check one Objective record, or sweep all record edges with --all." };
}
