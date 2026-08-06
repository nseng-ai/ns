import {
	cliOption,
	cliPositional,
	defineCommand,
	failure,
	negative,
	ok,
} from "@nseng-ai/clinkr/app";
import { z } from "zod";
import { reconcile } from "../../../core/index.ts";
import type {
	CursorRecord,
	MaterializationStoreGateway,
	ReconciliationResult,
} from "../../../core/index.ts";
import type { ConfigLoadResult } from "../../config-gateway.ts";
import type { GitplaneCliContext } from "../../context.ts";

const requestSchema = z
	.object({
		commit: cliPositional(z.string().min(1), { position: 0, description: "Target commit." }),
		repair: cliOption(z.boolean().default(false), {
			short: "-r",
			description: "Reapply the complete desired snapshot.",
		}),
		config: cliOption(z.string().optional(), {
			short: "-c",
			description: "Configuration path relative to the invocation directory.",
		}),
	})
	.strict();
const cursorSchema = z
	.object({
		commit: z.string(),
		generation: z.number().int().nonnegative(),
	})
	.strict();
const countsSchema = z
	.object({
		created: z.number().int().nonnegative(),
		restored: z.number().int().nonnegative(),
		revised: z.number().int().nonnegative(),
		deleted: z.number().int().nonnegative(),
		repaired: z.number().int().nonnegative(),
	})
	.strict();
const resultSchema = z
	.object({
		sourceId: z.string(),
		targetCommit: z.string(),
		mode: z.union([z.literal("normal"), z.literal("repair")]),
		priorCursor: cursorSchema.nullable(),
		resultingCursor: cursorSchema.nullable(),
		advanced: z.boolean(),
		counts: countsSchema,
		cleanupOnly: z.boolean(),
		replayedAttempt: z.boolean(),
		completion: z.union([z.literal("completed"), z.literal("no-op"), z.literal("cleanup-pending")]),
	})
	.strict();
type CliResult = z.infer<typeof resultSchema>;

function cursor(record: CursorRecord | null): z.infer<typeof cursorSchema> | null {
	return record === null ? null : { commit: record.commit, generation: record.generation };
}
function counts(values: Readonly<Record<string, number>> = {}): z.infer<typeof countsSchema> {
	return {
		created: values["artifact.created"] ?? 0,
		restored: values["artifact.restored"] ?? 0,
		revised: values["artifact.revised"] ?? 0,
		deleted: values["artifact.deleted"] ?? 0,
		repaired: values["artifact.repaired"] ?? 0,
	};
}
function completedData(result: Extract<ReconciliationResult, { type: "completed" }>): CliResult {
	return {
		sourceId: result.sourceId,
		targetCommit: result.targetCommit,
		mode: result.mode,
		priorCursor: cursor(result.priorCursor),
		resultingCursor: cursor(result.resultingCursor),
		advanced: result.cursorAdvanced,
		counts: counts(result.counts),
		cleanupOnly: result.cleanupOnly,
		replayedAttempt: result.replayedAttempt,
		completion: "completed",
	};
}
function renderHuman(result: CliResult): string {
	const total = Object.values(result.counts).reduce((sum, value) => sum + value, 0);
	return `${result.sourceId}: ${result.completion} ${result.targetCommit} (${result.mode}, ${total} artifact operations)`;
}

export async function command() {
	return defineCommand({
		requiresContext: true,
		schema: requestSchema,
		resultSchema,
		handler: async (context: GitplaneCliContext, request: z.infer<typeof requestSchema>) => {
			let loaded: ConfigLoadResult;
			try {
				loaded = await context.configGateway.load({
					cwd: context.cwd,
					...(request.config === undefined ? {} : { configPath: request.config }),
				});
			} catch {
				return failure("reconcile-failed", "Unable to reconcile Gitplane artifacts.", {
					category: "config-load",
					diagnostic: "Unexpected configuration load failure.",
				});
			}
			if (!loaded.ok)
				return failure("reconcile-failed", "Unable to reconcile Gitplane artifacts.", {
					category: loaded.category,
					diagnostic: loaded.diagnostic,
					...(loaded.path === undefined ? {} : { path: loaded.path }),
				});

			let store: MaterializationStoreGateway;
			try {
				store = loaded.config.store(
					{ clock: context.clock, configDirectory: loaded.configDirectory },
					{ access: "read-write" },
				);
			} catch {
				return failure("reconcile-failed", "Unable to reconcile Gitplane artifacts.", {
					category: "store-open-failed",
					diagnostic: "The configured store could not be opened.",
				});
			}

			let result: ReconciliationResult | undefined;
			let unexpectedFailure = false;
			try {
				result = await reconcile(
					{ clock: context.clock, artifacts: context.artifactGateway, store },
					{
						sourceId: loaded.config.source.id,
						artifactRoot: loaded.artifactRoot,
						targetCommitish: request.commit,
						mode: request.repair ? "repair" : "normal",
						...(loaded.config.kinds === undefined ? {} : { kinds: loaded.config.kinds }),
					},
				);
			} catch {
				unexpectedFailure = true;
			}

			let closeCauseCode: string | undefined;
			try {
				const closed = await store.close();
				if (!closed.ok) closeCauseCode = closed.error.code;
			} catch {
				closeCauseCode = "unexpected-close-failure";
			}
			if (closeCauseCode !== undefined)
				return failure("reconcile-failed", "Unable to reconcile Gitplane artifacts.", {
					category: "store-close-failed",
					diagnostic: "The configured store could not be closed.",
					causeCode: closeCauseCode,
				});
			if (unexpectedFailure || result === undefined)
				return failure("reconcile-failed", "Unable to reconcile Gitplane artifacts.", {
					category: "reconciliation-failed",
					diagnostic: "Unexpected reconciliation failure.",
				});
			if (result.type === "structural-failure")
				return negative("Reconciliation was not applied.", {
					data: { category: "structural-failure", code: result.code, diagnostic: result.message },
				});
			if (result.type === "operational-failure")
				return failure("reconcile-failed", "Unable to reconcile Gitplane artifacts.", {
					category: "operational-failure",
					operation: result.operation,
					causeCode: result.error.code,
				});
			if (result.type === "completed-with-cleanup-pending")
				return failure(
					"reconcile-cleanup-pending",
					"Reconciliation completed but cleanup is pending.",
					{
						category: "cleanup-pending",
						sourceId: result.sourceId,
						targetCommit: result.targetCommit,
						mode: result.mode,
						resultingCursor: cursor(result.resultingCursor),
						cleanupOnly: result.cleanupOnly,
						replayedAttempt: result.replayedAttempt,
						causeCode: result.error.code,
					},
				);
			if (result.type === "no-op")
				return ok({
					sourceId: result.sourceId,
					targetCommit: result.targetCommit,
					mode: result.mode,
					priorCursor: cursor(result.cursor),
					resultingCursor: cursor(result.cursor),
					advanced: false,
					counts: counts(),
					cleanupOnly: false,
					replayedAttempt: false,
					completion: "no-op" as const,
				});
			return ok(completedData(result));
		},
		renderHuman,
	});
}
