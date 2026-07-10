import { commandSucceeded, formatCommand } from "@nseng-ai/foundation/command";
import {
	GRAPHITE_METADATA_SQLITE_QUERY_TIMEOUT_MS,
	graphiteBranchMetadataReadonlyJsonArgs,
} from "@nseng-ai/capability-kit/graphite/metadata";
import {
	defineCommand,
	failure,
	ok,
	z,
	type CommandExit,
	type NsCommand,
	type NsExtensionApi,
} from "@nseng-ai/kernel/sdk";
import { FLOW_COMMAND_FAILED } from "../flow-cli-runner.ts";

const execReadGraphiteBranchMetadataSchema = z.object({
	dbPath: z.string().describe("Absolute path to Graphite's .graphite_metadata.db file."),
});

type ExecReadGraphiteBranchMetadataRequest = z.output<typeof execReadGraphiteBranchMetadataSchema>;

export const flowExecReadGraphiteBranchMetadataCommand: NsCommand<
	typeof execReadGraphiteBranchMetadataSchema
> = defineCommand({
	name: "read-graphite-branch-metadata",
	summary: "Read Graphite branch metadata for flow internals.",
	description:
		"Internal flow exec operation. Reads Graphite branch metadata through a controlled sqlite3 query and prints the raw JSON row array.",
	schema: execReadGraphiteBranchMetadataSchema,
	resultSchema: z.string(),
	handler: async (ctx, request) => await runExecReadGraphiteBranchMetadata(ctx, request),
});

async function runExecReadGraphiteBranchMetadata(
	ctx: NsExtensionApi,
	request: ExecReadGraphiteBranchMetadataRequest,
): Promise<CommandExit<string>> {
	const args = graphiteBranchMetadataReadonlyJsonArgs(request.dbPath);
	const result = await ctx.exec("sqlite3", args, {
		timeoutMs: GRAPHITE_METADATA_SQLITE_QUERY_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		const details = [
			`sqlite3 could not read Graphite branch metadata from ${request.dbPath}.`,
			`$ ${formatCommand("sqlite3", args)}`,
			formatMetadataCommandTermination(result),
		].join("\n");
		return failure(FLOW_COMMAND_FAILED, details);
	}
	return ok(result.stdout.trim() === "" ? "[]" : result.stdout.trim());
}

function formatMetadataCommandTermination(
	result: Awaited<ReturnType<NsExtensionApi["exec"]>>,
): string {
	switch (result.type) {
		case "spawn-failed":
			return `spawn failed: ${result.error}`;
		case "cancelled":
			return "cancelled";
		case "timed-out":
			return "timed out";
		case "exited": {
			const status =
				result.signal === null
					? `exit ${result.code}`
					: `signal ${result.signal} (exit ${result.code})`;
			const detail = result.stderr.trim() || result.stdout.trim();
			return detail === "" ? status : `${status}: ${detail}`;
		}
	}
}

export default flowExecReadGraphiteBranchMetadataCommand;
