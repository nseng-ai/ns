import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { formatCommand, tailText, type ExecResult } from "./command-runtime.ts";
import { buildPiLaunchCommand } from "./cmux/pi-launch.ts";
import type { ModelInfo, ThinkingLevel } from "./cmux/types.ts";
import { truncateDisplayLine } from "./terminal-presentation.ts";

export type { ExecResult } from "./command-runtime.ts";

const HANDOFF_NAMESPACE = "handoffs";
const HANDOFF_KEY_SUFFIX = ".md";
const CREATE_HANDOFF_COMMAND_NAME = "handoff:create";
const PICKUP_HANDOFF_COMMAND_NAME = "handoff:pickup";
const LIST_HANDOFF_COMMAND_NAME = "handoff:list";
const HANDOFF_TAB_COMMAND_NAME = "handoff-tab";
const HANDOFF_TAB_LAUNCH_TOOL_NAME = "handoff_tab_launch";
export const HANDOFF_LIST_MESSAGE_TYPE = "handoff-list";
const CREATE_HANDOFF_SKILL_NAME = "handoff-create";
const HANDOFF_TIMEOUT_MS = 30_000;
const BRMEM_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 10_000;
const CMUX_TIMEOUT_MS = 10_000;
const MAX_ERROR_CHARS = 4_000;
const MAX_PREVIEW_CHARS = 240;
const CREATE_FOCUS_QUESTION = "What should the future session continue from this handoff?";
const HANDOFF_TAB_STATUS_KEY = HANDOFF_TAB_COMMAND_NAME;

const PICKUP_HANDOFF_USAGE = `Usage: /${PICKUP_HANDOFF_COMMAND_NAME} [options] [semantic-slug|search words]

Pick up an existing handoff from this branch and continue from its content.

Options:
  --branch <branch>  Pick up handoffs from an explicit branch instead of the current branch.
  --help, -h         Show this help.

With no selector, the command picks up the only handoff when exactly one exists, or opens a picker when several exist.`;

const LIST_HANDOFF_USAGE = `Usage: /${LIST_HANDOFF_COMMAND_NAME} [--branch <branch> | --all]

List handoffs on this branch or across active branches.

Options:
  --branch <branch>  List handoffs from an explicit branch instead of the current branch.
  --all              List handoffs across active branches.
  --help, -h         Show this help.`;

const CREATE_HANDOFF_FALLBACK = `Use the handoff-create workflow to create a concise, directed Markdown handoff for a specific future continuation. Treat Branch Memory as the storage command, not the public user model.

Storage contract:
- Namespace: \`${HANDOFF_NAMESPACE}\`
- Entry key shape: \`<semantic-slug>${HANDOFF_KEY_SUFFIX}\`
- Check for an existing artifact with \`brmem check <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch>\`.
- Store final Markdown directly with \`brmem put <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch> --file /dev/stdin\`; do not create a temporary artifact file.

If review or editing is needed before creating the handoff, iterate in chat, structured UI, or another explicit surface; do not use a hidden temporary Markdown file as the review mechanism.

Confirm the current branch before writing unless the user explicitly names a branch. Use a specific semantic slug, check for an existing artifact before writing, report the created handoff first, and include branch, namespace, entry, locator/ref, and commit as technical evidence.`;

type NotifyLevel = "info" | "warning" | "error";

interface AutocompleteItem {
	value: string;
	label?: string;
	description?: string;
}

interface CommandInfo {
	name: string;
	source: string;
	sourceInfo: {
		path: string;
		source?: string;
		scope?: string;
		origin?: string;
		baseDir?: string;
	};
}

interface CustomMessage {
	customType: string;
	content: string;
	display: boolean;
	details?: unknown;
}

interface RenderTheme {
	fg(color: string, text: string): string;
	bold?(text: string): string;
}

interface RenderComponent {
	render(width: number): string[];
	invalidate(): void;
}

interface ToolResult<Details = unknown> {
	content: Array<{ type: "text"; text: string }>;
	details?: Details;
	isError?: boolean;
}

interface ToolDefinition {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: Record<string, unknown>;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
		ctx: ToolContext,
	): Promise<ToolResult> | ToolResult;
}

type MessageRenderer = (message: CustomMessage, options: { expanded: boolean }, theme: RenderTheme) => RenderComponent;

interface BaseRuntimeContext {
	cwd: string;
	hasUI: boolean;
	model?: ModelInfo;
	ui: {
		notify(message: string, level?: NotifyLevel): void;
		setStatus?(key: string, value: string | undefined): void;
	};
}

export interface CommandContext extends BaseRuntimeContext {
	ui: BaseRuntimeContext["ui"] & {
		select?(title: string, items: string[]): Promise<string | undefined>;
		input?(title: string, placeholder?: string): Promise<string | undefined>;
	};
	waitForIdle(): Promise<void>;
}

export interface ToolContext extends BaseRuntimeContext {}

export interface ExtensionAPI {
	registerCommand(
		name: string,
		options: {
			description?: string;
			getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
			handler(args: string, ctx: CommandContext): Promise<void> | void;
		},
	): void;
	registerTool?(definition: ToolDefinition): void;
	exec(command: string, args: string[], options?: { cwd?: string; timeout?: number; signal?: AbortSignal }): Promise<ExecResult>;
	getCommands?(): CommandInfo[];
	getThinkingLevel?(): ThinkingLevel;
	registerMessageRenderer?(customType: string, renderer: MessageRenderer): void;
	sendMessage?(message: CustomMessage): void;
	sendUserMessage(content: string): void;
}

export interface PickupHandoffArgs {
	help: boolean;
	branch?: string;
	selector: string[];
}

export interface ListHandoffArgs {
	help: boolean;
	branch?: string;
	allBranches: boolean;
}

export interface HandoffListItem {
	branch: string;
	key: string;
	slug: string;
}

export interface HandoffListMessageItem extends HandoffListItem {
	preview: string;
}

export type HandoffListMode = "branch" | "all-branches";

export interface HandoffListMessageDetails {
	mode: HandoffListMode;
	branch?: string;
	items: HandoffListMessageItem[];
}

export interface HandoffListBranchGroup {
	branch: string;
	items: Array<{
		index: number;
		item: HandoffListMessageItem;
	}>;
}

type PreviewedHandoffListItem = HandoffListMessageItem;

export type HandoffArgsParseResult<T> = { type: "valid"; args: T } | { type: "invalid"; message: string };

export type HandoffItemsParseResult = { type: "valid"; items: HandoffListItem[] } | { type: "invalid"; message: string };

export type HandoffKeysParseResult = { type: "valid"; keys: string[] } | { type: "invalid"; message: string };

export type HandoffTabLaunchResult =
	| { type: "launched"; branch: string; slug: string; tabTitle: string; surfaceId: string; workspaceId: string; command: string }
	| { type: "failed"; message: string; branch?: string; slug?: string; surfaceId?: string; workspaceId?: string };

interface HandoffTabLaunchParams {
	branch: string;
	slug: string;
}

interface CmuxCallerContext {
	workspaceId: string;
	paneId: string;
	windowId?: string;
}

interface CmuxCreatedSurface {
	surfaceId: string;
	workspaceId?: string;
}

type HandoffItemsLoadResult = { type: "loaded"; items: HandoffListItem[] } | { type: "failed"; message: string };

type HandoffExistsResult = { type: "exists" } | { type: "missing" } | { type: "failed"; message: string };

export function parsePickupHandoffArgs(rawArgs: string): HandoffArgsParseResult<PickupHandoffArgs> {
	const parsed: PickupHandoffArgs = { help: false, selector: [] };
	const tokens = tokenizeArgs(rawArgs);

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
				return { type: "invalid", message: "Missing value for --branch." };
			}
			parsed.branch = value;
			index += 1;
			continue;
		}
		if (token.startsWith("--branch=")) {
			const value = token.slice("--branch=".length);
			if (value.length === 0) {
				return { type: "invalid", message: "Missing value for --branch." };
			}
			parsed.branch = value;
			continue;
		}
		if (token.startsWith("-")) {
			return { type: "invalid", message: `Unknown flag: ${token}` };
		}
		if (token.includes("/")) {
			return {
				type: "invalid",
				message: "Handoff selectors cannot contain '/'; use a semantic slug like address-review-feedback.",
			};
		}

		parsed.selector.push(token);
	}

	return { type: "valid", args: parsed };
}

export function parseListHandoffArgs(rawArgs: string): HandoffArgsParseResult<ListHandoffArgs> {
	const parsed: ListHandoffArgs = { help: false, allBranches: false };
	const tokens = tokenizeArgs(rawArgs);

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === undefined) {
			continue;
		}

		if (token === "--help" || token === "-h") {
			parsed.help = true;
			continue;
		}
		if (token === "--all") {
			parsed.allBranches = true;
			continue;
		}
		if (token === "--branch") {
			const value = tokens[index + 1];
			if (value === undefined || value.startsWith("--")) {
				return { type: "invalid", message: "Missing value for --branch." };
			}
			parsed.branch = value;
			index += 1;
			continue;
		}
		if (token.startsWith("--branch=")) {
			const value = token.slice("--branch=".length);
			if (value.length === 0) {
				return { type: "invalid", message: "Missing value for --branch." };
			}
			parsed.branch = value;
			continue;
		}
		if (token.startsWith("-")) {
			return { type: "invalid", message: `Unknown flag: ${token}` };
		}

		return { type: "invalid", message: `Unexpected argument: ${token}` };
	}

	if (parsed.branch !== undefined && parsed.allBranches) {
		return { type: "invalid", message: "--branch and --all are mutually exclusive." };
	}

	return { type: "valid", args: parsed };
}

export function parseHandoffItemsFromBrmemList(stdout: string): HandoffItemsParseResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return { type: "invalid", message: `Failed to parse handoff list JSON: ${detail}` };
	}

	const data = isRecord(parsed) && isRecord(parsed.data) ? parsed.data : parsed;
	if (!isRecord(data)) {
		return { type: "invalid", message: "handoff list JSON did not contain handoffs or entries array." };
	}

	if (Array.isArray(data.handoffs)) {
		return parseHandoffSummaryItems(data.handoffs);
	}

	if (Array.isArray(data.entries)) {
		const resultBranch = typeof data.branch === "string" ? data.branch : undefined;
		return parseLegacyBrmemEntryItems(data.entries, resultBranch);
	}

	return { type: "invalid", message: "handoff list JSON did not contain handoffs or entries array." };
}

function parseHandoffSummaryItems(handoffs: unknown[]): HandoffItemsParseResult {
	const seen = new Set<string>();
	const items: HandoffListItem[] = [];

	for (const handoff of handoffs) {
		if (!isRecord(handoff) || typeof handoff.branch !== "string" || typeof handoff.key !== "string" || !isHandoffKey(handoff.key)) {
			continue;
		}
		const identity = `${handoff.branch}\0${handoff.key}`;
		if (seen.has(identity)) {
			continue;
		}
		seen.add(identity);
		items.push({ branch: handoff.branch, key: handoff.key, slug: handoffSlug(handoff.key) });
	}

	return { type: "valid", items };
}

function parseLegacyBrmemEntryItems(entries: unknown[], resultBranch: string | undefined): HandoffItemsParseResult {
	const seen = new Set<string>();
	const items: HandoffListItem[] = [];

	for (const entry of entries) {
		if (!isRecord(entry) || typeof entry.key !== "string" || !isHandoffKey(entry.key)) {
			continue;
		}
		const branch = typeof entry.branch === "string" ? entry.branch : resultBranch;
		if (branch === undefined || branch.length === 0) {
			continue;
		}
		const identity = `${branch}\0${entry.key}`;
		if (seen.has(identity)) {
			continue;
		}
		seen.add(identity);
		items.push({ branch, key: entry.key, slug: handoffSlug(entry.key) });
	}

	return { type: "valid", items: sortHandoffItems(items) };
}

export function parseHandoffKeysFromBrmemList(stdout: string): HandoffKeysParseResult {
	const parsedItems = parseHandoffItemsFromBrmemList(stdout);
	if (parsedItems.type === "invalid") {
		return { type: "invalid", message: parsedItems.message };
	}
	return {
		type: "valid",
		keys: [...new Set(parsedItems.items.map((item) => item.key))].sort((left, right) => left.localeCompare(right)),
	};
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
		if (isHandoffKey(exactKey) && handoffKeys.includes(exactKey)) {
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
	return `Pick up this handoff artifact as active context for the session.

Branch: ${branch}
Handoff: ${handoffSlug(key)}

Technical locator:
- Namespace: ${HANDOFF_NAMESPACE}
- Entry: ${key}

Briefly report the branch and handoff slug picked up, then continue with the concrete next step identified by the artifact. If the artifact is stale or incomplete, verify the current repository state before acting and proceed from the present state.

${fencedBlock("markdown", artifact)}`;
}

export function buildCreateHandoffPrompt(skillBlock: string | undefined, focus: string): string {
	const focusText = focus.trim();
	return `${skillBlock ?? CREATE_HANDOFF_FALLBACK}

Create a directed handoff artifact for this session.

Continuation focus:

${fencedBlock("text", focusText)}

Treat this as an explicit request to run the handoff create workflow. The handoff must be directed toward the supplied continuation focus. Derive a semantic slug from that focus unless the user explicitly supplied one, avoid overwriting an existing artifact unless replacement was explicitly requested, and keep normal copy focused on creating/picking up a handoff.

Before writing, confirm the branch unless the user explicitly named one and check for an existing key. Do not create a temporary Markdown file; store final Markdown directly through /dev/stdin:

${fencedBlock(
		"bash",
		`brmem check <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch>
brmem put <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch> --file /dev/stdin <<'HANDOFF_EOF'
<final Markdown handoff content>
HANDOFF_EOF`,
	)}

Report the created handoff first. Include Branch Memory details only as technical storage evidence.`;
}

export function deriveSemanticHandoffSlug(focus: string): string | undefined {
	const slug = focus
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	if (slug.length === 0) {
		return undefined;
	}
	return slug.split("-").slice(0, 8).join("-");
}

export function buildHandoffTabPrompt(options: {
	skillBlock: string | undefined;
	focus: string;
	branch: string;
	slug: string;
}): string {
	const { skillBlock, focus, branch, slug } = options;
	const key = `${slug}${HANDOFF_KEY_SUFFIX}`;
	return `${skillBlock ?? CREATE_HANDOFF_FALLBACK}

This is a /${HANDOFF_TAB_COMMAND_NAME} request. Create a directed handoff artifact for the current session, then launch a pickup Pi in a new cmux tab.

Continuation focus:

${fencedBlock("text", focus.trim())}

Use exactly this handoff identity:

- Branch: ${branch}
- Namespace: ${HANDOFF_NAMESPACE}
- Entry: ${key}
- Slug: ${slug}

Hard requirements:

1. Write the handoff artifact using the existing handoff-create workflow and the exact branch/key above.
2. Check for an existing artifact first. If it exists, stop; do not overwrite and do not open a cmux tab.
3. Store the final Markdown directly through /dev/stdin; do not create a temporary artifact file.
4. After the \`brmem put\` succeeds, call the ${HANDOFF_TAB_LAUNCH_TOOL_NAME} tool with exactly:

${fencedBlock("json", JSON.stringify({ branch, slug }, null, 2))}

5. Do not call ${HANDOFF_TAB_LAUNCH_TOOL_NAME} before the handoff is saved successfully.

The pickup tab will run this command:

${fencedBlock("text", `/${PICKUP_HANDOFF_COMMAND_NAME} --branch ${branch} ${slug}`)}`;
}

export function deriveHandoffPreview(artifact: string): string {
	const lines = artifact.replace(/\r/g, "\n").split("\n");

	for (const line of lines) {
		const match = line.trim().match(/^Continuation focus:\s*(.+)$/i);
		const focus = match?.[1]?.trim();
		if (focus !== undefined && focus.length > 0) {
			return compactPreview(focus);
		}
	}

	for (const line of lines) {
		const trimmed = line.trim();
		if (trimmed.length === 0) {
			continue;
		}
		const heading = trimmed.match(/^#+\s+(.+)$/);
		if (heading?.[1] !== undefined) {
			return compactPreview(heading[1]);
		}
		return compactPreview(trimmed.replace(/^[-*]\s+/, ""));
	}

	return "(empty handoff)";
}

function tokenizeArgs(rawArgs: string): string[] {
	return rawArgs
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0);
}

function normalizeSelectorToKey(selector: string): string | undefined {
	const trimmed = selector.trim();
	if (trimmed.length === 0 || trimmed.includes("/")) {
		return undefined;
	}
	if (trimmed.endsWith(HANDOFF_KEY_SUFFIX)) {
		return isHandoffKey(trimmed) ? trimmed : undefined;
	}
	return `${trimmed}${HANDOFF_KEY_SUFFIX}`;
}

function splitSelectorTerms(selector: string[]): string[] {
	return selector.flatMap((part) => part.toLowerCase().split(/[-_.]+/)).filter((term) => term.length > 0);
}

function handoffKeyTokens(key: string): string[] {
	return splitSelectorTerms([handoffSlug(key)]);
}

function handoffSlug(key: string): string {
	return key.slice(0, -HANDOFF_KEY_SUFFIX.length);
}

function isHandoffKey(key: string): boolean {
	return key.endsWith(HANDOFF_KEY_SUFFIX) && !key.includes("/") && key.length > HANDOFF_KEY_SUFFIX.length;
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

async function handleHandoffTabCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const focus = await resolveCreateFocus(pi, args, ctx);
	if (focus === undefined) {
		return;
	}

	let branch: string;
	try {
		branch = await currentBranch(pi, ctx, "create");
	} catch (error) {
		ctx.ui.notify(errorMessage(error), "error");
		return;
	}

	const slug = deriveSemanticHandoffSlug(focus);
	if (slug === undefined) {
		ctx.ui.notify("Continuation focus must contain at least one letter or number to derive a handoff slug.", "error");
		return;
	}

	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "checking handoff and cmux context…");
	try {
		const existing = await checkHandoffExists(pi, ctx.cwd, branch, `${slug}${HANDOFF_KEY_SUFFIX}`);
		if (existing.type === "exists") {
			ctx.ui.notify(
				`Handoff ${slug} already exists on branch ${branch}. Rerun /${HANDOFF_TAB_COMMAND_NAME} with a more specific focus so a different slug is derived.`,
				"error",
			);
			return;
		}
		if (existing.type === "failed") {
			ctx.ui.notify(existing.message, "error");
			return;
		}

		const caller = await identifyCmuxCaller(pi, ctx.cwd);
		if (caller.type === "failed") {
			ctx.ui.notify(caller.message, "error");
			return;
		}
	} finally {
		setStatus(ctx, HANDOFF_TAB_STATUS_KEY, undefined);
	}

	let skill: Awaited<ReturnType<typeof expandSkill>>;
	let skillReadError: string | undefined;
	try {
		skill = await expandSkill(pi, CREATE_HANDOFF_SKILL_NAME);
	} catch (error) {
		skillReadError = errorMessage(error);
	}

	ctx.ui.notify(createHandoffTabStartMessage(skill, skillReadError, slug), skill ? "info" : "warning");
	pi.sendUserMessage(buildHandoffTabPrompt({ skillBlock: skill?.block, focus, branch, slug }));
}

async function handleCreateHandoffCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const focus = await resolveCreateFocus(pi, args, ctx);
	if (focus === undefined) {
		return;
	}

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
	pi.sendUserMessage(buildCreateHandoffPrompt(skill?.block, focus));
}

async function resolveCreateFocus(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<string | undefined> {
	const focus = rawArgs.trim();
	if (focus.length > 0) {
		return focus;
	}

	if (ctx.hasUI && ctx.ui.input !== undefined) {
		const response = await ctx.ui.input(CREATE_FOCUS_QUESTION);
		const promptedFocus = response?.trim() ?? "";
		if (promptedFocus.length > 0) {
			return promptedFocus;
		}
		ctx.ui.notify("Continuation focus is required to create a handoff.", "warning");
		return undefined;
	}

	pi.sendUserMessage(`Ask the user exactly this question before creating a handoff: ${CREATE_FOCUS_QUESTION}\n\nDo not create a handoff until the user answers with a meaningful continuation focus.`);
	return undefined;
}

async function handlePickupHandoffCommand(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	const parsedArgs = parsePickupHandoffArgs(rawArgs);
	if (parsedArgs.type === "invalid") {
		ctx.ui.notify(`Usage error: ${parsedArgs.message}\n\n${PICKUP_HANDOFF_USAGE}`, "error");
		return;
	}

	const args = parsedArgs.args;
	if (args.help) {
		ctx.ui.notify(PICKUP_HANDOFF_USAGE, "info");
		return;
	}

	let branch: string;
	try {
		branch = args.branch ?? (await currentBranch(pi, ctx, "pick up"));
	} catch (error) {
		ctx.ui.notify(errorMessage(error), "error");
		return;
	}

	let handoffItems: HandoffListItem[];
	setStatus(ctx, PICKUP_HANDOFF_COMMAND_NAME, "listing handoffs…");
	try {
		const handoffItemsResult = await listHandoffItems(pi, ctx, { branch });
		if (handoffItemsResult.type === "failed") {
			ctx.ui.notify(handoffItemsResult.message, "error");
			return;
		}
		handoffItems = handoffItemsResult.items;
	} finally {
		setStatus(ctx, PICKUP_HANDOFF_COMMAND_NAME, undefined);
	}

	if (handoffItems.length === 0) {
		ctx.ui.notify(`No handoffs found on branch ${branch}.`, "info");
		return;
	}

	let selectedKey: string | undefined;
	const handoffKeys = handoffItems.map((item) => item.key);
	const selection = resolveHandoffKey(args.selector, handoffKeys);
	if (selection.key !== undefined) {
		selectedKey = selection.key;
	} else if (selection.ambiguousKeys !== undefined) {
		selectedKey = await chooseHandoff(pi, ctx, branch, itemsForKeys(handoffItems, selection.ambiguousKeys));
	} else {
		const selectorText = args.selector.join(" ").trim() || "(none)";
		ctx.ui.notify(`No handoff matched ${selectorText} on branch ${branch}. Available: ${slugList(handoffItems)}.`, "warning");
		return;
	}

	if (selectedKey === undefined) {
		return;
	}

	let artifact: string;
	setStatus(ctx, PICKUP_HANDOFF_COMMAND_NAME, `reading ${handoffSlug(selectedKey)}…`);
	try {
		artifact = await readHandoff(pi, ctx, branch, selectedKey);
	} catch (error) {
		ctx.ui.notify(errorMessage(error), "error");
		return;
	} finally {
		setStatus(ctx, PICKUP_HANDOFF_COMMAND_NAME, undefined);
	}

	if (ctx.hasUI) {
		ctx.ui.notify(`Picked up handoff ${handoffSlug(selectedKey)} from branch ${branch}.`, "info");
	}
	pi.sendUserMessage(buildPickupHandoffPrompt(branch, selectedKey, artifact));
}

async function handleListHandoffCommand(pi: ExtensionAPI, rawArgs: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();

	const parsedArgs = parseListHandoffArgs(rawArgs);
	if (parsedArgs.type === "invalid") {
		ctx.ui.notify(`Usage error: ${parsedArgs.message}\n\n${LIST_HANDOFF_USAGE}`, "error");
		return;
	}

	const args = parsedArgs.args;
	if (args.help) {
		ctx.ui.notify(LIST_HANDOFF_USAGE, "info");
		return;
	}

	let branch: string | undefined;
	try {
		branch = args.allBranches ? undefined : (args.branch ?? (await currentBranch(pi, ctx, "list")));
	} catch (error) {
		ctx.ui.notify(errorMessage(error), "error");
		return;
	}

	let handoffItems: HandoffListItem[];
	setStatus(ctx, LIST_HANDOFF_COMMAND_NAME, "listing handoffs…");
	try {
		const handoffItemsResult = await listHandoffItems(
			pi,
			ctx,
			args.allBranches ? { allBranches: true } : { branch: branch ?? "" },
		);
		if (handoffItemsResult.type === "failed") {
			ctx.ui.notify(handoffItemsResult.message, "error");
			return;
		}
		handoffItems = handoffItemsResult.items;
	} finally {
		setStatus(ctx, LIST_HANDOFF_COMMAND_NAME, undefined);
	}

	if (handoffItems.length === 0) {
		ctx.ui.notify(args.allBranches ? "No handoffs found across active branches." : `No handoffs found on branch ${branch}.`, "info");
		return;
	}

	setStatus(ctx, LIST_HANDOFF_COMMAND_NAME, "reading previews…");
	let previewedItems: PreviewedHandoffListItem[];
	try {
		previewedItems = await previewHandoffItems(pi, ctx, handoffItems);
	} finally {
		setStatus(ctx, LIST_HANDOFF_COMMAND_NAME, undefined);
	}

	const details: HandoffListMessageDetails = args.allBranches
		? { mode: "all-branches", items: previewedItems }
		: { mode: "branch", branch: branch ?? "", items: previewedItems };
	emitHandoffList(pi, ctx, details);
}

function createHandoffStartMessage(skill: Awaited<ReturnType<typeof expandSkill>>, skillReadError: string | undefined): string {
	if (skill !== undefined) {
		return "Starting handoff create workflow…";
	}
	if (skillReadError !== undefined) {
		return `Could not read handoff-create skill; using fallback handoff-create workflow prompt. ${skillReadError}`;
	}
	return "handoff-create skill was not found; using fallback handoff-create workflow prompt.";
}

function createHandoffTabStartMessage(
	skill: Awaited<ReturnType<typeof expandSkill>>,
	skillReadError: string | undefined,
	slug: string,
): string {
	if (skill !== undefined) {
		return `Starting handoff-tab workflow for ${slug}…`;
	}
	if (skillReadError !== undefined) {
		return `Could not read handoff-create skill; using fallback handoff-tab workflow prompt for ${slug}. ${skillReadError}`;
	}
	return `handoff-create skill was not found; using fallback handoff-tab workflow prompt for ${slug}.`;
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

async function currentBranch(pi: ExtensionAPI, ctx: Pick<CommandContext, "cwd">, action: "pick up" | "list" | "create"): Promise<string> {
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
		const recovery = action === "list" ? "pass --branch <branch> or --all" : "pass --branch <branch>";
		throw new Error(`Cannot ${action} handoffs in detached HEAD; ${recovery}.`);
	}
	return branch;
}

async function listHandoffItems(
	pi: ExtensionAPI,
	ctx: CommandContext,
	options: { branch: string } | { allBranches: true },
): Promise<HandoffItemsLoadResult> {
	const commandArgs =
		"allBranches" in options
			? ["list", "--all", "--format", "json"]
			: ["list", "--branch", options.branch, "--format", "json"];
	let result: ExecResult;
	try {
		result = await pi.exec("handoff", commandArgs, { cwd: ctx.cwd, timeout: HANDOFF_TIMEOUT_MS });
	} catch (error) {
		return { type: "failed", message: formatStartupFailure(formatCommand("handoff", commandArgs), error) };
	}
	if (result.code !== 0 || result.killed) {
		return { type: "failed", message: formatExecFailure(formatCommand("handoff", commandArgs), result) };
	}
	const parsedItems = parseHandoffItemsFromBrmemList(result.stdout);
	if (parsedItems.type === "invalid") {
		return { type: "failed", message: parsedItems.message };
	}
	return { type: "loaded", items: parsedItems.items };
}

async function readHandoff(pi: ExtensionAPI, ctx: Pick<CommandContext, "cwd">, branch: string, key: string): Promise<string> {
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

async function checkHandoffExists(
	pi: ExtensionAPI,
	cwd: string,
	branch: string,
	key: string,
): Promise<HandoffExistsResult> {
	const commandArgs = ["check", key, "--namespace", HANDOFF_NAMESPACE, "--branch", branch];
	let result: ExecResult;
	try {
		result = await pi.exec("brmem", commandArgs, { cwd, timeout: BRMEM_TIMEOUT_MS });
	} catch (error) {
		return { type: "failed", message: formatStartupFailure(formatCommand("brmem", commandArgs), error) };
	}
	if (result.code === 0 && !result.killed) {
		return { type: "exists" };
	}
	if (result.code === 1 && !result.killed) {
		return { type: "missing" };
	}
	return { type: "failed", message: formatExecFailure(formatCommand("brmem", commandArgs), result) };
}

async function identifyCmuxCaller(
	pi: ExtensionAPI,
	cwd: string,
): Promise<{ type: "identified"; caller: CmuxCallerContext } | { type: "failed"; message: string }> {
	const commandArgs = ["identify", "--json", "--id-format", "both"];
	let result: ExecResult;
	try {
		result = await pi.exec("cmux", commandArgs, { cwd, timeout: CMUX_TIMEOUT_MS });
	} catch (error) {
		return { type: "failed", message: formatStartupFailure(formatCommand("cmux", commandArgs), error) };
	}
	if (result.code !== 0 || result.killed) {
		return { type: "failed", message: formatExecFailure(formatCommand("cmux", commandArgs), result) };
	}

	const parsed = parseCmuxCallerContext(result.stdout);
	if (parsed === undefined) {
		return { type: "failed", message: "cmux identify did not return a caller workspace and pane; are you running inside cmux?" };
	}
	return { type: "identified", caller: parsed };
}

function parseCmuxCallerContext(stdout: string): CmuxCallerContext | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed) || !isRecord(parsed.caller)) {
		return undefined;
	}
	const workspaceId = readString(parsed.caller, "workspace_id");
	const paneId = readString(parsed.caller, "pane_id");
	if (workspaceId === undefined || paneId === undefined) {
		return undefined;
	}
	const windowId = readString(parsed.caller, "window_id");
	return windowId === undefined ? { workspaceId, paneId } : { workspaceId, paneId, windowId };
}

function parseCreatedCmuxSurface(stdout: string): CmuxCreatedSurface | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!isRecord(parsed)) {
		return undefined;
	}
	const surfaceId = readString(parsed, "surface_id") ?? readString(parsed, "id");
	if (surfaceId === undefined) {
		return undefined;
	}
	const workspaceId = readString(parsed, "workspace_id");
	return workspaceId === undefined ? { surfaceId } : { surfaceId, workspaceId };
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function chooseHandoff(
	pi: ExtensionAPI,
	ctx: CommandContext,
	branch: string,
	items: HandoffListItem[],
): Promise<string | undefined> {
	if (!ctx.hasUI || ctx.ui.select === undefined) {
		ctx.ui.notify(`Found multiple handoffs on branch ${branch}:\n\n${items.map((item) => item.slug).join("\n")}\n\nRerun with a slug.`, "warning");
		return undefined;
	}

	const previewedItems = await previewHandoffItems(pi, ctx, items);
	const labelToKey = new Map(previewedItems.map((item) => [pickerLabel(item), item.key]));
	const selected = await ctx.ui.select(`Select handoff on ${branch}`, [...labelToKey.keys()]);
	if (selected === undefined) {
		ctx.ui.notify("Handoff pickup cancelled.", "info");
		return undefined;
	}
	return labelToKey.get(selected);
}

async function previewHandoffItems(
	pi: ExtensionAPI,
	ctx: CommandContext,
	items: HandoffListItem[],
): Promise<PreviewedHandoffListItem[]> {
	const previewedItems: PreviewedHandoffListItem[] = [];
	for (const item of items) {
		try {
			const artifact = await readHandoff(pi, ctx, item.branch, item.key);
			previewedItems.push({ ...item, preview: deriveHandoffPreview(artifact) });
		} catch (_error) {
			previewedItems.push({ ...item, preview: "(preview unreadable)" });
		}
	}
	return previewedItems;
}

function itemsForKeys(items: HandoffListItem[], keys: string[]): HandoffListItem[] {
	const keySet = new Set(keys);
	return items.filter((item) => keySet.has(item.key));
}

function slugList(items: HandoffListItem[]): string {
	return items.map((item) => item.slug).join(", ");
}

function pickerLabel(item: PreviewedHandoffListItem): string {
	return `${item.slug} — ${item.preview}`;
}

function emitHandoffList(pi: ExtensionAPI, ctx: CommandContext, details: HandoffListMessageDetails): void {
	const content = formatHandoffListPlain(details);
	if (pi.sendMessage !== undefined) {
		pi.sendMessage({
			customType: HANDOFF_LIST_MESSAGE_TYPE,
			content,
			display: true,
			details,
		});
		return;
	}

	ctx.ui.notify(content, "info");
}

export function formatHandoffListPlain(details: HandoffListMessageDetails): string {
	return formatHandoffListLines(details).join("\n");
}

export function renderHandoffListMessage(
	message: CustomMessage,
	_options: { expanded: boolean },
	theme: RenderTheme,
): RenderComponent {
	const details = parseHandoffListMessageDetails(message.details);
	if (details === undefined) {
		return {
			render(width: number): string[] {
				return message.content.split("\n").map((line) => truncateDisplayLine(line, width));
			},
			invalidate(): void {},
		};
	}

	return {
		render(width: number): string[] {
			return formatHandoffListLines(details).map((line, index) => styleHandoffListLine(truncateDisplayLine(line, width), index, theme));
		},
		invalidate(): void {},
	};
}

export function formatHandoffPickupCommand(item: HandoffListMessageItem, mode: HandoffListMode): string {
	return mode === "all-branches" ? `/${PICKUP_HANDOFF_COMMAND_NAME} --branch ${item.branch} ${item.slug}` : `/${PICKUP_HANDOFF_COMMAND_NAME} ${item.slug}`;
}

export function groupHandoffListItemsByBranch(items: HandoffListMessageItem[]): HandoffListBranchGroup[] {
	const groups: HandoffListBranchGroup[] = [];
	const branchGroups = new Map<string, HandoffListBranchGroup>();

	for (const [index, item] of items.entries()) {
		let group = branchGroups.get(item.branch);
		if (group === undefined) {
			group = { branch: item.branch, items: [] };
			branchGroups.set(item.branch, group);
			groups.push(group);
		}
		group.items.push({ index: index + 1, item });
	}

	return groups;
}

function formatHandoffListLines(details: HandoffListMessageDetails): string[] {
	const branch = details.branch ?? details.items[0]?.branch ?? "current branch";
	const lines = [details.mode === "all-branches" ? "Handoffs across active branches" : `Handoffs on ${branch}`];
	if (details.items.length === 0) {
		return lines;
	}

	lines.push("");
	if (details.mode === "all-branches") {
		for (const [groupIndex, group] of groupHandoffListItemsByBranch(details.items).entries()) {
			if (groupIndex > 0) {
				lines.push("");
			}
			lines.push(group.branch);
			for (const { index, item } of group.items) {
				appendHandoffListCard(lines, index, item, details.mode);
			}
		}
		return lines;
	}

	for (const [index, item] of details.items.entries()) {
		appendHandoffListCard(lines, index + 1, item, details.mode);
	}
	return lines;
}

function appendHandoffListCard(lines: string[], index: number, item: HandoffListMessageItem, mode: HandoffListMode): void {
	lines.push(`  ${index}. ${item.slug}`);
	lines.push(`     ${item.preview}`);
	lines.push(`     → ${formatHandoffPickupCommand(item, mode)}`);
}

function parseHandoffListMessageDetails(details: unknown): HandoffListMessageDetails | undefined {
	if (!isRecord(details)) {
		return undefined;
	}

	const mode = details.mode;
	if (mode !== "branch" && mode !== "all-branches") {
		return undefined;
	}
	if (!Array.isArray(details.items)) {
		return undefined;
	}

	const items: HandoffListMessageItem[] = [];
	for (const item of details.items) {
		if (!isRecord(item) || typeof item.branch !== "string" || typeof item.key !== "string" || typeof item.slug !== "string" || typeof item.preview !== "string") {
			return undefined;
		}
		items.push({ branch: item.branch, key: item.key, slug: item.slug, preview: item.preview });
	}

	const branch = typeof details.branch === "string" ? details.branch : undefined;
	if (mode === "branch") {
		return branch === undefined ? { mode, items } : { mode, branch, items };
	}
	return { mode, items };
}

function styleHandoffListLine(line: string, index: number, theme: RenderTheme): string {
	if (line.length === 0) {
		return line;
	}
	if (index === 0) {
		return accentText(theme, line, true);
	}
	if (line.startsWith("     → ")) {
		return theme.fg("muted", line);
	}

	const itemMatch = /^(\s*\d+\.\s+)(.+)$/.exec(line);
	if (itemMatch?.[1] !== undefined && itemMatch[2] !== undefined) {
		return `${theme.fg("dim", itemMatch[1])}${accentText(theme, itemMatch[2], true)}`;
	}
	if (!line.startsWith(" ")) {
		return accentText(theme, line);
	}
	return line;
}

function accentText(theme: RenderTheme, text: string, bold = false): string {
	return theme.fg("accent", bold && theme.bold !== undefined ? theme.bold(text) : text);
}

function sortHandoffItems(items: HandoffListItem[]): HandoffListItem[] {
	return [...items].sort((left, right) => {
		const branchCompare = left.branch.localeCompare(right.branch);
		return branchCompare === 0 ? left.slug.localeCompare(right.slug) : branchCompare;
	});
}

function compactPreview(preview: string): string {
	const compacted = preview.replace(/\s+/g, " ").trim();
	if (compacted.length <= MAX_PREVIEW_CHARS) {
		return compacted;
	}
	return `${compacted.slice(0, MAX_PREVIEW_CHARS - 1)}…`;
}

function setStatus(ctx: BaseRuntimeContext, key: string, value: string | undefined): void {
	if (ctx.hasUI) {
		ctx.ui.setStatus?.(key, value);
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

function buildHandoffTabLaunchTool(pi: ExtensionAPI): ToolDefinition {
	return {
		name: HANDOFF_TAB_LAUNCH_TOOL_NAME,
		label: "Launch Handoff Tab",
		description:
			"Verify a saved handoff exists, then open a focused cmux terminal tab in the current workspace and launch Pi to pick up that handoff.",
		promptSnippet: "Open a focused cmux tab to pick up a saved handoff after the handoff has been saved successfully.",
		promptGuidelines: [
			`Use ${HANDOFF_TAB_LAUNCH_TOOL_NAME} only after a /${HANDOFF_TAB_COMMAND_NAME} prompt has saved the requested handoff successfully.`,
			`${HANDOFF_TAB_LAUNCH_TOOL_NAME} verifies the handoff exists before opening cmux; do not call it before brmem put succeeds.`,
		],
		parameters: {
			type: "object",
			additionalProperties: false,
			properties: {
				branch: {
					type: "string",
					description: "Git branch where the handoff was saved.",
				},
				slug: {
					type: "string",
					description: "Flat semantic handoff slug without .md.",
				},
			},
			required: ["branch", "slug"],
		},
		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const parsed = parseHandoffTabLaunchParams(params);
			if (parsed.type === "invalid") {
				return handoffTabToolFailure(parsed.message);
			}

			onUpdate?.({ content: [{ type: "text", text: "Verifying saved handoff…" }] });
			setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "verifying saved handoff…");
			try {
				const launched = await launchHandoffTab(pi, ctx, parsed.params, signal, onUpdate);
				if (launched.type === "failed") {
					return handoffTabToolFailure(launched.message, launched);
				}
				return {
					content: [{ type: "text", text: formatHandoffTabLaunchSuccess(launched) }],
					details: launched,
				};
			} finally {
				setStatus(ctx, HANDOFF_TAB_STATUS_KEY, undefined);
			}
		},
	};
}

async function launchHandoffTab(
	pi: ExtensionAPI,
	ctx: ToolContext,
	params: HandoffTabLaunchParams,
	signal: AbortSignal | undefined,
	onUpdate: ((update: Partial<ToolResult>) => void) | undefined,
): Promise<HandoffTabLaunchResult> {
	const key = `${params.slug}${HANDOFF_KEY_SUFFIX}`;
	const exists = await checkHandoffExists(pi, ctx.cwd, params.branch, key);
	if (exists.type === "missing") {
		return {
			type: "failed",
			branch: params.branch,
			slug: params.slug,
			message: `No handoff ${params.slug} found on branch ${params.branch}; no cmux tab was opened.`,
		};
	}
	if (exists.type === "failed") {
		return { type: "failed", branch: params.branch, slug: params.slug, message: exists.message };
	}

	onUpdate?.({ content: [{ type: "text", text: "Resolving cmux caller context…" }] });
	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "resolving cmux caller…");
	const identified = await identifyCmuxCaller(pi, ctx.cwd);
	if (identified.type === "failed") {
		return { type: "failed", branch: params.branch, slug: params.slug, message: identified.message };
	}

	onUpdate?.({ content: [{ type: "text", text: "Creating focused cmux tab…" }] });
	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "creating cmux tab…");
	const created = await createCmuxSurface(pi, ctx.cwd, identified.caller, signal);
	if (created.type === "failed") {
		return { type: "failed", branch: params.branch, slug: params.slug, message: created.message };
	}

	const tabTitle = `handoff: ${params.slug}`;
	const workspaceId = created.surface.workspaceId ?? identified.caller.workspaceId;
	onUpdate?.({ content: [{ type: "text", text: "Naming cmux tab…" }] });
	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "naming cmux tab…");
	const renameOptions: CmuxTabOptions = {
		workspaceId,
		surfaceId: created.surface.surfaceId,
		tabTitle,
		signal,
	};
	if (identified.caller.windowId !== undefined) {
		renameOptions.windowId = identified.caller.windowId;
	}
	const renamed = await renameCmuxTab(pi, ctx.cwd, renameOptions);
	if (renamed.type === "failed") {
		return {
			type: "failed",
			branch: params.branch,
			slug: params.slug,
			surfaceId: created.surface.surfaceId,
			workspaceId,
			message: `${renamed.message}\n\nCreated cmux surface: ${created.surface.surfaceId}\nManual recovery: /${PICKUP_HANDOFF_COMMAND_NAME} --branch ${params.branch} ${params.slug}`,
		};
	}

	const thinkingLevel = currentThinkingLevel(pi);
	const command = buildPiLaunchCommand(
		`/${PICKUP_HANDOFF_COMMAND_NAME} --branch ${params.branch} ${params.slug}`,
		ctx.model === undefined ? { thinkingLevel } : { model: ctx.model, thinkingLevel },
	);
	onUpdate?.({ content: [{ type: "text", text: "Launching pickup Pi…" }] });
	setStatus(ctx, HANDOFF_TAB_STATUS_KEY, "launching pickup Pi…");
	const sendOptions: CmuxSendOptions = {
		workspaceId,
		surfaceId: created.surface.surfaceId,
		text: `${command}\n`,
		signal,
	};
	if (identified.caller.windowId !== undefined) {
		sendOptions.windowId = identified.caller.windowId;
	}
	const sent = await sendCmuxText(pi, ctx.cwd, sendOptions);
	if (sent.type === "failed") {
		return {
			type: "failed",
			branch: params.branch,
			slug: params.slug,
			surfaceId: created.surface.surfaceId,
			workspaceId,
			message: `${sent.message}\n\nCreated cmux surface: ${created.surface.surfaceId}\nManual recovery: run ${command}`,
		};
	}

	return {
		type: "launched",
		branch: params.branch,
		slug: params.slug,
		tabTitle,
		surfaceId: created.surface.surfaceId,
		workspaceId,
		command,
	};
}

interface CmuxTabOptions {
	workspaceId: string;
	surfaceId: string;
	windowId?: string;
	tabTitle: string;
	signal: AbortSignal | undefined;
}

interface CmuxSendOptions {
	workspaceId: string;
	surfaceId: string;
	windowId?: string;
	text: string;
	signal: AbortSignal | undefined;
}

interface CmuxExecOptions {
	cwd: string;
	timeout: number;
	signal?: AbortSignal;
}

async function createCmuxSurface(
	pi: ExtensionAPI,
	cwd: string,
	caller: CmuxCallerContext,
	signal: AbortSignal | undefined,
): Promise<{ type: "created"; surface: CmuxCreatedSurface } | { type: "failed"; message: string }> {
	const commandArgs = [
		"--json",
		"new-surface",
		"--type",
		"terminal",
		"--workspace",
		caller.workspaceId,
		"--pane",
		caller.paneId,
		"--focus",
		"true",
	];
	if (caller.windowId !== undefined) {
		commandArgs.push("--window", caller.windowId);
	}

	let result: ExecResult;
	try {
		result = await pi.exec("cmux", commandArgs, cmuxExecOptions(cwd, signal));
	} catch (error) {
		return { type: "failed", message: formatStartupFailure(formatCommand("cmux", commandArgs), error) };
	}
	if (result.code !== 0 || result.killed) {
		return { type: "failed", message: formatExecFailure(formatCommand("cmux", commandArgs), result) };
	}
	const surface = parseCreatedCmuxSurface(result.stdout);
	if (surface === undefined) {
		return { type: "failed", message: "cmux new-surface did not return a surface_id; no launch command was sent." };
	}
	return { type: "created", surface };
}

async function renameCmuxTab(
	pi: ExtensionAPI,
	cwd: string,
	options: CmuxTabOptions,
): Promise<{ type: "renamed" } | { type: "failed"; message: string }> {
	const commandArgs = [
		"rename-tab",
		"--workspace",
		options.workspaceId,
		"--surface",
		options.surfaceId,
		"--title",
		options.tabTitle,
	];
	if (options.windowId !== undefined) {
		commandArgs.push("--window", options.windowId);
	}
	return runCmuxMutation(pi, cwd, commandArgs, options.signal, "renamed");
}

async function sendCmuxText(
	pi: ExtensionAPI,
	cwd: string,
	options: CmuxSendOptions,
): Promise<{ type: "sent" } | { type: "failed"; message: string }> {
	const commandArgs = ["send", "--workspace", options.workspaceId, "--surface", options.surfaceId];
	if (options.windowId !== undefined) {
		commandArgs.push("--window", options.windowId);
	}
	commandArgs.push("--", options.text);
	return runCmuxMutation(pi, cwd, commandArgs, options.signal, "sent");
}

async function runCmuxMutation<TType extends "renamed" | "sent">(
	pi: ExtensionAPI,
	cwd: string,
	commandArgs: string[],
	signal: AbortSignal | undefined,
	successType: TType,
): Promise<{ type: TType } | { type: "failed"; message: string }> {
	let result: ExecResult;
	try {
		result = await pi.exec("cmux", commandArgs, cmuxExecOptions(cwd, signal));
	} catch (error) {
		return { type: "failed", message: formatStartupFailure(formatCommand("cmux", commandArgs), error) };
	}
	if (result.code !== 0 || result.killed) {
		return { type: "failed", message: formatExecFailure(formatCommand("cmux", commandArgs), result) };
	}
	return { type: successType };
}

function cmuxExecOptions(cwd: string, signal: AbortSignal | undefined): CmuxExecOptions {
	if (signal === undefined) {
		return { cwd, timeout: CMUX_TIMEOUT_MS };
	}
	return { cwd, timeout: CMUX_TIMEOUT_MS, signal };
}

function parseHandoffTabLaunchParams(params: unknown): { type: "valid"; params: HandoffTabLaunchParams } | { type: "invalid"; message: string } {
	if (!isRecord(params)) {
		return { type: "invalid", message: "handoff_tab_launch parameters must be an object." };
	}
	const branch = readString(params, "branch");
	const slug = readString(params, "slug");
	if (branch === undefined) {
		return { type: "invalid", message: "handoff_tab_launch requires a non-empty branch." };
	}
	if (slug === undefined) {
		return { type: "invalid", message: "handoff_tab_launch requires a non-empty slug." };
	}
	if (slug.endsWith(HANDOFF_KEY_SUFFIX) || slug.includes("/")) {
		return { type: "invalid", message: "handoff_tab_launch slug must be flat and must not include .md." };
	}
	return { type: "valid", params: { branch, slug } };
}

function currentThinkingLevel(pi: ExtensionAPI): ThinkingLevel {
	return pi.getThinkingLevel?.() ?? "medium";
}

function handoffTabToolFailure(message: string, details?: unknown): ToolResult {
	return {
		content: [{ type: "text", text: message }],
		details,
		isError: true,
	};
}

function formatHandoffTabLaunchSuccess(result: Extract<HandoffTabLaunchResult, { type: "launched" }>): string {
	return [
		"Opened handoff pickup tab.",
		`Handoff: ${result.slug}`,
		`Branch: ${result.branch}`,
		`Tab title: ${result.tabTitle}`,
		`Surface: ${result.surfaceId}`,
		`Workspace: ${result.workspaceId}`,
		`Command: ${result.command}`,
	].join("\n");
}

export default function handoffExtension(pi: ExtensionAPI): void {
	pi.registerMessageRenderer?.(HANDOFF_LIST_MESSAGE_TYPE, renderHandoffListMessage);
	pi.registerTool?.(buildHandoffTabLaunchTool(pi));

	pi.registerCommand(HANDOFF_TAB_COMMAND_NAME, {
		description: "Create a handoff and open a focused cmux tab to pick it up.",
		handler: async (args, ctx) => handleHandoffTabCommand(pi, args, ctx),
	});

	pi.registerCommand(CREATE_HANDOFF_COMMAND_NAME, {
		description: "Create a directed handoff artifact for a future continuation.",
		handler: async (args, ctx) => handleCreateHandoffCommand(pi, args, ctx),
	});

	pi.registerCommand(PICKUP_HANDOFF_COMMAND_NAME, {
		description: "Pick up a handoff by slug, selector, or picker.",
		handler: async (args, ctx) => handlePickupHandoffCommand(pi, args, ctx),
	});

	pi.registerCommand(LIST_HANDOFF_COMMAND_NAME, {
		description: "List handoffs on this branch or across active branches.",
		handler: async (args, ctx) => handleListHandoffCommand(pi, args, ctx),
	});
}
