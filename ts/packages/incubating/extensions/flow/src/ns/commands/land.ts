import { defineCommand, failure, negative, ok, z, type NsCommand } from "@nseng-ai/sdk";
import { runWithNsCommandIo } from "@nseng-ai/sdk/command-io";
import { resolveThemeCaps } from "@nseng-ai/foundation/cli-theme";
import { systemClock } from "@nseng-ai/foundation/time";

import { runLandWorkflow, type FlowLandWorkflowResult } from "../../land/land.ts";
import { landCommandSuccess, renderLandWorkflowResult } from "../../land/command-result.ts";
import {
	BASE_LAND_TITLE,
	createLandMatrixProgressController,
	formatLandProgressTitle,
	LAND_MATRIX_COLUMNS,
	LAND_MATRIX_LABEL_HEADER,
	type LandLiveProgressState,
	type LandMatrixProgressSink,
} from "../../land/land-matrix-progress.ts";
export { formatLandProgressTitle } from "../../land/land-matrix-progress.ts";
import type {
	LandLiveProgressEvent,
	LandLiveProgressSink,
} from "../../land/stack/command-stream.ts";
import {
	createFlowLandTelemetryRun,
	type FlowLandTelemetryRunFinish,
} from "../../land/stack/external-call-telemetry-run.ts";
import { formatFlowLandTelemetrySummary } from "../../land/stack/external-call-telemetry-summary.ts";
import {
	landCommandOptionSpecs,
	landCommandSchemaShape,
	landParsedArgsFromCommandRequest,
} from "../../land/stack/flags.ts";
import { createCommandIo } from "@nseng-ai/sdk/command-io";
import type {
	NsCommandIo,
	NsExtensionApi,
	NsNotifyLevel,
	NsProgress,
	NsProgressPhaseEvent,
} from "@nseng-ai/sdk";
import type { Caps } from "@nseng-ai/clinkr";

import { runFlowCliOperation, FLOW_COMMAND_FAILED } from "../flow-cli-runner.ts";
import { createMatrixProgressForwarder } from "../../phase-stream/matrix-progress-forwarder.ts";
import {
	createPhaseStreamController,
	flowStreamDeps,
	LAND_PHASES,
	resolveFlowStreamCaps,
} from "../../phase-stream/phase-stream.ts";

const landSchema = z.object(landCommandSchemaShape(z));
const pullRequestSchema = z.object({ number: z.number(), branch: z.string(), base: z.string() });
const cleanupSchema = z.object({ type: z.string() }).passthrough();
const continuationSchema = z.object({ type: z.string() }).passthrough();
const landedChunkSchema = z.object({
	index: z.number(),
	landingTargetBranch: z.string(),
	landed: z.array(
		z.object({
			branch: z.string(),
			number: z.number(),
			title: z.string(),
			url: z.string().optional(),
		}),
	),
});
const landSuccessSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("dry-run"),
		target: z.union([z.literal("stack"), z.literal("single-branch")]),
		repoRoot: z.string(),
		pullRequest: pullRequestSchema.optional(),
		plan: z
			.object({
				trunk: z.string(),
				landingTargetBranch: z.string(),
				branches: z.array(z.object({ branch: z.string(), pullRequestNumber: z.number() })),
			})
			.optional(),
		continuation: continuationSchema,
	}),
	z.object({
		type: z.union([z.literal("stack-completed"), z.literal("cleanup-only")]),
		repoRoot: z.string(),
		landedChunks: z.array(landedChunkSchema),
		warnings: z.array(z.string()),
		cleanup: cleanupSchema,
		continuation: continuationSchema,
	}),
	z.object({
		type: z.literal("single-branch-landed"),
		repoRoot: z.string(),
		pullRequest: pullRequestSchema,
		cleanup: cleanupSchema,
	}),
]);

export const flowLandCommand: NsCommand<typeof landSchema> = defineCommand({
	schema: landSchema,
	resultSchema: landSuccessSchema,
	options: landCommandOptionSpecs(),
	renderHuman: (result, caps) => renderLandSuccess(resolveThemeCaps(caps), result),
	handler: async (ctx, request) => {
		const caps = resolveFlowStreamCaps(ctx);
		const telemetry = createFlowLandTelemetryRun({ env: ctx.env, clock: systemClock });
		let telemetryFinish: FlowLandTelemetryRunFinish | undefined;
		const progress = caps.isTty
			? createLandMatrixCliProgress(ctx, caps)
			: createLandCliProgress(ctx, caps);
		try {
			const result = await runFlowCliOperation({
				ctx,
				shouldForwardLiveOutput: request.verbose === true,
				run: async (io) =>
					await runWithNsCommandIo(
						progress.io,
						async () =>
							await runLandWorkflow({
								cwd: ctx.cwd,
								request: landParsedArgsFromCommandRequest(request),
								exec: io.exec,
								progressIo: progress.io,
								liveProgress: progress.liveProgress,
								...(progress.landMatrix === undefined ? {} : { landMatrix: progress.landMatrix }),
								externalCallTelemetry: telemetry.sink,
								...(ctx.confirm === undefined ? {} : { confirm: ctx.confirm }),
								...(ctx.select === undefined ? {} : { select: ctx.select }),
							}),
					),
			});
			const exit = landCommandExit(caps, result);
			const exitCode = exit.status === "success" ? 0 : exit.status === "negative" ? 1 : 2;
			telemetryFinish = await telemetry.finish(exitCode);
			await progress.finish(exitCode);
			progress.flushFailureDetails(exitCode);
			if (request.verbose === true) {
				ctx.stderr?.(`${formatFlowLandTelemetrySummary(telemetryFinish)}\n`);
			}
			return exit;
		} finally {
			await progress.stop();
		}
	},
});

function landCommandExit(caps: Caps, result: FlowLandWorkflowResult) {
	const human = renderLandWorkflowResult(caps, result);
	if (result.type === "failed") {
		return isRefusal(result.failure)
			? negative(human, { data: result })
			: failure(FLOW_COMMAND_FAILED, human, result);
	}
	if (result.type === "stack" && result.execution.type === "failed") {
		return isRefusal(result.execution.failure)
			? negative(human, { data: result.execution })
			: failure(FLOW_COMMAND_FAILED, human, result.execution);
	}
	if (
		result.type === "stack" &&
		result.execution.type === "completed" &&
		result.execution.report.completionDisposition.type === "nothing-to-land"
	) {
		return negative(human, { data: result.execution.report });
	}
	const data = landCommandSuccess(result);
	if (data === undefined) return failure(FLOW_COMMAND_FAILED, human);
	return ok(landSuccessSchema.parse(data));
}

function isRefusal(failureValue: import("../../land/types.ts").LandingFailure): boolean {
	return (
		(failureValue.type === "execution" && failureValue.outcome === "refusal") ||
		(failureValue.type === "domain" && failureValue.reason === "nothing-to-land")
	);
}

function renderLandSuccess(caps: Caps, result: z.infer<typeof landSuccessSchema>): string {
	if (result.type === "dry-run") {
		return result.target === "single-branch" && result.pullRequest !== undefined
			? renderLandWorkflowResult(caps, {
					type: "single-branch-dry-run",
					repoRoot: result.repoRoot,
					pullRequest: {
						id: "",
						number: result.pullRequest.number,
						title: "",
						body: null,
						state: "OPEN",
						isDraft: false,
						headRefName: result.pullRequest.branch,
						baseRefName: result.pullRequest.base,
						headRefOid: "",
					},
				})
			: `Dry run complete for ${result.plan?.branches.length ?? 0} PRs.`;
	}
	if (result.type === "single-branch-landed") {
		return `Merged PR #${result.pullRequest.number} from ${result.pullRequest.branch}.`;
	}
	return result.type === "cleanup-only"
		? "Landing cleanup completed."
		: `Landed ${result.landedChunks.flatMap((chunk) => chunk.landed).length} PRs.`;
}

export default flowLandCommand;

interface LandCliProgress {
	io: NsCommandIo;
	liveProgress: LandLiveProgressSink;
	landMatrix?: LandMatrixProgressSink;
	finish(exitCode: number): Promise<void>;
	flushFailureDetails(exitCode: number): void;
	stop(): Promise<void>;
}

function createLandMatrixCliProgress(ctx: NsExtensionApi, caps: Caps): LandCliProgress {
	const matrix = createLandMatrixProgressController({
		caps,
		deps: flowStreamDeps(ctx, caps),
		...(ctx.progress.isLive ? { forward: ctx.progress } : {}),
	});
	const failureDetails: string[] = [];
	const seenFailureDetails = new Set<string>();
	function routeMessage(message: string, level: NsNotifyLevel): void {
		const normalized = message.trim();
		if (normalized === "") return;
		if (level === "error" || normalized.startsWith("✗")) {
			if (level === "error" || !normalized.startsWith("✗ $")) {
				if (!seenFailureDetails.has(normalized)) failureDetails.push(normalized);
				seenFailureDetails.add(normalized);
			}
			matrix.note(normalized);
			return;
		}
		if (normalized.startsWith("→ ")) matrix.note(normalized.slice(2));
	}
	return {
		io: createCommandIo({
			phaseTransient: (message) => {
				if (!message.trim().startsWith("land: running ")) matrix.note(message);
			},
			notifyUi: (message, level = "info") => routeMessage(message, level),
			richMessage: (message, options) => routeMessage(message, options.level),
		}),
		liveProgress: (event) => matrix.recordMergedPr(event.prNumber),
		landMatrix: matrix,
		finish: async (exitCode) => await matrix.finish({ isFailed: exitCode !== 0 }),
		flushFailureDetails: (exitCode) => {
			if (exitCode !== 0 && failureDetails.length > 0)
				ctx.stderr?.(`${failureDetails.join("\n\n")}\n`);
		},
		stop: matrix.stop,
	};
}

export function createLandCliProgress(ctx: NsExtensionApi, caps: Caps): LandCliProgress {
	const progress = createPhaseStreamController({
		caps,
		specs: LAND_PHASES,
		deps: flowStreamDeps(ctx, caps),
		forward: ctx.progress,
		title: BASE_LAND_TITLE,
		begin: "lazy",
	});
	let lastPhaseKey: string | undefined;
	const liveState: LandLiveProgressState = { landedPrs: 0 };
	const landedPrNumbers = new Set<number>();
	const failureDetails: string[] = [];
	const seenFailureDetails = new Set<string>();
	function emit(event: NsProgressPhaseEvent): void {
		progress.emit(event);
		if (event.type === "phase-started") lastPhaseKey = event.phaseKey;
	}
	function startPhase(phaseKey: string, label?: string): void {
		if (lastPhaseKey === phaseKey) {
			if (label !== undefined) emit({ type: "phase-progress", phaseKey, label });
			return;
		}
		emit({ type: "phase-started", phaseKey, ...(label === undefined ? {} : { label }) });
	}
	function routeMessage(message: string, level: NsNotifyLevel): void {
		const normalized = message.trim();
		if (normalized === "") return;
		if (level === "error" || normalized.startsWith("✗")) {
			if (level === "error" || !normalized.startsWith("✗ $")) {
				if (!seenFailureDetails.has(normalized)) failureDetails.push(normalized);
				seenFailureDetails.add(normalized);
			}
			progress.note(normalized);
			return;
		}
		const text = normalized.startsWith("→ ") ? normalized.slice(2) : normalized;
		if (text.startsWith("Preparing to land") || text.startsWith("preflighting"))
			startPhase("preflight", text);
		else if (text.startsWith("Merging PR") || text.startsWith("Running gh pr merge"))
			startPhase("merge", text);
		else if (
			text.startsWith("Refreshing stack") ||
			text.startsWith("submitting ") ||
			text.startsWith("restacking ")
		)
			startPhase("refresh", text);
		else if (
			text.startsWith("Cleaning up local branch") ||
			text.startsWith("freeing ") ||
			text.startsWith("deleting ")
		)
			startPhase("cleanup", text);
	}
	const landMatrix = ctx.progress.isLive ? createLandMatrixEventForwarder(ctx.progress) : undefined;
	return {
		io: createCommandIo({
			phaseTransient: (message) => {
				if (!message.trim().startsWith("land: running ")) routeMessage(message, "info");
			},
			notifyUi: (message, level = "info") => routeMessage(message, level),
			richMessage: (message, options) => routeMessage(message, options.level),
		}),
		liveProgress: (event: LandLiveProgressEvent) => {
			if (landedPrNumbers.has(event.prNumber)) return;
			landedPrNumbers.add(event.prNumber);
			liveState.landedPrs += 1;
			progress.setTitle(formatLandProgressTitle(liveState));
		},
		...(landMatrix === undefined ? {} : { landMatrix }),
		finish: async (exitCode) => await progress.finish({ isFailed: exitCode !== 0 }),
		flushFailureDetails: (exitCode) => {
			if (exitCode !== 0 && failureDetails.length > 0)
				ctx.stderr?.(`${failureDetails.join("\n\n")}\n`);
		},
		stop: progress.stop,
	};
}

export function createLandMatrixEventForwarder(progress: NsProgress): LandMatrixProgressSink {
	const forwarder = createMatrixProgressForwarder({
		progress,
		columns: LAND_MATRIX_COLUMNS,
		labelHeader: LAND_MATRIX_LABEL_HEADER,
	});
	return {
		setRows: (rows) =>
			forwarder.setRows(rows.map((row) => ({ rowKey: row.branch, label: row.label }))),
		setActiveOperations: forwarder.setActiveOperations,
		setCell: forwarder.setCell,
		setAllCells: forwarder.setAllCells,
		setAllOtherCells: forwarder.setAllOtherCells,
		recordMergedPr: () => {},
	};
}
