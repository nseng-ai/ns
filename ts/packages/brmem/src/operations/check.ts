import { negative, ok } from "@asdl/clinkr";
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
	ref_name: z.string(),
	target: z.string(),
	at: z.string().nullable(),
	head_sha: z.string().nullable(),
	head_date: z.string().nullable(),
	blob_sha: z.string().nullable(),
	size_bytes: z.number().int().nullable(),
});

export type CheckRequest = z.infer<typeof checkRequestSchema>;
export type CheckResult = z.infer<typeof checkResultSchema>;

export async function runCheck(ctx: BrmemCliContext, request: CheckRequest) {
	const resolved = await resolveEntryRequest(ctx, request);
	if (resolved.type !== "resolved") return resolved;
	const { namespace, key, branch } = resolved.value;
	const locator = mustEntryLocator(namespace, key, branch);
	const target = request.at ?? locator;
	const result = await ctx.gateway.checkEntry({ namespace, key, branch, at: request.at });
	if (result.type === "error") return gatewayFailure<CheckResult>(result.error);
	if (result.type === "missing") {
		const absent = emptyResult({ namespace, key, branch, refName: locator, target, at: request.at });
		return negative(
			`not found: Entry Key=${key} Namespace=${namespaceValueLabel(namespace)} Branch=${branch} at ${target}`,
			absent,
		);
	}
	return ok({
		namespace,
		key,
		branch,
		ref_name: locator,
		target,
		at: request.at ?? null,
		head_sha: result.value.headSha,
		head_date: result.value.headDate,
		blob_sha: result.value.blobSha,
		size_bytes: result.value.sizeBytes,
	});
}

export function renderCheck(result: CheckResult): string {
	const lines = [
		`Namespace: ${namespaceValueLabel(result.namespace)}`,
		`Entry Key: ${result.key}`,
		`Branch: ${result.branch}`,
		`Entry Locator: ${result.ref_name}`,
		`Target: ${result.target}`,
		`Head: ${result.head_sha} (${result.head_date})`,
		`Blob: ${result.blob_sha}`,
		`Size: ${result.size_bytes}`,
	];
	return lines.join("\n");
}

function emptyResult(options: {
	namespace: string;
	key: string;
	branch: string;
	refName: string;
	target: string;
	at?: string | undefined;
}): CheckResult {
	return {
		namespace: options.namespace,
		key: options.key,
		branch: options.branch,
		ref_name: options.refName,
		target: options.target,
		at: options.at ?? null,
		head_sha: null,
		head_date: null,
		blob_sha: null,
		size_bytes: null,
	};
}

