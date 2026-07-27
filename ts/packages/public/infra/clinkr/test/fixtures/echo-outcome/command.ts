import { z } from "zod";

/**
 * Deliberately a raw definition object rather than `defineCommand`: this
 * fixture returns whatever outcome shape the request describes — including
 * malformed ones — which the typed handler contract would reject at compile
 * time. `decodeCommandOutcome` at the public seam is the subject under test.
 * No `resultSchema` is declared, so a success outcome carrying data must be
 * rejected by the framework. Drive it exclusively through `--input-json`
 * (the `outcome` field has no argv projection).
 */
export async function command() {
	return {
		schema: z.object({ outcome: z.unknown() }),
		handler: async (request: { outcome: unknown }) => request.outcome,
	};
}
