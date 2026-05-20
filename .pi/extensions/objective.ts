import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

const OBJECTIVE_LIST_TIMEOUT_MS = 30_000;
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

type ObjectiveCommandName = "objective-next" | "objective-current" | "objective-update";

type ObjectiveCommandSpec = {
	commandName: ObjectiveCommandName;
	skillName: ObjectiveCommandName;
	description: string;
	statusKey: string;
	selectionTitle: string;
	fallbackPrompt: string;
	actionPrompt: string;
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

const OBJECTIVE_COMMANDS: ObjectiveCommandSpec[] = [
	{
		commandName: "objective-next",
		skillName: "objective-next",
		description: "Pick an open Objective, then invoke objective-next for the selected slug.",
		statusKey: "objective-next",
		selectionTitle: "Select an open Objective for next-work recommendation",
		fallbackPrompt:
			"The objective-next skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: recommend the next useful work for the explicit Objective below without mutating files.",
		actionPrompt: "Run objective-next for this explicitly selected Objective slug or path:",
	},
	{
		commandName: "objective-current",
		skillName: "objective-current",
		description: "Pick an open Objective, then invoke objective-current for the selected slug.",
		statusKey: "objective-current",
		selectionTitle: "Select an open Objective to summarize",
		fallbackPrompt:
			"The objective-current skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: summarize the current state of the explicit Objective below without mutating files.",
		actionPrompt: "Run objective-current for this explicitly selected Objective slug or path:",
	},
	{
		commandName: "objective-update",
		skillName: "objective-update",
		description: "Pick an open Objective, then invoke objective-update for the selected slug.",
		statusKey: "objective-update",
		selectionTitle: "Select an open Objective to update",
		fallbackPrompt:
			"The objective-update skill was not found among loaded Pi skills. Follow the repository's Objective workflow anyway: update tracking for exactly one explicit Objective below.",
		actionPrompt: "Run objective-update for this explicitly selected Objective slug or path:",
	},
];

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

async function listOpenObjectives(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveCommandSpec,
): Promise<ObjectiveList> {
	if (ctx.hasUI) {
		ctx.ui.setStatus(spec.statusKey, "listing open Objectives…");
	}

	let result: ExecResult;
	try {
		result = await pi.exec("objective", ["list", "--state", "open", "--format", "json"], {
			cwd: ctx.cwd,
			timeout: OBJECTIVE_LIST_TIMEOUT_MS,
		});
	} finally {
		if (ctx.hasUI) {
			ctx.ui.setStatus(spec.statusKey, undefined);
		}
	}

	if (result.code !== 0 || result.killed) {
		throw new Error(formatObjectiveListFailure(result));
	}

	return parseObjectiveList(result.stdout);
}

async function expandSkill(
	pi: ExtensionAPI,
	skillName: ObjectiveCommandName,
): Promise<{ name: string; block: string } | undefined> {
	const command = pi
		.getCommands()
		.find((candidate) => candidate.source === "skill" && candidate.name === `skill:${skillName}`);
	if (!command) {
		return undefined;
	}

	const skillPath = command.sourceInfo.path;
	const baseDir = command.sourceInfo.baseDir ?? dirname(skillPath);
	const body = stripFrontmatter(await readFile(skillPath, "utf8"));
	return {
		name: skillName,
		block: `<skill name="${skillName}" location="${skillPath}">\nReferences are relative to ${baseDir}.\n\n${body}\n</skill>`,
	};
}

function buildObjectiveSkillPrompt(
	spec: ObjectiveCommandSpec,
	skillBlock: string | undefined,
	objective: string,
): string {
	const updateReminder =
		spec.skillName === "objective-update"
			? "\nAfter this explicit selection, follow objective-update's normal post-selection evidence workflow."
			: "";

	return `${skillBlock ?? spec.fallbackPrompt}

${spec.actionPrompt}

\`\`\`text
${objective}
\`\`\`

Treat this as an explicit user selection. Do not auto-select a different Objective.${updateReminder}`;
}

function formatObjectiveChoice(entry: ObjectiveEntry): string {
	const updateLabel = entry.updateCount === 1 ? "1 update" : `${entry.updateCount} updates`;
	return `${entry.slug} — ${updateLabel} — ${entry.path}`;
}

async function invokeObjectiveSkill(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveCommandSpec,
	objective: string,
): Promise<void> {
	await ctx.waitForIdle();

	const skill = await expandSkill(pi, spec.skillName);
	if (ctx.hasUI) {
		ctx.ui.notify(
			skill
				? `Invoking ${skill.name} for ${objective}.`
				: `${spec.skillName} skill was not found; using fallback prompt.`,
			skill ? "info" : "warning",
		);
	}

	pi.sendUserMessage(buildObjectiveSkillPrompt(spec, skill?.block, objective));
}

async function chooseObjectiveAndInvoke(
	pi: ExtensionAPI,
	ctx: CommandContext,
	spec: ObjectiveCommandSpec,
): Promise<void> {
	await ctx.waitForIdle();

	const objectiveList = await listOpenObjectives(pi, ctx, spec);
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

	const selected = await ctx.ui.select(spec.selectionTitle, [...choices.keys()]);
	if (!selected) {
		ctx.ui.notify("Objective selection cancelled.", "info");
		return;
	}

	const slug = choices.get(selected);
	if (!slug) {
		ctx.ui.notify("Objective selection could not be resolved.", "error");
		return;
	}

	await invokeObjectiveSkill(pi, ctx, spec, slug);
}

async function handleObjectiveCommand(
	pi: ExtensionAPI,
	spec: ObjectiveCommandSpec,
	args: string,
	ctx: CommandContext,
): Promise<void> {
	const explicitObjective = args.trim();
	try {
		if (explicitObjective) {
			await invokeObjectiveSkill(pi, ctx, spec, explicitObjective);
			return;
		}

		await chooseObjectiveAndInvoke(pi, ctx, spec);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (ctx.hasUI) {
			ctx.ui.notify(message, "error");
		}
	}
}

export default function objectiveExtension(pi: ExtensionAPI): void {
	for (const spec of OBJECTIVE_COMMANDS) {
		pi.registerCommand(spec.commandName, {
			description: spec.description,
			handler: async (args, ctx) => handleObjectiveCommand(pi, spec, args, ctx),
		});
	}
}
