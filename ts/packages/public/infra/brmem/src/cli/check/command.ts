import { cliOption, cliPositional, defineCommand, negative, ok } from "@nseng-ai/clinkr/app";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { BrmemCliContext } from "../../context.ts";
import { mustEntryLocator, namespaceValueLabel } from "../../ref-layout.ts";
import { gatewayFailure, resolveOperationEntryRequest } from "../../entry-request.ts";

const checkRequestSchema = z.object({
	key: cliPositional(z.string().describe("Entry Key to check."), { position: 0 }),
	namespace: cliOption(
		z.string().optional().describe("Namespace. Omit for ad-hoc base Entries."),
		{},
	),
	branch: cliOption(z.string().optional().describe("Branch. Defaults to current branch."), {}),
	at: cliOption(z.string().optional().describe("Snapshot ref or commit to inspect."), {}),
	require: cliOption(z.boolean().default(false).describe("Require the named Entry to exist."), {
		short: "-r",
	}),
});

const checkResultSchema = z.object({
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

type CheckRequest = z.infer<typeof checkRequestSchema>;
type CheckResult = z.infer<typeof checkResultSchema>;

async function runCheck(ctx: BrmemCliContext, request: CheckRequest) {
	const resolved = await resolveOperationEntryRequest(ctx, {
		key: request.key,
		...optionalEntries({ namespace: request.namespace, branch: request.branch }),
	});
	if (resolved.type === "failure") return resolved.outcome;
	const { namespace, key, branch } = resolved.value;
	const locator = mustEntryLocator(namespace, key, branch);
	const target = request.at ?? locator;
	const result = await ctx.gateway.checkEntry({
		namespace,
		key,
		branch,
		...optionalEntry("at", request.at),
	});
	if (result.type === "error") return gatewayFailure(result.error);
	if (result.type === "missing") {
		const data = emptyResult({
			namespace,
			key,
			branch,
			refName: locator,
			target,
			...optionalEntry("at", request.at),
		});
		return request.require
			? negative("The requested Branch Memory Entry does not exist.", { data })
			: ok(data);
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

function renderCheck(result: CheckResult): string {
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
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: checkRequestSchema,
		resultSchema: checkResultSchema,
		handler: runCheck,
		renderHuman: renderCheck,
	});
}
