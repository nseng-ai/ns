import {
	commandSucceeded,
	formatCommand,
	formatCommandDetails,
} from "@nseng-ai/foundation/command";
import {
	GRAPHITE_METADATA_SQLITE_QUERY_TIMEOUT_MS,
	graphiteBranchMetadataReadonlyJsonArgs,
	graphiteBranchMetadataRowsSchema,
	type GraphiteBranchMetadataRows,
} from "@nseng-ai/extension-kit/graphite/metadata";
import {
	defineCommand,
	failure,
	ok,
	z,
	type CommandExit,
	type NsCommand,
	type NsExtensionApi,
} from "@nseng-ai/sdk";
import { FLOW_COMMAND_FAILED } from "../flow-cli-runner.ts";

const execReadGraphiteBranchMetadataSchema = z.object({
	dbPath: z.string().describe("Absolute path to Graphite's .graphite_metadata.db file."),
});

type ExecReadGraphiteBranchMetadataRequest = z.output<typeof execReadGraphiteBranchMetadataSchema>;

export const flowExecReadGraphiteBranchMetadataCommand: NsCommand<
	typeof execReadGraphiteBranchMetadataSchema
> = defineCommand({
	schema: execReadGraphiteBranchMetadataSchema,
	resultSchema: graphiteBranchMetadataRowsSchema,
	handler: async (ctx, request) => await runExecReadGraphiteBranchMetadata(ctx, request),
});

async function runExecReadGraphiteBranchMetadata(
	ctx: NsExtensionApi,
	request: ExecReadGraphiteBranchMetadataRequest,
): Promise<CommandExit<GraphiteBranchMetadataRows>> {
	const args = graphiteBranchMetadataReadonlyJsonArgs(request.dbPath);
	const result = await ctx.exec("sqlite3", args, {
		timeoutMs: GRAPHITE_METADATA_SQLITE_QUERY_TIMEOUT_MS,
	});
	if (!commandSucceeded(result)) {
		const details = [
			`sqlite3 could not read Graphite branch metadata from ${request.dbPath}.`,
			`$ ${formatCommand("sqlite3", args)}`,
			formatCommandDetails(result),
		].join("\n");
		return failure(FLOW_COMMAND_FAILED, details);
	}
	const stdout = result.stdout.trim();
	let rawRows: unknown;
	try {
		rawRows = JSON.parse(stdout === "" ? "[]" : stdout);
	} catch {
		return failure(
			FLOW_COMMAND_FAILED,
			`sqlite3 returned invalid JSON for Graphite branch metadata from ${request.dbPath}.`,
		);
	}
	const rows = graphiteBranchMetadataRowsSchema.safeParse(rawRows);
	if (!rows.success) {
		return failure(
			FLOW_COMMAND_FAILED,
			`sqlite3 returned an invalid row array for Graphite branch metadata from ${request.dbPath}.`,
		);
	}
	return ok(rows.data);
}

export default flowExecReadGraphiteBranchMetadataCommand;
