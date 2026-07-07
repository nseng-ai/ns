import { readFile } from "node:fs/promises";

import { truncatePlain } from "@nseng-ai/foundation/cli-theme";
import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type { CommandContext } from "@nseng-ai/pi/runtime/extension-types";

import { createRunnerSubagentJsonEventParser } from "../runner-subagents/json-events.ts";
import type {
	RunnerSubagentFleetRegistry,
	RunnerSubagentFleetTaskSnapshot,
} from "../runner-subagents/fleet.ts";
import type { ReadTextFileDependencies } from "./read-text-dependencies.ts";
import { AGENTS_COMMAND_NAMESPACE } from "./contract.ts";

export const AGENTS_TRANSCRIPT_COMMAND_NAME = `${AGENTS_COMMAND_NAMESPACE}:transcript`;

export interface TranscriptEntry {
	type: "assistant" | "tool" | "summary";
	text: string;
}

export interface TranscriptView {
	title: string;
	sessionFile: string;
	entries: readonly TranscriptEntry[];
}

export function registerAgentsTranscriptCommand(input: {
	pi: { registerCommand?: CommandRegistrar };
	registry: RunnerSubagentFleetRegistry;
	dependencies?: ReadTextFileDependencies;
}): void {
	if (input.pi.registerCommand === undefined) return;
	input.pi.registerCommand(AGENTS_TRANSCRIPT_COMMAND_NAME, {
		description: "Open a read-only transcript for a recent agents fleet child session.",
		async handler(_args, ctx) {
			await openAgentsTranscriptViewer({
				ctx,
				registry: input.registry,
				...(input.dependencies === undefined ? {} : { dependencies: input.dependencies }),
			});
		},
	});
}

export type CommandRegistrar = (
	name: string,
	options: {
		description?: string;
		handler(args: string, ctx: CommandContext): Promise<void> | void;
	},
) => void;

export async function openAgentsTranscriptViewer(input: {
	ctx: CommandContext;
	registry: RunnerSubagentFleetRegistry;
	dependencies?: ReadTextFileDependencies;
}): Promise<void> {
	const tasks = input.registry.tasksWithSessionFiles();
	if (tasks.length === 0) {
		input.ctx.ui.notify(
			"No subagent child session transcripts are known in this Pi session.",
			"info",
		);
		return;
	}
	const selected = await selectTranscriptTask(input.ctx, tasks);
	if (selected === undefined) return;
	const readTextFile =
		input.dependencies?.readTextFile ?? ((path: string) => readFile(path, "utf8"));
	let transcript: TranscriptView;
	try {
		transcript = parseSubagentTranscript({
			task: selected,
			jsonl: await readTextFile(selected.sessionFile!),
		});
	} catch (error) {
		input.ctx.ui.notify(
			`Could not read subagent transcript: ${formatErrorMessage(error)}`,
			"error",
		);
		return;
	}
	await showTranscript(input.ctx, transcript);
}

export function parseSubagentTranscript(input: {
	task: RunnerSubagentFleetTaskSnapshot;
	jsonl: string;
}): TranscriptView {
	const parser = createRunnerSubagentJsonEventParser({
		title: input.task.title,
		...(input.task.sessionFile === undefined ? {} : { sessionFile: input.task.sessionFile }),
	});
	parser.pushChunk(input.jsonl);
	parser.finish();
	const snapshot = parser.getSnapshot();
	const entries: TranscriptEntry[] = [];
	if (snapshot.finalAssistantText !== undefined) {
		entries.push({ type: "assistant", text: snapshot.finalAssistantText });
	} else if (snapshot.activity.assistantPreview !== undefined) {
		entries.push({ type: "assistant", text: snapshot.activity.assistantPreview });
	}
	if (snapshot.activity.lastToolName !== undefined) {
		const result = snapshot.activity.lastToolResultPreview;
		entries.push({
			type: "tool",
			text: `${snapshot.activity.lastToolName}${result === undefined ? "" : `: ${result}`}`,
		});
	}
	entries.push({
		type: "summary",
		text: `turns=${snapshot.progress.turnCount}, tools=${snapshot.progress.toolCount}, state=${snapshot.progress.state}`,
	});
	return {
		title: input.task.title,
		sessionFile: input.task.sessionFile ?? "",
		entries,
	};
}

async function selectTranscriptTask(
	ctx: CommandContext,
	tasks: readonly RunnerSubagentFleetTaskSnapshot[],
): Promise<RunnerSubagentFleetTaskSnapshot | undefined> {
	const labels = tasks.map(taskLabel);
	const selectedLabel =
		ctx.ui.select === undefined ? labels[0] : await ctx.ui.select("Subagent transcripts", labels);
	if (selectedLabel === undefined) return undefined;
	const index = labels.indexOf(selectedLabel);
	return tasks[index];
}

function taskLabel(task: RunnerSubagentFleetTaskSnapshot): string {
	return `${task.title} — ${task.finalStatus ?? task.state} — ${task.sessionFile ?? "no session"}`;
}

async function showTranscript(ctx: CommandContext, transcript: TranscriptView): Promise<void> {
	const markdown = renderTranscriptMarkdown(transcript, 100);
	if (ctx.ui.custom !== undefined) {
		await ctx.ui.custom(
			(_tui, _theme, _keybindings, done) => ({
				render(width: number) {
					return [
						...renderTranscriptMarkdown(transcript, width).split("\n"),
						"",
						truncatePlain("Press q or Esc to close.", Math.max(40, width)),
					];
				},
				handleInput(data: string) {
					if (data === "q" || data === "\u001b") done(undefined);
				},
				invalidate() {},
			}),
			{ overlay: true, overlayOptions: { title: "Subagent transcript" } },
		);
		return;
	}
	ctx.ui.notify(markdown, "info");
}

export function renderTranscriptMarkdown(transcript: TranscriptView, width: number): string {
	const maxWidth = Math.max(40, width);
	const lines = [
		`# ${transcript.title}`,
		`Session: ${transcript.sessionFile}`,
		"",
		...transcript.entries.flatMap((entry) => [
			`## ${entry.type}`,
			...entry.text.split("\n").map((line) => truncatePlain(line, maxWidth)),
			"",
		]),
	];
	return lines.join("\n");
}
