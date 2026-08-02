import { cliOption, cliPositional, defineCommand, negative, ok } from "@nseng-ai/clinkr/app";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { BrmemCliContext } from "../../context.ts";
import { mustEntryLocator, namespaceValueLabel } from "../../ref-layout.ts";
import { gatewayFailure, resolveOperationEntryRequest } from "../../entry-request.ts";

const getRequestSchema = z.object({
	key: cliPositional(z.string().describe("Entry Key to read."), { position: 0 }),
	namespace: cliOption(
		z.string().optional().describe("Namespace. Omit for ad-hoc base Entries."),
		{},
	),
	branch: cliOption(z.string().optional().describe("Branch. Defaults to current branch."), {}),
	at: cliOption(z.string().optional().describe("Snapshot ref or commit to inspect."), {}),
});

const getResultSchema = z.object({
	namespace: z.string(),
	key: z.string(),
	branch: z.string(),
	content: z.string(),
	refName: z.string(),
	target: z.string(),
	at: z.string().nullable(),
});

type GetRequest = z.infer<typeof getRequestSchema>;
type GetResult = z.infer<typeof getResultSchema>;

async function runGet(ctx: BrmemCliContext, request: GetRequest) {
	const resolved = await resolveOperationEntryRequest(ctx, {
		key: request.key,
		...optionalEntries({ namespace: request.namespace, branch: request.branch }),
	});
	if (resolved.type === "failure") return resolved.outcome;
	const { namespace, key, branch } = resolved.value;
	const result = await ctx.gateway.getEntry({
		namespace,
		key,
		branch,
		...optionalEntry("at", request.at),
	});
	if (result.type === "error") return gatewayFailure(result.error);
	const locator = mustEntryLocator(namespace, key, branch);
	const target = request.at ?? locator;
	if (result.type === "missing") {
		const message = `No content for Entry Key ${key} in Namespace ${namespaceValueLabel(namespace)} on Branch ${branch} at ${target}. Inspect with: git show ${request.at === undefined ? locator : `${request.at}:${key}`}`;
		return negative(message, {
			data: {
				namespace,
				key,
				branch,
				content: "",
				refName: locator,
				target,
				at: request.at ?? null,
			} satisfies GetResult,
		});
	}
	return ok({
		namespace,
		key,
		branch,
		content: result.value.content,
		refName: locator,
		target,
		at: request.at ?? null,
	});
}

function renderGet(result: GetResult): string {
	return result.content.endsWith("\n") ? result.content.slice(0, -1) : result.content;
}
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: getRequestSchema,
		resultSchema: getResultSchema,
		handler: runGet,
		renderHuman: renderGet,
	});
}
