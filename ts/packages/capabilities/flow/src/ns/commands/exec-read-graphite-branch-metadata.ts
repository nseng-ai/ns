import { formatCommand } from "@ns/core/command";
import {
	GRAPHITE_METADATA_SQLITE_QUERY_TIMEOUT_MS,
	graphiteBranchMetadataReadonlyJsonArgs,
} from "@ns/capability-kit/graphite/metadata";
import {
	defineExtension,
	failed,
	ok,
	z,
	type SdlCommand,
	type SdlExtensionApi,
	type SdlResult,
} from "@ns/kernel/sdk";

const execReadGraphiteBranchMetadataSchema = z.object({
	dbPath: z.string().describe("Absolute path to Graphite's .graphite_metadata.db file."),
});

type ExecReadGraphiteBranchMetadataRequest = z.output<typeof execReadGraphiteBranchMetadataSchema>;

export const flowExecReadGraphiteBranchMetadataCommand: SdlCommand<
	typeof execReadGraphiteBranchMetadataSchema
> = {
	name: "exec-read-graphite-branch-metadata",
	summary: "Read Graphite branch metadata for flow internals.",
	description:
		"Internal flow exec operation. Reads Graphite branch metadata through a controlled sqlite3 query and prints the raw JSON row array.",
	schema: execReadGraphiteBranchMetadataSchema,
	run: async (ctx, request) => await runExecReadGraphiteBranchMetadata(ctx, request),
};

async function runExecReadGraphiteBranchMetadata(
	ctx: SdlExtensionApi,
	request: ExecReadGraphiteBranchMetadataRequest,
): Promise<SdlResult> {
	const args = graphiteBranchMetadataReadonlyJsonArgs(request.dbPath);
	const result = await ctx.exec("sqlite3", args, {
		timeoutMs: GRAPHITE_METADATA_SQLITE_QUERY_TIMEOUT_MS,
	});
	if (result.code !== 0 || result.killed) {
		const killed = result.killed ? " (killed or timed out)" : "";
		const details = [
			`sqlite3 could not read Graphite branch metadata from ${request.dbPath}.`,
			`$ ${formatCommand("sqlite3", args)}`,
			`exit ${result.code}${killed}`,
			result.stderr.trim() === "" ? undefined : result.stderr.trim(),
		]
			.filter((line): line is string => line !== undefined)
			.join("\n");
		return failed(details, 2);
	}
	return ok(result.stdout.trim() === "" ? "[]" : result.stdout.trim());
}

export default defineExtension({
	commands: [flowExecReadGraphiteBranchMetadataCommand],
});
