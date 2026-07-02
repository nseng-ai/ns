import { failure, ok, type RenderCapabilities } from "@sdl/clinkr";
import { z } from "zod";
import { optionalEntry } from "@sdl/core/primitives";

import type { SlotCliContext } from "../../core/context.ts";
import { resizePool } from "../pool.ts";
import {
	buildSlotDestructiveResultBlock,
	renderSlotDestructiveResultBlock,
} from "./destructive-presentation.ts";

export const resizeRequestSchema = z.object({
	size: z.coerce.number().int().describe("Target pool size (1..99)."),
});

export const resizeResultSchema = z.object({
	previousPoolSize: z.number().int().nonnegative(),
	poolSize: z.number().int().nonnegative(),
	created: z.array(z.string()),
	removed: z.array(z.string()),
	worktreesDir: z.string(),
});

export type ResizeRequest = z.infer<typeof resizeRequestSchema>;
export type ResizeResult = z.infer<typeof resizeResultSchema>;

export async function runResize(ctx: SlotCliContext, request: ResizeRequest) {
	const result = await resizePool(ctx, request.size);
	if (result.type === "failure") return failure(result.failure.errorType, result.failure.message);
	return ok(result.outcome);
}

export function renderResize(
	result: ResizeResult,
	caps: RenderCapabilities = { canEmitAnsi: false },
): string {
	const body = renderResizeDetails(result);
	return renderSlotDestructiveResultBlock(
		caps,
		buildSlotDestructiveResultBlock({
			kind: "success",
			headline: resizeHeadline(result),
			...optionalEntry("body", body),
		}),
	);
}

function resizeHeadline(result: ResizeResult): string {
	if (result.created.length === 0 && result.removed.length === 0)
		return `Pool already at size ${result.poolSize}.`;
	if (result.created.length > 0 && result.removed.length === 0)
		return `Grew slot pool ${result.previousPoolSize} -> ${result.poolSize}.`;
	if (result.created.length === 0 && result.removed.length > 0)
		return `Shrank slot pool ${result.previousPoolSize} -> ${result.poolSize}.`;
	return `Resized slot pool ${result.previousPoolSize} -> ${result.poolSize}.`;
}

function renderResizeDetails(result: ResizeResult): string | undefined {
	const lines = [`Worktrees: ${result.worktreesDir}`];
	lines.push(...result.created.map((name) => `Created ${name}`));
	lines.push(...result.removed.map((name) => `Removed ${name}`));
	return lines.length === 1 && result.created.length === 0 && result.removed.length === 0
		? undefined
		: lines.join("\n");
}
