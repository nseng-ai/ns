import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr/app";

export function metadata(): ClinkrCommandMetadata {
	return { description: "Fill missing provisioned files in all managed slots from the store." };
}
