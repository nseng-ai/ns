import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

const OBJECTIVE_LIST_TIMEOUT_MS = 30_000;
const SKILL_NAME = "objective-next";
const MAX_ERROR_CHARS = 4_000;

type NotifyLevel = "info" | "warning" | "error";

type ExecResult = {
	stdout: string;
	stderr: string;
	code: number;
	killed: boolean;
};

type CommandInfo = {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		baseDir?: string;
	};
};

type CommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		select(title: string, items: string[]): Promise<string | undefined>;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
};

type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
	getCommands(): CommandInfo[];
	sendUserMessage(content: string): void;
};

type ObjectiveEntry = {
	slug: string;
	path: string;
	updateCount: number;
};

type ObjectiveList = {
	rootPath: string;
	rootExists: boolean;
	entries: ObjectiveEntry[];
};

function stripFrontmatter(markdown: string): string {
	return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

function truncateTail(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}

	return `[Output truncated to the last ${maxChars} characters.]\n\n${text.slice(text.length - maxChars)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseObjectiveEntry(value: unknown, index: number): ObjectiveEntry {
	if (!isRecord(value)) {
		throw new Error(`Invalid Objective list entry at index ${index}: expected an object.`);
	}

	const slug = value.slug;
	const path = value.path;
	const updateCount = value.update_count;
	if (typeof slug !== "string" || typeof path !== "string" || typeof updateCount !== "number") {
		throw new Error(
			`Invalid Objective list entry at index ${index}: expected slug, path, and update_count.`,
		);
	}

	return { slug, path, updateCount };
}

function parseObjectiveList(stdout: string): ObjectiveList {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse objective list JSON: ${message}`);
	}

	if (!isRecord(parsed)) {
		throw new Error("Invalid objective list JSON: expected an envelope object.");
	}

	const envelopeExitCode = parsed.exit_code;
	if (typeof envelopeExitCode === "number" && envelopeExitCode !== 0) {
		throw new Error(`objective list returned envelope exit_code ${envelopeExitCode}.`);
	}

	const data = parsed.data;
	if (!isRecord(data)) {
		throw new Error("Invalid objective list JSON: expected a data object.");
	}

	const rootPath = data.root_path;
	const rootExists = data.root_exists;
	const entries = data.entries;
	if (typeof rootPath !== "string" || typeof rootExists !== "boolean" || !Array.isArray(entries)) {
		throw new Error("Invalid objective list JSON: expected root_path, root_exists, and entries.");
	}

	return {
		rootPath,
		rootExists,
		entries: entries.map(parseObjectiveEntry),
	};
}

function formatObjectiveListFailure(result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const stdout = result.stdout.trimEnd() || "(empty)";
	const stderr = result.stderr.trimEnd() || "(empty)";
	return truncateTail(`objective list failed (${status}).\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`, MAX_ERROR_CHARS);
}

async function listOpenObjectives(pi: ExtensionAPI, ctx: CommandContext): Promise<ObjectiveList> {
	if (ctx.hasUI) {
		ctx.ui.setStatus("objective-next", "listing open Objectives…");
	}

	let result: ExecResult;
	try {
		result = await pi.exec("objective", ["list", "--state", "open", "--format", "json"], {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_LIST_TIMEOUT_MS,
		});
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus("objective-next", undefined);
		}
	}

	if (result.code !== 0 || result.killed) {
		throw new Error(formatObjectiveListFailure(result));
	}

	return parseObjectiveList(result.stdout);
}

async function expandSkill(pi: ExtensionAPI): Promise<{ name: string; block: string } | undefined> {
	const command = pi
		.getCommands()
		.find((candidate) => candidate.source === "skill" && candidate.name === `skill:${SKILL_NAME}`);
	if (!command) {
		return undefined;
	}

	const skillPath = command.sourceInfo.path;
	const baseDir = command.sourceInfo.baseDir ?? dirname(skillPath);
	const body = stripFrontmatter(await readFile(skillPath, "utf8"));
	return {
		name: SKILL_NAME,
		block: `<skill name="${SKILL_NAME}" location="${skillPath}">\nReferences are relative to ${baseDir}.\n\n${body}\n</skill>`,
	};
}

function buildObjectiveNextPrompt(skillBlock: string | undefined, objective: string): string {
	const fallback =
		"The objective-next skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: recommend the next useful work for the explicit Objective below without mutating files.";

	return `${skillBlock ?? fallback}

Run objective-next for this explicitly selected Objective slug or path:

\`\`\`text
${objective}
\`\`\`

Treat this as an explicit user selection. Do not auto-select a different Objective.`;
}

function formatObjectiveChoice(entry: ObjectiveEntry): string {
	const updateLabel = entry.updateCount === 1 ? "1 update" : `${entry.updateCount} updates`;
	return `${entry.slug} — ${updateLabel} — ${entry.path}`;
}

async function invokeObjectiveNext(pi: ExtensionAPI, ctx: CommandContext, objective: string): Promise<void> {
	await ctx.waitForIdle();

	const skill = await expandSkill(pi);
	if (ctx.hasUI) {
		ctx.ui.notify(
			skill ? `Invoking ${skill.name} for ${objective}.` : "objective-next skill was not found; using fallback prompt.",
			skill ? "info" : "warning",
		);
	}

	pi.sendUserMessage(buildObjectiveNextPrompt(skill?.block, objective));
}

async function chooseObjectiveAndInvoke(pi: ExtensionAPI, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	const objectiveList = await listOpenObjectives(pi, ctx);
	if (objectiveList.entries.length === 0) {
		if (ctx.hasUI) {
			ctx.ui.notify("No open Objectives. Create one with /skill:objective-create.", "info");
		}
		return;
	}

	if (!ctx.hasUI) {
		return;
	}

	const choices = new Map<string, string>();
	for (const entry of objectiveList.entries) {
		choices.set(formatObjectiveChoice(entry), entry.slug);
	}

	const selected = await ctx.ui.select("Select an open Objective", [...choices.keys()]);
	if (!selected) {
		ctx.ui.notify("Objective selection cancelled.", "info");
		return;
	}

	const slug = choices.get(selected);
	if (!slug) {
		ctx.ui.notify("Objective selection could not be resolved.", "error");
		return;
	}

	await invokeObjectiveNext(pi, ctx, slug);
}

async function handleObjectiveNext(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	const explicitObjective = args.trim();
	try {
		if (explicitObjective) {
			await invokeObjectiveNext(pi, ctx, explicitObjective);
			return;
		}

		await chooseObjectiveAndInvoke(pi, ctx);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (ctx.hasUI) {
			ctx.ui.notify(message, "error");
		}
	}
}

export default function objectiveNextExtension(pi: ExtensionAPI): void {
	pi.registerCommand("objective-next", {
		description: "Pick an open Objective, then invoke objective-next for the selected slug.",
		handler: async (args, ctx) => handleObjectiveNext(pi, args, ctx),
	});
}
