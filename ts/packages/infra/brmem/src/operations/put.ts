import { failure, ok } from "@sdl/clinkr";
import { z } from "zod";

import type { BrmemCliContext } from "../context.ts";
import { prepareEntryContentFromSource, STDIN_SOURCE_FILE } from "../put-entry-from-file.ts";
import { mustEntryLocator, namespaceDisplayLabel } from "../ref-layout.ts";
import { gatewayFailure, resolveEntryRequest } from "./shared.ts";

export const putRequestSchema = z.object({
	key: z.string().describe("Entry Key."),
	namespace: z.string().optional().describe("Namespace. Omit for ad-hoc base Entries."),
	stdin: z.boolean().default(false).describe("Read content from stdin."),
	file: z.string().optional().describe("Read content from file."),
	branch: z.string().optional().describe("Branch. Defaults to current branch."),
	force: z.boolean().default(false).describe("Bypass the 1 MiB size cap and binary-content check."),
});

export const putResultSchema = z.object({
	namespace: z.string(),
	key: z.string(),
	branch: z.string(),
	refName: z.string(),
	commit: z.string(),
	sourceFile: z.string(),
});

export type PutRequest = z.infer<typeof putRequestSchema>;
export type PutResult = z.infer<typeof putResultSchema>;

export async function runPut(ctx: BrmemCliContext, request: PutRequest) {
	const prepared = await prepareEntryContentFromSource({
		cwd: ctx.cwd,
		key: request.key,
		stdin: request.stdin,
		file: request.file,
		force: request.force,
		sourceReader: ctx.sourceReader,
	});
	if (prepared.type === "error") {
		return failure(prepared.error.code, prepared.error.message);
	}

	const resolved = await resolveEntryRequest(ctx, {
		key: request.key,
		branch: request.branch,
		...(request.namespace === undefined ? {} : { namespace: request.namespace }),
	});
	if (resolved.type !== "resolved") return resolved;
	const { namespace, key, branch } = resolved.value;

	const result = await ctx.gateway.putEntry({
		namespace,
		key,
		branch,
		content: prepared.value.content,
	});
	if (result.type === "error") return gatewayFailure<PutResult>(result.error);

	return ok({
		namespace,
		key,
		branch,
		refName: mustEntryLocator(namespace, key, branch),
		commit: result.value.commitSha,
		sourceFile: prepared.value.sourceFile,
	});
}

export function renderPut(result: PutResult): string {
	const source = result.sourceFile === STDIN_SOURCE_FILE ? "stdin" : result.sourceFile;
	return [
		`Stored Entry Key ${result.key} from ${source} in ${namespaceDisplayLabel(result.namespace)} on Branch ${result.branch}.`,
		`Entry Locator: ${result.refName}`,
		`Commit: ${result.commit}`,
		`Inspect: git show ${result.refName}`,
	].join("\n");
}
