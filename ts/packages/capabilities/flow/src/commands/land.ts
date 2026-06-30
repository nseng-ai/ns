import { runLandCli } from "../land.ts";
import { createCommandIo } from "@sdl/kernel/command-io";
import {
	defineExtension,
	z,
	type SdlCommand,
	type SdlCommandIo,
	type SdlExtensionApi,
	type SdlNotifyLevel,
	type SdlProgressPhaseEvent,
} from "sdl-sdk";
import type { Caps } from "@sdl/clinkr";

import { runFlowCccCli } from "../shared/ccc-cli.ts";
import {
	createPhaseStreamController,
	flowStreamDeps,
	LAND_PHASES,
	resolveFlowStreamCaps,
} from "../shared/phase-stream.ts";

const landSchema = z.object({
	yes: z.boolean().optional().describe("Confirm stack landing without an interactive prompt."),
	dryRun: z.boolean().optional().describe("Show what would land without merging PRs."),
	free: z
		.boolean()
		.optional()
		.describe(
			"After successful landing, free the current managed slot and delete the landed local branch.",
		),
	force: z.boolean().optional().describe("Skip the post-landing --free confirmation."),
});

export const flowLandCommand: SdlCommand<typeof landSchema> = {
	name: "land",
	summary: "Land the current PR or Graphite stack into trunk.",
	description: "Land the current PR or Graphite stack into trunk.",
	schema: landSchema,
	run: async (ctx, request) => {
		// Resolve caps at the host-extension seam (house-style §1) and thread them ONLY into the CLI
		// edge so the settled land result blocks render in the house style; the shared Pi command-stream
		// path is never given caps and stays ANSI-free.
		const caps = resolveFlowStreamCaps(ctx);
		const rawArgs = [
			request.yes === true ? "--yes" : undefined,
			request.dryRun === true ? "--dry-run" : undefined,
			request.free === true ? "--free" : undefined,
			request.force === true ? "--force" : undefined,
		].filter((arg): arg is string => arg !== undefined);
		const progress = createLandCliProgress(ctx, caps);
		try {
			return await runFlowCccCli({
				ctx,
				successMessage: "Land completed.",
				failureMessage: "Land failed.",
				outputMode: "buffer-until-complete",
				afterExitCode: progress.finish,
				run: async (io) =>
					await runLandCli({
						cwd: ctx.cwd,
						rawArgs: rawArgs.join(" "),
						exec: io.exec,
						stdout: io.stdout,
						stderr: io.stderr,
						caps,
						progressIo: progress.io,
						...(ctx.confirm === undefined ? {} : { confirm: ctx.confirm }),
					}),
			});
		} finally {
			await progress.stop();
		}
	},
};

export default defineExtension({
	commands: [flowLandCommand],
});

interface LandCliProgress {
	io: SdlCommandIo;
	finish(exitCode: number): Promise<void>;
	stop(): Promise<void>;
}

export interface LandLiveProgressState {
	totalPrs?: number;
	landedPrs: number;
	totalChunks?: number;
	currentChunk?: number;
	currentChunkStart?: number;
	currentChunkEnd?: number;
}

interface LandChunkProgress {
	totalPrs: number;
	totalChunks: number;
	currentChunk: number;
	currentChunkStart: number;
	currentChunkEnd: number;
}

const BASE_LAND_TITLE = "sdl flow land";

export function formatLandProgressTitle(state: LandLiveProgressState): string {
	if (state.totalPrs === undefined) return BASE_LAND_TITLE;
	const parts = [`${BASE_LAND_TITLE} — ${state.landedPrs}/${state.totalPrs} PRs landed`];
	if (state.currentChunk !== undefined && state.totalChunks !== undefined) {
		let chunkPart = `chunk ${state.currentChunk}/${state.totalChunks}`;
		if (state.currentChunkStart !== undefined && state.currentChunkEnd !== undefined) {
			const prLabel = state.currentChunkStart === state.currentChunkEnd ? "PR" : "PRs";
			const range =
				state.currentChunkStart === state.currentChunkEnd
					? String(state.currentChunkStart)
					: `${state.currentChunkStart}-${state.currentChunkEnd}`;
			chunkPart = `${chunkPart}, ${prLabel} ${range}`;
		}
		parts.push(chunkPart);
	}
	return parts.join(" — ");
}

export function parseLandChunkProgress(text: string): LandChunkProgress | undefined {
	const match = /^Preparing chunk (\d+)\/(\d+), PRs? (\d+)(?:-(\d+))? of (\d+):/.exec(text);
	if (match === null) return undefined;
	const currentChunk = Number(match[1]);
	const totalChunks = Number(match[2]);
	const currentChunkStart = Number(match[3]);
	const currentChunkEnd = match[4] === undefined ? currentChunkStart : Number(match[4]);
	const totalPrs = Number(match[5]);
	if (
		!Number.isSafeInteger(currentChunk) ||
		!Number.isSafeInteger(totalChunks) ||
		!Number.isSafeInteger(currentChunkStart) ||
		!Number.isSafeInteger(currentChunkEnd) ||
		!Number.isSafeInteger(totalPrs)
	) {
		return undefined;
	}
	return { totalPrs, totalChunks, currentChunk, currentChunkStart, currentChunkEnd };
}

export function parseMergedPrNumber(text: string): number | undefined {
	const match = /^Merged and verified PR #(\d+)\b/.exec(text);
	if (match === null) return undefined;
	const number = Number(match[1]);
	return Number.isSafeInteger(number) ? number : undefined;
}

function createLandCliProgress(ctx: SdlExtensionApi, caps: Caps): LandCliProgress {
	// Land receives phase signals by parsing CCC-land CLI text, so the stream starts lazily only
	// after the first phase-worthy message. The shared controller owns lifecycle mechanics; this
	// adapter owns only land-specific text-to-phase routing.
	const progress = createPhaseStreamController({
		caps,
		specs: LAND_PHASES,
		deps: flowStreamDeps(ctx, caps),
		title: BASE_LAND_TITLE,
		begin: "lazy",
	});
	let lastPhaseKey: string | undefined;
	const liveState: LandLiveProgressState = { landedPrs: 0 };
	const landedPrNumbers = new Set<number>();

	function updateTitle(): void {
		progress.setTitle(formatLandProgressTitle(liveState));
	}

	function recordChunkProgress(text: string): void {
		const parsed = parseLandChunkProgress(text);
		if (parsed === undefined) return;
		liveState.totalPrs = parsed.totalPrs;
		liveState.totalChunks = parsed.totalChunks;
		liveState.currentChunk = parsed.currentChunk;
		liveState.currentChunkStart = parsed.currentChunkStart;
		liveState.currentChunkEnd = parsed.currentChunkEnd;
		updateTitle();
	}

	function recordMergedPr(text: string): void {
		const prNumber = parseMergedPrNumber(text);
		if (prNumber === undefined || landedPrNumbers.has(prNumber)) return;
		landedPrNumbers.add(prNumber);
		liveState.landedPrs += 1;
		updateTitle();
	}

	function emit(event: SdlProgressPhaseEvent): void {
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

	function routeMessage(message: string, level: SdlNotifyLevel): void {
		const normalized = message.trim();
		if (normalized === "") return;
		if (level === "error" || normalized.startsWith("✗")) {
			progress.note(normalized);
			return;
		}
		if (!normalized.startsWith("→ ")) return;
		const text = normalized.slice(2);
		if (text.startsWith("Preparing to land") || text.startsWith("Preparing chunk")) {
			recordChunkProgress(text);
			startPhase("preflight", text);
			return;
		}
		if (text.startsWith("Merging PR")) {
			startPhase("merge", text);
			return;
		}
		if (text.startsWith("Merged and verified PR")) {
			recordMergedPr(text);
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
		finish: async (exitCode) => {
			await progress.finish({ isFailed: exitCode !== 0 });
		},
		stop: progress.stop,
	};
}
