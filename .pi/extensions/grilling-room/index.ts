import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import {
	buildKickoffPrompt,
	createGrillingRoomRuntime,
	FINALIZE_REPORT_PROMPT,
	type GrillingRoomRuntime,
} from "./child-session.ts";
import {
	createRunDirectoryPath,
	listRecentRunDirectories,
	resolveRunScope,
	shortenHome,
	type GrillingRunScope,
	type RecentRunDirectory,
} from "./paths.ts";
import { openGrillingRoomUI } from "./ui.ts";
import { parseReport, reportExists, topicFromFocus, writeBrief, writeReport } from "./report.ts";

const COMMAND_NAME = "harness:griller";
const CUSTOM_MESSAGE_TYPE = "grilling-room";
const STATUS_KEY = "grilling-room";
const FINALIZE_TIMEOUT_MS = 120_000;
const MAX_RECENT_RUNS = 12;

interface RunChoice {
	label: string;
	run: RecentRunDirectory;
	topic: string;
	nativeSessionPath?: string;
}

export default function grillingRoomExtension(pi: ExtensionAPI): void {
	pi.registerMessageRenderer(CUSTOM_MESSAGE_TYPE, (message, { expanded }, theme) => {
		const details = message.details as { runDir?: string; reportPath?: string; sessionFile?: string } | undefined;
		let text = theme.fg("accent", theme.bold("Grilling Room")) + "\n" + String(message.content);
		if (expanded && details) {
			text += `\n${theme.fg("dim", JSON.stringify(details, null, 2))}`;
		}
		const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));
		box.addChild(new Text(text, 0, 0));
		return box;
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Open the Grilling Room subharness",
		handler: async (args, ctx) => {
			try {
				await handleGrillerCommand(pi, ctx, args);
			} catch (error) {
				ctx.ui.notify(`Grilling Room failed: ${errorMessage(error)}`, "error");
			}
		},
	});
}

async function handleGrillerCommand(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string): Promise<void> {
	await ctx.waitForIdle();

	if (!ctx.hasUI) {
		ctx.ui.notify(`/${COMMAND_NAME} requires interactive Pi UI for the prototype.`, "error");
		return;
	}

	const scope = await resolveRunScope((command, commandArgs, options) => pi.exec(command, commandArgs, options), ctx.cwd);
	const focus = args.trim();
	if (focus.length > 0) {
		await startNewRun(pi, ctx, scope, focus);
		return;
	}

	await chooseRunOrStartNew(pi, ctx, scope);
}

async function chooseRunOrStartNew(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	scope: GrillingRunScope,
): Promise<void> {
	const choices = await buildRunChoices(scope);
	const startNewLabel = "Start a new Grilling Room run…";
	const labels = [startNewLabel, ...choices.map((choice) => choice.label)];
	const selected = await ctx.ui.select("Grilling Room", labels);
	if (!selected) return;

	if (selected === startNewLabel) {
		const focus = await ctx.ui.editor("Grilling Room focus/context", "");
		if (!focus?.trim()) return;
		await startNewRun(pi, ctx, scope, focus.trim());
		return;
	}

	const choice = choices.find((item) => item.label === selected);
	if (!choice) return;
	await resumeRun(pi, ctx, choice);
}

async function buildRunChoices(scope: GrillingRunScope): Promise<RunChoice[]> {
	const recentRuns = (await listRecentRunDirectories(scope)).slice(0, MAX_RECENT_RUNS);
	const choices: RunChoice[] = [];
	for (const run of recentRuns) {
		try {
			const parsed = await parseReport(run.reportPath);
			const status = parsed.status ? ` — ${parsed.status}` : "";
			choices.push({
				label: `${parsed.topic}${status} (${run.runId})`,
				run,
				topic: parsed.topic,
				nativeSessionPath: parsed.nativeSessionPath,
			});
		} catch {
			choices.push({
				label: `${run.runId} — partially recoverable`,
				run,
				topic: run.runId,
			});
		}
	}
	return dedupeLabels(choices);
}

async function startNewRun(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	scope: GrillingRunScope,
	focus: string,
): Promise<void> {
	const topic = topicFromFocus(focus);
	const runDir = createRunDirectoryPath(scope, focus);
	await mkdir(runDir, { recursive: true });

	const briefPath = path.join(runDir, "brief.md");
	const reportPath = path.join(runDir, "report.md");
	await writeBrief(briefPath, {
		focus,
		cwd: ctx.cwd,
		branch: scope.branch,
		parentSessionPath: ctx.sessionManager.getSessionFile(),
	});

	ctx.ui.notify(`Creating Grilling Room run: ${shortenHome(runDir)}`, "info");
	const runtime = await createGrillingRoomRuntime(pi, ctx, { topic, runDir, briefPath, reportPath });
	await runRoomLifecycle(pi, ctx, runtime, buildKickoffPrompt(briefPath));
}

async function resumeRun(pi: ExtensionAPI, ctx: ExtensionCommandContext, choice: RunChoice): Promise<void> {
	if (!choice.nativeSessionPath) {
		ctx.ui.notify(`Cannot resume ${choice.run.runId}: report.md has no Native Pi session line.`, "error");
		return;
	}

	const runDir = choice.run.runDir;
	const briefPath = path.join(runDir, "brief.md");
	const reportPath = choice.run.reportPath;
	ctx.ui.notify(`Resuming Grilling Room run: ${shortenHome(runDir)}`, "info");
	const runtime = await createGrillingRoomRuntime(pi, ctx, {
		topic: choice.topic,
		runDir,
		briefPath,
		reportPath,
		existingSessionPath: choice.nativeSessionPath,
	});
	await runRoomLifecycle(pi, ctx, runtime);
}

async function runRoomLifecycle(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	runtime: GrillingRoomRuntime,
	kickoffPrompt?: string,
): Promise<void> {
	try {
		while (true) {
			await openGrillingRoomUI(ctx, runtime, kickoffPrompt);
			kickoffPrompt = undefined;
			const shouldExit = await handleStreamingExit(ctx, runtime);
			if (shouldExit) break;
		}

		await finalizeReport(ctx, runtime);
		await ensureFallbackReport(runtime);
		pi.sendMessage({
			customType: CUSTOM_MESSAGE_TYPE,
			display: true,
			content: [
				"Grilling Room completed.",
				"",
				`Report: ${runtime.reportPath}`,
				`Artifacts: ${runtime.runDir}`,
				`Native child session: ${runtime.nativeSessionPath}`,
			].join("\n"),
			details: {
				runDir: runtime.runDir,
				reportPath: runtime.reportPath,
				sessionFile: runtime.nativeSessionPath,
			},
		});
		ctx.ui.notify(`Grilling Room report: ${shortenHome(runtime.reportPath)}`, "info");
	} finally {
		runtime.session.dispose();
	}
}

async function handleStreamingExit(ctx: ExtensionCommandContext, runtime: GrillingRoomRuntime): Promise<boolean> {
	if (!runtime.session.isStreaming) return true;

	const choice = await ctx.ui.select("Child session is still streaming", [
		"Wait for the child turn, then exit",
		"Abort the child turn and exit",
		"Cancel exit and return to the room",
	]);
	if (!choice || choice.startsWith("Cancel")) return false;
	if (choice.startsWith("Abort")) {
		await runtime.session.abort();
		return true;
	}
	await waitForChildIdle(runtime);
	return true;
}

async function finalizeReport(ctx: ExtensionCommandContext, runtime: GrillingRoomRuntime): Promise<void> {
	if (runtime.session.isStreaming) {
		await waitForChildIdle(runtime);
	}

	ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", "finalizing Grilling Room report…"));
	const promptPromise = runtime.session.prompt(FINALIZE_REPORT_PROMPT);
	try {
		const timedOut = await Promise.race([
			promptPromise.then(() => false),
			sleep(FINALIZE_TIMEOUT_MS).then(() => true),
		]);
		if (!timedOut) return;

		const choice = await ctx.ui.select("Report finalization is still running", [
			"Wait for finalization",
			"Abort finalization and use current report",
		]);
		if (choice?.startsWith("Wait")) {
			await promptPromise;
			return;
		}
		await runtime.session.abort();
		await promptPromise.catch(() => undefined);
	} catch (error) {
		ctx.ui.notify(`Report finalization failed: ${errorMessage(error)}`, "warning");
	} finally {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	}
}

async function ensureFallbackReport(runtime: GrillingRoomRuntime): Promise<void> {
	if (await reportExists(runtime.reportPath)) return;
	await writeReport(
		{
			...runtime.reportMetadata,
			status: "Final (host fallback)",
		},
		runtime.mapStore.map,
	);
}

async function waitForChildIdle(runtime: GrillingRoomRuntime): Promise<void> {
	while (runtime.session.isStreaming) {
		await sleep(100);
	}
}

function dedupeLabels(choices: RunChoice[]): RunChoice[] {
	const seen = new Map<string, number>();
	return choices.map((choice) => {
		const count = seen.get(choice.label) ?? 0;
		seen.set(choice.label, count + 1);
		if (count === 0) return choice;
		return { ...choice, label: `${choice.label} #${count + 1}` };
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
