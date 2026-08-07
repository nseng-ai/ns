import { z } from "zod";

/**
 * Deliberately a raw definition object rather than `defineCommand`: the
 * `bad-result` mode returns success data that violates its own
 * `resultSchema`, which the typed handler contract would reject at compile
 * time. Proves decode-time programmer errors, handler exception propagation,
 * and (in the `ok` mode) the explicit pretty-JSON renderer through the public
 * seam.
 */
export async function command() {
	return {
		schema: z.object({ mode: z.string() }),
		resultSchema: z.object({ value: z.string() }),
		renderHuman: (result: { value: string }) => JSON.stringify(result, null, 2),
		handler: async (request: { mode: string }) => {
			if (request.mode === "throw") throw new Error("boom");
			if (request.mode === "bad-result") return { status: "success", data: { value: 1 } };
			return { status: "success", data: { value: "Ada" } };
		},
	};
}
