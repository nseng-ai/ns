import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { SlotCliContext } from "../context.ts";
import { initializePool } from "../lifecycle/pool.ts";

export const initRequestSchema = z.object({
	size: z.coerce.number().int().optional().describe("Number of slots to create (1..99)."),
});

export const initResultSchema = z.object({
	pool_size: z.number().int().nonnegative(),
	created: z.array(z.string()),
	worktrees_dir: z.string(),
});

export type InitRequest = z.infer<typeof initRequestSchema>;
export type InitResult = z.infer<typeof initResultSchema>;

export async function runInit(ctx: SlotCliContext, request: InitRequest) {
	if (request.size === undefined) return failure("invalid_size", "--size must be between 1 and 99.");
	const result = await initializePool(ctx, request.size);
	if (result.type === "failure") return failure(result.failure.error_type, result.failure.message);
	return ok(result.outcome);
}

export function renderInit(result: InitResult): string {
	const created = result.created.map((name) => `  + ${name}`).join("\n");
	return [`Initialized pool with ${result.pool_size} slot(s) at ${result.worktrees_dir}`, created].filter((line) => line.length > 0).join("\n");
}
