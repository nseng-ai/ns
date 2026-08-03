import { cliOption, cliPositional, defineCommand, failure, ok } from "@nseng-ai/clinkr/app";
import { z } from "zod";
import { reconcile } from "../../../core/index.ts";
import type {
	MaterializationStoreGateway,
	ReconcileData,
	ReconcileFailure,
} from "../../../core/index.ts";
import type { ConfigLoadResult } from "../../config-gateway.ts";
import type { GitplaneCliContext } from "../../context.ts";

const requestSchema = z
	.object({
		commit: cliPositional(z.string().min(1), { position: 0, description: "Target commit." }),
		full: cliOption(z.boolean().default(false), {
			short: "-f",
			description: "Perform a full reconciliation or repair.",
		}),
		config: cliOption(z.string().optional(), {
			short: "-c",
			description: "Configuration path relative to the invocation directory.",
		}),
	})
	.strict();
const transitionCountsSchema = z
	.object({
		created: z.number().int().nonnegative(),
		restored: z.number().int().nonnegative(),
		revised: z.number().int().nonnegative(),
		moved: z.number().int().nonnegative(),
		unchanged: z.number().int().nonnegative(),
		deleted: z.number().int().nonnegative(),
	})
	.strict();
const resultSchema = z
	.object({
		sourceId: z.string(),
		targetCommit: z.string(),
		previousCursor: z.string().nullable(),
		mode: z.enum(["incremental", "full"]),
		status: z.enum(["reconciled", "already-current"]),
		transitions: transitionCountsSchema,
		eventReconstruction: z.enum(["complete", "skipped", "not-applicable"]),
		cursorAdvanced: z.boolean(),
		errorsResolved: z.number().int().nonnegative(),
	})
	.strict();

function renderHuman(value: ReconcileData): string {
	const transitions = value.transitions;
	return [
		`${value.sourceId}: ${value.status} at ${value.targetCommit} (${value.mode})`,
		`created ${transitions.created}, restored ${transitions.restored}, revised ${transitions.revised}, moved ${transitions.moved}, unchanged ${transitions.unchanged}, deleted ${transitions.deleted}`,
		`event reconstruction ${value.eventReconstruction}; cursor ${value.cursorAdvanced ? "advanced" : "unchanged"}; errors resolved ${value.errorsResolved}`,
	].join("\n");
}

function sanitizedFailureData(value: ReconcileFailure, closeFailed: boolean) {
	return {
		code: value.code,
		phase: value.phase,
		...(value.operation === undefined ? {} : { operation: value.operation }),
		...(value.subject === undefined ? {} : { subject: value.subject }),
		...(value.targetCommit === undefined ? {} : { targetCommit: value.targetCommit }),
		cursorAdvanced: value.cursorAdvanced,
		...(closeFailed ? { closeFailure: "store-close-failed" as const } : {}),
	};
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
			let reconciled:
				| Awaited<ReturnType<typeof reconcile>>
				| { readonly ok: false; readonly failure: ReconcileFailure };
			try {
				reconciled = await reconcile(
					{ artifacts: context.artifactGateway, store, clock: context.clock },
					{
						sourceId: loaded.config.source.id,
						artifactRoot: loaded.artifactRoot,
						target: request.commit,
						full: request.full,
						...(loaded.config.kinds === undefined ? {} : { kinds: loaded.config.kinds }),
					},
				);
			} catch {
				reconciled = {
					ok: false,
					failure: {
						code: "unexpected-reconcile-failure",
						message: "Unexpected reconciliation failure.",
						phase: "read",
						cursorAdvanced: false,
					},
				};
			}
			let closeFailed = false;
			try {
				closeFailed = !(await store.close()).ok;
			} catch {
				closeFailed = true;
			}
			if (!reconciled.ok)
				return failure(
					"reconcile-failed",
					"Unable to reconcile Gitplane artifacts.",
					sanitizedFailureData(reconciled.failure, closeFailed),
				);
			if (closeFailed)
				return failure("reconcile-failed", "Unable to reconcile Gitplane artifacts.", {
					category: "store-close-failed",
					diagnostic: "The configured store could not be closed.",
					cursorAdvanced: reconciled.data.cursorAdvanced,
					targetCommit: reconciled.data.targetCommit,
				});
			return ok(reconciled.data);
		},
		renderHuman,
	});
}
