import { z } from "zod";

export async function command() {
	return {
		schema: z.object({}),
		handler: async () => ({ type: "ok" as const, data: undefined }),
	};
}
