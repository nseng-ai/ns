import { cliOption, cliPositional, defineCommand, failure, ok } from "@nseng-ai/clinkr/app";
import { optionalEntries, optionalEntry } from "@nseng-ai/foundation/primitives";
import { z } from "zod";

import type { BrmemCliContext } from "../../context.ts";
import { prepareEntryContentFromSource, STDIN_SOURCE_FILE } from "../../put-entry-from-file.ts";
import { mustEntryLocator, namespaceDisplayLabel } from "../../ref-layout.ts";
import { gatewayFailure, resolveOperationEntryRequest } from "../../entry-request.ts";

const putRequestSchema = z.object({
	key: cliPositional(z.string().describe("Entry Key."), { position: 0 }),
	namespace: cliOption(
		z.string().optional().describe("Namespace. Omit for ad-hoc base Entries."),
		{},
	),
	stdin: cliOption(z.boolean().default(false).describe("Read content from stdin."), {}),
	file: cliOption(z.string().optional().describe("Read content from file."), {}),
	branch: cliOption(z.string().optional().describe("Branch. Defaults to current branch."), {}),
	force: cliOption(
		z.boolean().default(false).describe("Bypass the 1 MiB size cap and binary-content check."),
		{ short: "-f" },
	),
});

const putResultSchema = z.object({
	namespace: z.string(),
	key: z.string(),
	branch: z.string(),
	refName: z.string(),
	commit: z.string(),
	sourceFile: z.string(),
});

type PutRequest = z.infer<typeof putRequestSchema>;
type PutResult = z.infer<typeof putResultSchema>;

async function runPut(ctx: BrmemCliContext, request: PutRequest) {
	const prepared = await prepareEntryContentFromSource({
		cwd: ctx.cwd,
		key: request.key,
		stdin: request.stdin,
		...optionalEntry("file", request.file),
		force: request.force,
		sourceReader: ctx.sourceReader,
	});
	if (prepared.type === "error") {
		return failure(prepared.error.code, prepared.error.message);
	}

	const resolved = await resolveOperationEntryRequest(ctx, {
		key: request.key,
		...optionalEntries({ namespace: request.namespace, branch: request.branch }),
	});
	if (resolved.type === "failure") return resolved.outcome;
	const { namespace, key, branch } = resolved.value;

	const result = await ctx.gateway.putEntry({
		namespace,
		key,
		branch,
		content: prepared.value.content,
	});
	if (result.type === "error") return gatewayFailure(result.error);

	return ok({
		namespace,
		key,
		branch,
		refName: mustEntryLocator(namespace, key, branch),
		commit: result.value.commitSha,
		sourceFile: prepared.value.sourceFile,
	});
}

function renderPut(result: PutResult): string {
	const source = result.sourceFile === STDIN_SOURCE_FILE ? "stdin" : result.sourceFile;
	return [
		`Stored Entry Key ${result.key} from ${source} in ${namespaceDisplayLabel(result.namespace)} on Branch ${result.branch}.`,
		`Entry Locator: ${result.refName}`,
		`Commit: ${result.commit}`,
		`Inspect: git show ${result.refName}`,
	].join("\n");
}
export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: putRequestSchema,
		resultSchema: putResultSchema,
		handler: runPut,
		renderHuman: renderPut,
	});
}
