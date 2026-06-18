import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { resizePool } from "../lifecycle/pool.ts";

export const resizeRequestSchema = z.object({
	size: z.coerce.number().int().describe("Target pool size (1..99)."),
});

export const resizeResultSchema = z.object({
	previous_pool_size: z.number().int().nonnegative(),
	pool_size: z.number().int().nonnegative(),
	created: z.array(z.string()),
	removed: z.array(z.string()),
	worktrees_dir: z.string(),
});

export type ResizeRequest = z.infer<typeof resizeRequestSchema>;
export type ResizeResult = z.infer<typeof resizeResultSchema>;

export async function runResize(ctx: SlotCliContext, request: ResizeRequest) {
	const result = await resizePool(ctx, request.size);
	if (result.type === "failure") return failure(result.failure.error_type, result.failure.message);
	return ok(result.outcome);
}

export function renderResize(result: ResizeResult): string {
	if (result.created.length === 0 && result.removed.length === 0)
		return `Pool already at size ${result.pool_size}; no changes.`;
	const lines = [
		`Resized pool ${result.previous_pool_size} -> ${result.pool_size} at ${result.worktrees_dir}`,
	];
	lines.push(...result.created.map((name) => `  + ${name}`));
	lines.push(...result.removed.map((name) => `  - ${name}`));
	return lines.join("\n");
}
