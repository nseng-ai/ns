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
		unchanged: z.number().int().nonnegative(),
	})
	.strict();
const storeCloseSchema = z
	.object({
		status: z.literal("failed"),
		causeCode: z.string(),
	})
	.strict();
const resultSchema = z
	.object({
		sourceId: z.string(),
		targetCommit: z.string(),
		priorCursor: cursorSchema.nullable(),
		resultingCursor: cursorSchema.nullable(),
		cursorAdvanced: z.boolean(),
		counts: countsSchema,
		cleanupOnly: z.boolean(),
		replayedPlan: z.boolean(),
		completion: z.union([z.literal("completed"), z.literal("no-op")]),
		storeClose: storeCloseSchema.optional(),
	})
	.strict();
type CliResult = z.infer<typeof resultSchema>;
type StoreClose = z.infer<typeof storeCloseSchema>;

function cursor(record: CursorRecord | null): z.infer<typeof cursorSchema> | null {
	return record === null ? null : { commit: record.commit, generation: record.generation };
}

function counts(
	values: Readonly<{
		created: number;
		restored: number;
		revised: number;
		unchanged: number;
		deleted: number;
	}> = {
		created: 0,
		restored: 0,
		revised: 0,
		unchanged: 0,
		deleted: 0,
	},
): z.infer<typeof countsSchema> {
	return values;
}

function completedData(result: Extract<ReconciliationResult, { type: "completed" }>): CliResult {
	return {
		sourceId: result.sourceId,
		targetCommit: result.targetCommit,
		priorCursor: cursor(result.priorCursor),
		resultingCursor: cursor(result.resultingCursor),
		cursorAdvanced: result.cursorAdvanced,
		counts: counts(result.counts),
		cleanupOnly: result.cleanupOnly,
		replayedPlan: result.replayedPlan,
		completion: "completed",
	};
}

function renderHuman(result: CliResult): string {
	const total = Object.values(result.counts).reduce((sum, value) => sum + value, 0);
	const summary = `${result.sourceId}: ${result.completion} ${result.targetCommit} (${total} artifact operations)`;
	return result.storeClose === undefined
		? summary
		: `${summary}\nWarning: the materialization store could not be closed (${result.storeClose.causeCode}).`;
}

function storeCloseData(storeClose: StoreClose | undefined): { readonly storeClose?: StoreClose } {
	return storeClose === undefined ? {} : { storeClose };
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
			try {
				result = await reconcile(
					{ clock: context.clock, artifacts: context.artifactGateway, store },
					{
						sourceId: loaded.config.source.id,
						artifactRoot: loaded.artifactRoot,
						targetCommitish: request.commit,
						...(loaded.config.kinds === undefined ? {} : { kinds: loaded.config.kinds }),
					},
				);
			} catch {
				// An untyped throw does not establish whether persistence completed.
			}

			let storeClose: StoreClose | undefined;
			try {
				const closed = await store.close();
				if (!closed.ok) storeClose = { status: "failed", causeCode: closed.error.code };
			} catch {
				storeClose = { status: "failed", causeCode: "unexpected-close-failure" };
			}
			if (result === undefined) {
				if (storeClose !== undefined)
					return failure("reconcile-failed", "Unable to reconcile Gitplane artifacts.", {
						category: "store-close-failed",
						diagnostic:
							"The configured store could not be closed after reconciliation had an unknown persistence outcome.",
						causeCode: storeClose.causeCode,
						storeClose,
					});
				return failure("reconcile-failed", "Unable to reconcile Gitplane artifacts.", {
					category: "reconciliation-failed",
					diagnostic: "Unexpected reconciliation failure.",
				});
			}
			if (result.type === "structural-failure")
				return negative("Reconciliation was not applied.", {
					data: {
						category: "structural-failure",
						code: result.code,
						diagnostic: result.message,
						...storeCloseData(storeClose),
					},
				});
			if (result.type === "operational-failure")
				return failure("reconcile-failed", "Unable to reconcile Gitplane artifacts.", {
					category: "operational-failure",
					operation: result.operation,
					causeCode: result.error.code,
					...storeCloseData(storeClose),
				});
			if (result.type === "completed-with-cleanup-pending")
				return failure(
					"reconcile-cleanup-pending",
					"Reconciliation completed but cleanup is pending.",
					{
						category: "cleanup-pending",
						sourceId: result.sourceId,
						targetCommit: result.targetCommit,
						resultingCursor: cursor(result.resultingCursor),
						cleanupOnly: result.cleanupOnly,
						replayedPlan: result.replayedPlan,
						causeCode: result.error.code,
						...storeCloseData(storeClose),
					},
				);
			if (result.type === "no-op")
				return ok({
					sourceId: result.sourceId,
					targetCommit: result.targetCommit,
					priorCursor: cursor(result.cursor),
					resultingCursor: cursor(result.cursor),
					cursorAdvanced: false,
					counts: counts(),
					cleanupOnly: false,
					replayedPlan: false,
					completion: "no-op" as const,
					...storeCloseData(storeClose),
				});
			return ok({ ...completedData(result), ...storeCloseData(storeClose) });
		},
		renderHuman,
	});
}
