import { ok } from "@sdl/clinkr";
import { optionalEntry } from "@sdl/core/primitives";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import { mustEntryLocator, namespaceValueLabel } from "../ref-layout.ts";
import { gatewayFailure, resolveEntryRequest } from "./shared.ts";

export const checkRequestSchema = z.object({
	key: z.string().describe("Entry Key to check."),
	namespace: z.string().optional().describe("Namespace. Omit for ad-hoc base Entries."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	at: z.string().optional().describe("Snapshot ref or commit to inspect."),
});

export const checkResultSchema = z.object({
	namespace: z.string(),
	key: z.string(),
	branch: z.string(),
	present: z.boolean(),
	refName: z.string(),
	target: z.string(),
	at: z.string().nullable(),
	headSha: z.string().nullable(),
	headDate: z.string().nullable(),
	blobSha: z.string().nullable(),
	sizeBytes: z.number().int().nullable(),
});

export type CheckRequest = z.infer<typeof checkRequestSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;

export async function runCheck(ctx: BrmemCliContext, request: CheckRequest) {
	const resolved = await resolveEntryRequest(ctx, {
		key: request.key,
		...optionalEntry("branch", request.branch),
		...optionalEntry("namespace", request.namespace),
	});
	if (resolved.type !== "resolved") return resolved;
	const { namespace, key, branch } = resolved.value;
	const locator = mustEntryLocator(namespace, key, branch);
	const target = request.at ?? locator;
	const result = await ctx.gateway.checkEntry({
		namespace,
		key,
		branch,
		...optionalEntry("at", request.at),
	});
	if (result.type === "error") return gatewayFailure<CheckResult>(result.error);
	if (result.type === "missing") {
		return ok(
			emptyResult({
				namespace,
				key,
				branch,
				refName: locator,
				target,
				...optionalEntry("at", request.at),
			}),
		);
	}
	return ok({
		namespace,
		key,
		branch,
		present: true,
		refName: locator,
		target,
		at: request.at ?? null,
		headSha: result.value.headSha,
		headDate: result.value.headDate,
		blobSha: result.value.blobSha,
		sizeBytes: result.value.sizeBytes,
	});
}

export function renderCheck(result: CheckResult): string {
	const lines = [
		`Namespace: ${namespaceValueLabel(result.namespace)}`,
		`Entry Key: ${result.key}`,
		`Branch: ${result.branch}`,
		`Present: ${result.present ? "yes" : "no"}`,
		`Entry Locator: ${result.refName}`,
		`Target: ${result.target}`,
		`Head: ${result.headSha} (${result.headDate})`,
		`Blob: ${result.blobSha}`,
		`Size: ${result.sizeBytes}`,
	];
	return lines.join("\n");
}

function emptyResult(options: {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
	target: string;
	at?: string;
}): CheckResult {
	return {
		namespace: options.namespace,
		key: options.key,
		branch: options.branch,
		present: false,
		refName: options.refName,
		target: options.target,
		at: options.at ?? null,
		headSha: null,
		headDate: null,
		blobSha: null,
		sizeBytes: null,
	};
}
