import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";
import { z } from "zod";

export function metadata(): ClinkrCommandMetadata {
	return {};
}

export async function command() {
	return {
		schema: z.object({}),
		handler: async () => ({ type: "ok" as const, data: undefined }),
	};
}
