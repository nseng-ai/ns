import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { formatCommand, tailText, type ExecResult } from "./command-runtime.ts";

export type { ExecResult } from "./command-runtime.ts";

const HANDOFF_NAMESPACE = "session-artifacts";
const HANDOFF_KEY_PREFIX = "handoffs/";
const HANDOFF_KEY_SUFFIX = ".md";
const CREATE_HANDOFF_COMMAND_NAME = "brmem-handoff";
const PICKUP_HANDOFF_COMMAND_NAME = "brmem-pickup-handoff";
const CREATE_HANDOFF_SKILL_NAME = "brmem-handoff";
const BRMEM_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 4_000;

const PICKUP_HANDOFF_USAGE = `Usage: /${PICKUP_HANDOFF_COMMAND_NAME} [options] [entry-key|semantic-slug|search words]

Pick up a Branch Memory handoff from this branch and continue from its content.

Options:
  --branch <branch>  Read handoffs from an explicit branch instead of the current branch.
  --help, -h         Show this help.

With no selector, the command loads the only handoff when exactly one exists, or opens a picker when several exist.`;

const CREATE_HANDOFF_FALLBACK = `Use the Branch Memory handoff workflow to create and store a concise Markdown handoff artifact.

Storage contract:
- Namespace: \`${HANDOFF_NAMESPACE}\`
- Entry key shape: \`${HANDOFF_KEY_PREFIX}<semantic-slug>${HANDOFF_KEY_SUFFIX}\`
- Use \`brmem put ${HANDOFF_KEY_PREFIX}<semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch> --file <artifact.md>\`.

Confirm the current branch before writing unless the user explicitly names a branch. Use a specific semantic slug, check for an existing artifact before writing, and report branch, namespace, entry, locator/ref, and commit.`;

type NotifyLevel = "info" | "warning" | "error";

type AutocompleteItem = {
	value: string;
	label?: string;
	description?: string;
};

type CommandInfo = {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		source?: string;
		scope?: string;
		origin?: string;
		baseDir?: string;
	};
};

export type CommandContext = {
	cwd: string;
	hasUI: boolean;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		select?(title: string, items: string[]): Promise<string | undefined>;
		setStatus?(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
};

export type ExtensionAPI = {
	registerCommand(
		name: string,
		options: {
			description?: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult>;
	getCommands?(): CommandInfo[];
	sendUserMessage(content: string): void;
};

export type PickupHandoffArgs = {
	help: boolean;
	branch?: string;
	selector: string[];
};

class PickupHandoffUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PickupHandoffUsageError";
	}
}

export function parsePickupHandoffArgs(rawArgs: string): PickupHandoffArgs {
	const parsed: PickupHandoffArgs = { help: false, selector: [] };
	const tokens = rawArgs
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === undefined) {
			continue;
		}

		if (token === "--help" || token === "-h") {
			parsed.help = true;
			continue;
		}
		if (token === "--branch") {
			const value = tokens[index + 1];
			if (value === undefined || value.startsWith("--")) {
				throw new PickupHandoffUsageError("Missing value for --branch.");
			}
			parsed.branch = value;
			index += 1;
			continue;
		}
		if (token.startsWith("--branch=")) {
			const value = token.slice("--branch=".length);
			if (value.length === 0) {
				throw new PickupHandoffUsageError("Missing value for --branch.");
			}
			parsed.branch = value;
			continue;
		}
		if (token.startsWith("-")) {
			throw new PickupHandoffUsageError(`Unknown flag: ${token}`);
		}

		parsed.selector.push(token);
	}

	return parsed;
}

export function parseHandoffKeysFromBrmemList(stdout: string): string[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse brmem list JSON: ${detail}`);
	}

	const data = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed;
	const entries = isRecord(data) ? data.entries : undefined;
	if (!Array.isArray(entries)) {
		throw new Error("brmem list JSON did not contain an entries array.");
	}

	const keys = entries
		.map((entry) => (isRecord(entry) && typeof entry.key === "string" ? entry.key : undefined))
		.filter((key): key is string => key !== undefined && isHandoffKey(key));
	return [...new Set(keys)].sort((left, right) => left.localeCompare(right));
}

export function resolveHandoffKey(selector: string[], handoffKeys: string[]): { key?: string; ambiguousKeys?: string[] } {
	if (handoffKeys.length === 0) {
		return {};
	}

	if (selector.length === 0) {
		if (handoffKeys.length === 1) {
			const onlyKey = handoffKeys[0];
			return onlyKey === undefined ? {} : { key: onlyKey };
		}
		return { ambiguousKeys: handoffKeys };
	}

	if (selector.length === 1) {
		const exactKey = selector[0] ?? "";
		if (handoffKeys.includes(exactKey)) {
			return { key: exactKey };
		}

		const normalizedKey = normalizeSelectorToKey(exactKey);
		if (normalizedKey !== undefined && handoffKeys.includes(normalizedKey)) {
			return { key: normalizedKey };
		}
	}

	const terms = splitSelectorTerms(selector);
	if (terms.length === 0) {
		return {};
	}

	const matches = handoffKeys.filter((key) => {
		const tokens = handoffKeyTokens(key);
		return terms.every((term) => tokens.includes(term));
	});
	if (matches.length === 1) {
		const onlyMatch = matches[0];
		return onlyMatch === undefined ? {} : { key: onlyMatch };
	}
	if (matches.length > 1) {
		return { ambiguousKeys: matches };
	}

	return {};
}

export function buildPickupHandoffPrompt(branch: string, key: string, artifact: string): string {
	return `Resume work from this Branch Memory handoff artifact.

Branch: ${branch}
Namespace: ${HANDOFF_NAMESPACE}
Entry: ${key}

Treat the artifact below as active context for this session. Briefly report the branch, namespace, entry, and what was loaded, then continue with the concrete next step identified by the artifact. If the artifact is stale or incomplete, verify the current repository state before acting and proceed from the present state.

${fencedBlock("markdown", artifact)}`;
}

export function buildCreateHandoffPrompt(skillBlock: string | undefined, focus: string): string {
	const focusText = focus.trim() || "(none provided; ask for a meaningful focus/title if needed)";
	return `${skillBlock ?? CREATE_HANDOFF_FALLBACK}

Create and store a Branch Memory handoff artifact for this session.

User-specified handoff focus, slug, branch, or context:

${fencedBlock("text", focusText)}

Treat this as an explicit request to run the brmem-handoff workflow. Derive a semantic slug if one was not provided, avoid overwriting an existing artifact unless replacement was explicitly requested, and report the stored Branch Memory evidence.`;
}

function normalizeSelectorToKey(selector: string): string | undefined {
	let slug = selector.trim();
	if (slug.length === 0) {
		return undefined;
	}
	if (isHandoffKey(slug)) {
		return slug;
	}
	if (slug.startsWith(HANDOFF_KEY_PREFIX)) {
		slug = slug.slice(HANDOFF_KEY_PREFIX.length);
	}
	if (slug.endsWith(HANDOFF_KEY_SUFFIX)) {
		slug = slug.slice(0, -HANDOFF_KEY_SUFFIX.length);
	}
	if (slug.length === 0 || slug.includes("/")) {
		return undefined;
	}
	return `${HANDOFF_KEY_PREFIX}${slug}${HANDOFF_KEY_SUFFIX}`;
}

function splitSelectorTerms(selector: string[]): string[] {
	return selector.flatMap((part) => part.toLowerCase().split(/[-_/.]+/)).filter((term) => term.length > 0);
}

function handoffKeyTokens(key: string): string[] {
	return splitSelectorTerms([handoffSlug(key)]);
}

function handoffSlug(key: string): string {
	return key.slice(HANDOFF_KEY_PREFIX.length, -HANDOFF_KEY_SUFFIX.length);
}

function isHandoffKey(key: string): boolean {
	return key.startsWith(HANDOFF_KEY_PREFIX) && key.endsWith(HANDOFF_KEY_SUFFIX) && key.length > HANDOFF_KEY_PREFIX.length + HANDOFF_KEY_SUFFIX.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fencedBlock(language: string, content: string): string {
	let fence = "```";
	while (content.includes(fence)) {
		fence += "`";
	}
	return `${fence}${language}\n${content.trimEnd()}\n${fence}`;
}

async function handleCreateHandoffCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	let skill: Awaited<ReturnType<typeof expandSkill>>;
	let skillReadError: string | undefined;
	try {
		skill = await expandSkill(pi, CREATE_HANDOFF_SKILL_NAME);
	} catch (error) {
		skillReadError = errorMessage(error);
	}

	if (ctx.hasUI) {
		ctx.ui.notify(createHandoffStartMessage(skill, skillReadError), skill ? "info" : "warning");
	}
	pi.sendUserMessage(buildCreateHandoffPrompt(skill?.block, args));
}

async function handlePickupHandoffCommand(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	let args: PickupHandoffArgs;
	try {
		args = parsePickupHandoffArgs(rawArgs);
	} catch (error) {
		if (error instanceof PickupHandoffUsageError) {
			ctx.ui.notify(`Usage error: ${error.message}\n\n${PICKUP_HANDOFF_USAGE}`, "error");
			return;
		}
		throw error;
	}

	if (args.help) {
		ctx.ui.notify(PICKUP_HANDOFF_USAGE, "info");
		return;
	}

	let branch: string;
	try {
		branch = args.branch ?? (await currentBranch(pi, ctx));
	} catch (error) {
		ctx.ui.notify(errorMessage(error), "error");
		return;
	}

	let handoffKeys: string[];
	setStatus(ctx, "listing handoffs…");
	try {
		handoffKeys = await listHandoffKeys(pi, ctx, branch);
	} catch (error) {
		ctx.ui.notify(errorMessage(error), "error");
		return;
	} finally {
		setStatus(ctx, undefined);
	}

	if (handoffKeys.length === 0) {
		ctx.ui.notify(`No handoffs found on branch ${branch} in namespace ${HANDOFF_NAMESPACE}.`, "info");
		return;
	}

	let selectedKey: string | undefined;
	const selection = resolveHandoffKey(args.selector, handoffKeys);
	if (selection.key !== undefined) {
		selectedKey = selection.key;
	} else if (selection.ambiguousKeys !== undefined) {
		selectedKey = await chooseAmbiguousHandoff(ctx, branch, selection.ambiguousKeys);
	} else {
		const selectorText = args.selector.join(" ").trim() || "(none)";
		ctx.ui.notify(`No handoff matched ${selectorText} on branch ${branch}. Available: ${handoffKeys.join(", ")}.`, "warning");
		return;
	}

	if (selectedKey === undefined) {
		return;
	}

	let artifact: string;
	setStatus(ctx, `reading ${selectedKey}…`);
	try {
		artifact = await readHandoff(pi, ctx, branch, selectedKey);
	} catch (error) {
		ctx.ui.notify(errorMessage(error), "error");
		return;
	} finally {
		setStatus(ctx, undefined);
	}

	if (ctx.hasUI) {
		ctx.ui.notify(`Loaded ${selectedKey} from ${branch}. Continuing from handoff…`, "info");
	}
	pi.sendUserMessage(buildPickupHandoffPrompt(branch, selectedKey, artifact));
}

function createHandoffStartMessage(skill: Awaited<ReturnType<typeof expandSkill>>, skillReadError: string | undefined): string {
	if (skill !== undefined) {
		return "Starting Branch Memory handoff creation…";
	}
	if (skillReadError !== undefined) {
		return `Could not read brmem-handoff skill; using fallback workflow prompt. ${skillReadError}`;
	}
	return "brmem-handoff skill was not found; using fallback workflow prompt.";
}

async function expandSkill(pi: ExtensionAPI, skillName: string): Promise<{ name: string; block: string } | undefined> {
	const command = pi.getCommands?.().find((candidate) => candidate.source === "skill" && candidate.name === `skill:${skillName}`);
	if (command === undefined) {
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

function stripFrontmatter(markdown: string): string {
	return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

async function currentBranch(pi: ExtensionAPI, ctx: CommandContext): Promise<string> {
	const commandArgs = ["branch", "--show-current"];
	let result: ExecResult;
	try {
		result = await pi.exec("git", commandArgs, { cwd: ctx.cwd, timeout: GIT_TIMEOUT_MS });
	} catch (error) {
		throw new Error(formatStartupFailure(formatCommand("git", commandArgs), error));
	}
	if (result.code !== 0 || result.killed) {
		throw new Error(formatExecFailure(formatCommand("git", commandArgs), result));
	}

	const branch = result.stdout.trim();
	if (branch.length === 0) {
		throw new Error("Cannot pick up a handoff in detached HEAD; pass --branch <branch> explicitly.");
	}
	return branch;
}

async function listHandoffKeys(pi: ExtensionAPI, ctx: CommandContext, branch: string): Promise<string[]> {
	const commandArgs = ["list", "--namespace", HANDOFF_NAMESPACE, "--branch", branch, "--format", "json"];
	let result: ExecResult;
	try {
		result = await pi.exec("brmem", commandArgs, { cwd: ctx.cwd, timeout: BRMEM_TIMEOUT_MS });
	} catch (error) {
		throw new Error(formatStartupFailure(formatCommand("brmem", commandArgs), error));
	}
	if (result.code !== 0 || result.killed) {
		throw new Error(formatExecFailure(formatCommand("brmem", commandArgs), result));
	}
	return parseHandoffKeysFromBrmemList(result.stdout);
}

async function readHandoff(pi: ExtensionAPI, ctx: CommandContext, branch: string, key: string): Promise<string> {
	const commandArgs = ["get", key, "--namespace", HANDOFF_NAMESPACE, "--branch", branch];
	let result: ExecResult;
	try {
		result = await pi.exec("brmem", commandArgs, { cwd: ctx.cwd, timeout: BRMEM_TIMEOUT_MS });
	} catch (error) {
		throw new Error(formatStartupFailure(formatCommand("brmem", commandArgs), error));
	}
	if (result.code !== 0 || result.killed) {
		throw new Error(formatExecFailure(formatCommand("brmem", commandArgs), result));
	}
	return result.stdout;
}

async function chooseAmbiguousHandoff(ctx: CommandContext, branch: string, keys: string[]): Promise<string | undefined> {
	if (!ctx.hasUI || ctx.ui.select === undefined) {
		ctx.ui.notify(`Found multiple handoffs on ${branch}:\n\n${keys.join("\n")}\n\nRerun with a semantic slug.`, "warning");
		return undefined;
	}

	const selected = await ctx.ui.select(`Select Branch Memory handoff on ${branch}`, keys);
	if (selected === undefined) {
		ctx.ui.notify("Handoff pickup cancelled.", "info");
		return undefined;
	}
	return selected;
}

function setStatus(ctx: CommandContext, value: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(PICKUP_HANDOFF_COMMAND_NAME, value);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function formatExecFailure(commandDisplay: string, result: ExecResult): string {
	const status = result.killed ? `exit code ${result.code}; process was killed or timed out` : `exit code ${result.code}`;
	const stdout = result.stdout.trimEnd() || "(empty)";
	const stderr = result.stderr.trimEnd() || "(empty)";
	return truncateError(`command failed (${status}).\n\n$ ${commandDisplay}\n\nstdout:\n${stdout}\n\nstderr:\n${stderr}`);
}

function formatStartupFailure(commandDisplay: string, error: unknown): string {
	return truncateError(`command failed before completion.\n\n$ ${commandDisplay}\n\nerror:\n${errorMessage(error)}`);
}

function truncateError(message: string): string {
	return tailText(message, { maxChars: MAX_ERROR_CHARS });
}

export default function brmemHandoffExtension(pi: ExtensionAPI): void {
	pi.registerCommand(CREATE_HANDOFF_COMMAND_NAME, {
		description: "Create and store a Branch Memory handoff artifact.",
		handler: async (args, ctx) => handleCreateHandoffCommand(pi, args, ctx),
	});

	pi.registerCommand(PICKUP_HANDOFF_COMMAND_NAME, {
		description: "Pick up a Branch Memory handoff artifact by slug or picker.",
		handler: async (args, ctx) => handlePickupHandoffCommand(pi, args, ctx),
	});
}
