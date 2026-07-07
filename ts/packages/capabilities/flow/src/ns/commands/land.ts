import { runLandCli } from "../../land/land.ts";
import {
	BASE_LAND_TITLE,
	createLandMatrixProgressController,
	formatLandProgressTitle,
	type LandLiveProgressState,
	type LandMatrixProgressController,
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
	landRawArgsFromCommandRequest,
} from "../../land/stack/flags.ts";
import { createCommandIo } from "@nseng-ai/kernel/command-io";
import {
	defineExtension,
	z,
	type NsCommand,
	type NsCommandIo,
	type NsExtensionApi,
	type NsNotifyLevel,
	type NsProgressPhaseEvent,
} from "@nseng-ai/kernel/sdk";
import type { Caps } from "@nseng-ai/clinkr";
import { systemClock } from "@nseng-ai/foundation/time";

import { runFlowCli } from "../flow-cli-runner.ts";
import {
	createPhaseStreamController,
	flowStreamDeps,
	LAND_PHASES,
	resolveFlowStreamCaps,
} from "../../phase-stream/phase-stream.ts";

const landSchema = z.object(landCommandSchemaShape(z));

export const flowLandCommand: NsCommand<typeof landSchema> = {
	name: "land",
	summary: "Land the current PR or Graphite stack into trunk.",
	description: "Land the current PR or Graphite stack into trunk.",
	schema: landSchema,
	options: landCommandOptionSpecs(),
	run: async (ctx, request) => {
		// Resolve caps at the host-extension seam (house-style §1) and thread them ONLY into the CLI
		// edge so the settled land result blocks render in the house style; the shared Pi command-stream
		// path is never given caps and stays ANSI-free.
		const caps = resolveFlowStreamCaps(ctx);
		const telemetry = createFlowLandTelemetryRun({ env: ctx.env, clock: systemClock });
		let telemetryFinish: FlowLandTelemetryRunFinish | undefined;
		const rawArgs = landRawArgsFromCommandRequest(request);
		const progress = caps.isTty
			? createLandMatrixCliProgress(ctx, caps)
			: createLandCliProgress(ctx, caps);
		try {
			const result = await runFlowCli({
				ctx,
				successMessage: "Land completed.",
				failureMessage: "Land failed.",
				outputMode: "buffer-until-complete",
				shouldForwardLiveOutput: request.verbose === true,
				afterExitCode: async (exitCode) => {
					telemetryFinish = await telemetry.finish(exitCode);
					await progress.finish(exitCode);
					progress.flushFailureDetails(exitCode);
				},
				run: async (io) =>
					await runLandCli({
						cwd: ctx.cwd,
						rawArgs: rawArgs.join(" "),
						exec: io.exec,
						stdout: io.stdout,
						stderr: io.stderr,
						caps,
						progressIo: progress.io,
						liveProgress: progress.liveProgress,
						...(progress.landMatrix === undefined ? {} : { landMatrix: progress.landMatrix }),
						externalCallTelemetry: telemetry.sink,
						...(ctx.confirm === undefined ? {} : { confirm: ctx.confirm }),
					}),
			});
			if (request.verbose === true && telemetryFinish !== undefined) {
				ctx.stderr?.(`${formatFlowLandTelemetrySummary(telemetryFinish)}\n`);
			}
			return result;
		} finally {
			await progress.stop();
		}
	},
};

export default defineExtension({
	commands: [flowLandCommand],
});

interface LandCliProgress {
	io: NsCommandIo;
	liveProgress: LandLiveProgressSink;
	landMatrix?: LandMatrixProgressController;
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

	function recordFailureDetail(message: string): void {
		const normalized = message.trim();
		if (normalized === "" || seenFailureDetails.has(normalized)) return;
		seenFailureDetails.add(normalized);
		failureDetails.push(normalized);
	}

	function routeMessage(message: string, level: NsNotifyLevel): void {
		const normalized = message.trim();
		if (normalized === "") return;
		if (level === "error" || normalized.startsWith("✗")) {
			if (level === "error" || !normalized.startsWith("✗ $")) {
				recordFailureDetail(normalized);
			}
			matrix.note(normalized);
			return;
		}
		if (normalized.startsWith("→ ")) {
			matrix.note(normalized.slice(2));
		}
	}

	return {
		io: createCommandIo({
			phaseTransient: (message) => {
				if (!message.trim().startsWith("land: running ")) matrix.note(message);
			},
			notifyUi: (message, level = "info") => {
				routeMessage(message, level);
			},
			richMessage: (message, options) => {
				routeMessage(message, options.level);
			},
		}),
		liveProgress: (event) => matrix.recordMergedPr(event.prNumber),
		landMatrix: matrix,
		finish: async (exitCode) => {
			await matrix.finish({ isFailed: exitCode !== 0 });
		},
		flushFailureDetails: (exitCode) => {
			if (exitCode === 0 || failureDetails.length === 0) return;
			ctx.stderr?.(`${failureDetails.join("\n\n")}\n`);
		},
		stop: matrix.stop,
	};
}

function createLandCliProgress(ctx: NsExtensionApi, caps: Caps): LandCliProgress {
	// Land receives generic phase signals from command-stream text, so the stream starts lazily only
	// after the first phase-worthy message. Structured Flow live-progress events drive the title.
	// The shared controller owns lifecycle mechanics; this adapter owns only land-specific routing.
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

	function updateTitle(): void {
		progress.setTitle(formatLandProgressTitle(liveState));
	}

	function recordLiveProgress(event: LandLiveProgressEvent): void {
		if (landedPrNumbers.has(event.prNumber)) return;
		landedPrNumbers.add(event.prNumber);
		liveState.landedPrs += 1;
		updateTitle();
	}

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

	function recordFailureDetail(message: string): void {
		const normalized = message.trim();
		if (normalized === "" || seenFailureDetails.has(normalized)) return;
		seenFailureDetails.add(normalized);
		failureDetails.push(normalized);
	}

	function routePhase(message: string): void {
		const normalized = message.trim();
		if (normalized === "" || normalized.startsWith("land: running ")) return;
		if (normalized.startsWith("preflighting")) {
			startPhase("preflight", "checking stack and PRs…");
			return;
		}
		if (normalized.startsWith("rechecking preflight")) {
			startPhase("preflight", "rechecking landing preflight…");
			return;
		}
		if (normalized.startsWith("submitting ") || normalized.startsWith("restacking ")) {
			startPhase("refresh", normalized.endsWith("...") ? normalized : `${normalized}…`);
			return;
		}
		if (normalized.startsWith("freeing ") || normalized.startsWith("deleting ")) {
			startPhase("cleanup", normalized.endsWith("...") ? normalized : `${normalized}…`);
			return;
		}
		if (normalized.startsWith("Running gh pr merge")) {
			startPhase("merge", normalized);
		}
	}

	function routeMessage(message: string, level: NsNotifyLevel): void {
		const normalized = message.trim();
		if (normalized === "") return;
		if (level === "error" || normalized.startsWith("✗")) {
			if (level === "error" || !normalized.startsWith("✗ $")) {
				recordFailureDetail(normalized);
			}
			progress.note(normalized);
			return;
		}
		if (!normalized.startsWith("→ ")) return;
		const text = normalized.slice(2);
		if (text.startsWith("Preparing to land")) {
			startPhase("preflight", text);
			return;
		}
		if (text.startsWith("Merging PR")) {
			startPhase("merge", text);
			return;
		}
		if (text.startsWith("Merged and verified PR")) {
			startPhase("merge", text);
			return;
		}
		if (text.startsWith("Refreshing stack") || text.startsWith("Rechecking landing preflight")) {
			startPhase("refresh", text);
			return;
		}
		if (text.startsWith("Cleaning up local branch")) {
			startPhase("cleanup", text);
		}
	}

	return {
		io: createCommandIo({
			phaseTransient: routePhase,
			notifyUi: (message, level = "info") => {
				routeMessage(message, level);
			},
			richMessage: (message, options) => {
				routeMessage(message, options.level);
			},
		}),
		liveProgress: recordLiveProgress,
		finish: async (exitCode) => {
			await progress.finish({ isFailed: exitCode !== 0 });
		},
		flushFailureDetails: (exitCode) => {
			if (exitCode === 0 || failureDetails.length === 0) return;
			ctx.stderr?.(`${failureDetails.join("\n\n")}\n`);
		},
		stop: progress.stop,
	};
}
