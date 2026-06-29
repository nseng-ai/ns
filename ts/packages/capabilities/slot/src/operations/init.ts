import { failure, ok, resolveRenderCapabilities, type RenderCapabilities } from "@sdl/clinkr";
import { renderResultBlock } from "@sdl/cli-theme";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { initializePool } from "../lifecycle/pool.ts";

export const initRequestSchema = z.object({
	size: z.coerce.number().int().optional().describe("Number of slots to create (1..99)."),
});

export const initResultSchema = z.object({
	poolSize: z.number().int().nonnegative(),
	created: z.array(z.string()),
	worktreesDir: z.string(),
});

export type InitRequest = z.infer<typeof initRequestSchema>;
export type InitResult = z.infer<typeof initResultSchema>;

export async function runInit(ctx: SlotCliContext, request: InitRequest) {
	if (request.size === undefined)
		return failure("invalid-size", "--size must be between 1 and 99.");
	const result = await initializePool(ctx, request.size);
	if (result.type === "failure") return failure(result.failure.errorType, result.failure.message);
	return ok(result.outcome);
}

export function renderInit(
	result: InitResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const renderCaps = resolveRenderCapabilities(caps);
	const created = result.created.map((name) => `  + ${name}`).join("\n");
	const body = [`Pool size: ${result.poolSize}`, `Worktrees: ${result.worktreesDir}`, created]
		.filter((line) => line.length > 0)
		.join("\n");
	return renderResultBlock(renderCaps, {
		kind: "success",
		headline: `Initialized slot pool with ${result.poolSize} slot(s).`,
		body,
	});
}
