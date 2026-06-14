import { failure, ok } from "@asdl/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import { mustEntryLocator, namespaceValueLabel } from "../ref-layout.ts";
import { gatewayFailure, resolveEntryRequest } from "./shared.ts";

export const getRequestSchema = z.object({
	key: z.string().describe("Entry Key to read."),
	namespace: z.string().optional().describe("Namespace. Omit for ad-hoc base Entries."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	at: z.string().optional().describe("Snapshot ref or commit to inspect."),
});

export const getResultSchema = z.object({
	namespace: z.string(),
	key: z.string(),
	branch: z.string(),
	content: z.string(),
	ref_name: z.string(),
	target: z.string(),
	at: z.string().nullable(),
});

export type GetRequest = z.infer<typeof getRequestSchema>;
export type GetResult = z.infer<typeof getResultSchema>;

export async function runGet(ctx: BrmemCliContext, request: GetRequest) {
	const resolved = await resolveEntryRequest(ctx, request);
	if (resolved.type !== "resolved") return resolved;
	const { namespace, key, branch } = resolved.value;
	const result = await ctx.gateway.getEntry({ namespace, key, branch, at: request.at });
	if (result.type === "error") return gatewayFailure<GetResult>(result.error);
	const locator = mustEntryLocator(namespace, key, branch);
	const target = request.at ?? locator;
	if (result.type === "missing") {
		return failure(
			"branch_memory_missing",
			`No content for Entry Key ${key} in Namespace ${namespaceValueLabel(namespace)} on Branch ${branch} at ${target}. Inspect with: git show ${request.at === undefined ? locator : `${request.at}:${key}`}`,
		);
	}
	return ok({
		namespace,
		key,
		branch,
		content: result.value.content,
		ref_name: locator,
		target,
		at: request.at ?? null,
	});
}

export function renderGet(result: GetResult): string {
	return result.content.endsWith("\n") ? result.content.slice(0, -1) : result.content;
}
