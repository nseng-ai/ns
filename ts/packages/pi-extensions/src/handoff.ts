import { formatCommand, type ExecResult } from "@asdl/core/exec";
import { formatErrorMessage } from "@asdl/core/primitives";
import { isRecord } from "./cmux/primitives.ts";
import { definePiSurfaceParity } from "./parity.ts";
import { HANDOFF_KEY_SUFFIX, HANDOFF_NAMESPACE, deriveSemanticHandoffSlug, handoffKeyToSlug as handoffSlug, isHandoffKey } from "@asdl/handoff/identity";
import { truncateDisplayLine } from "./terminal-presentation.ts";
import { buildDeriveHandoffSlugTool, buildHandoffTabLaunchTool, buildHandoffTabPrompt, handleHandoffTabCommand } from "./handoff/tab.ts";
import {
	buildHandoffSelfLaunchTool,
	buildHandoffSelfPrompt,
	formatHandoffSelfKickoffPrompt,
	handleHandoffSelfCommand,
	handleHandoffSelfPickupCommand,
} from "./handoff/self.ts";
import {
	BRMEM_TIMEOUT_MS,
	CREATE_HANDOFF_COMMAND_NAME,
	DERIVE_HANDOFF_SLUG_TOOL_NAME,
	HANDOFF_TAB_LAUNCH_TOOL_NAME,
	HANDOFF_TIMEOUT_MS,
	HANDOFF_TAB_COMMAND_NAME,
	HANDOFF_SELF_COMMAND_NAME,
	HANDOFF_SELF_PICKUP_COMMAND_NAME,
	LIST_HANDOFF_COMMAND_NAME,
	PICKUP_HANDOFF_COMMAND_NAME,
	CREATE_HANDOFF_FALLBACK,
	CREATE_HANDOFF_SKILL_NAME,
	createHandoffStartMessage,
	currentBranch,
	expandHandoffSkill,
	fencedBlock,
	formatExecFailure,
	formatStartupFailure,
	resolveCreateFocus,
	setStatus,
	type HandoffStartMessages,
} from "./handoff/shared.ts";
import type {
	CommandContext,
	CustomMessage,
	ExtensionAPI,
	RenderComponent,
	RenderTheme,
} from "./handoff/runtime-types.ts";

export const handoffParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: CREATE_HANDOFF_COMMAND_NAME,
		workflow: "Create a directed handoff artifact for a future continuation",
		parity: "FULL",
		cli: "handoff create workflow over brmem",
		skill: "handoff-create",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "handoff",
		notes: "Pi command expands the portable handoff-create skill and stores through Branch Memory only after model confirmation.",
	},
	{
		kind: "command",
		surface: PICKUP_HANDOFF_COMMAND_NAME,
		workflow: "Pick up an existing handoff artifact",
		parity: "FULL",
		cli: "handoff pickup workflow over brmem",
		skill: "handoff-pickup",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "handoff",
		notes: "Pi command reads Branch Memory handoff artifacts and expands the same portable pickup workflow.",
	},
	{
		kind: "command",
		surface: LIST_HANDOFF_COMMAND_NAME,
		workflow: "List handoff artifacts for this branch or active local branches",
		parity: "FULL",
		cli: "handoff list workflow over brmem",
		skill: "handoff-pickup",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "handoff",
		notes: "List support is part of the portable handoff pickup/list workflow.",
	},
	{
		kind: "command",
		surface: HANDOFF_TAB_COMMAND_NAME,
		workflow: "Create a handoff and open a focused cmux tab to pick it up",
		parity: "WAIVED",
		fallback: "Create the handoff with handoff-create, then manually open the target harness/session and pick it up with handoff-pickup.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "handoff",
		notes: "Focused cmux tab launch is a Pi/cmux session primitive; storage and pickup are separately portable.",
	},
	{
		kind: "command",
		surface: HANDOFF_SELF_COMMAND_NAME,
		workflow: "Create a handoff, replace the current Pi session, and pick it up in the fresh session",
		parity: "WAIVED",
		fallback: "Create the handoff with handoff-create, start a new Pi session manually, then run handoff-pickup for the saved artifact.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "handoff",
		notes: "Self handoff depends on Pi's session replacement primitive; storage and pickup remain portable handoff workflows.",
	},
	{
		kind: "command",
		surface: HANDOFF_SELF_PICKUP_COMMAND_NAME,
		workflow: "Replace the current Pi session and run handoff pickup for a saved artifact",
		parity: "WAIVED",
		fallback: "Start a new Pi session manually, then run handoff-pickup for the saved artifact.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "handoff",
		notes: "This follow-up command is the session-replacement half of /handoff:self.",
	},
] as const);

export type { CommandContext, ExecResult, ExtensionAPI } from "./handoff/runtime-types.ts";
export type { HandoffTabLaunchResult } from "./handoff/tab.ts";
export { formatHandoffSelfKickoffPrompt, buildHandoffSelfPrompt, buildHandoffTabPrompt, deriveSemanticHandoffSlug };

export const HANDOFF_LIST_MESSAGE_TYPE = "handoff-list";
const MAX_PREVIEW_CHARS = 240;

const CREATE_HANDOFF_START_MESSAGES = {
	ready: "Starting handoff create workflow…",
	fallbackLabel: "handoff-create workflow prompt",
} satisfies HandoffStartMessages;

const PICKUP_HANDOFF_USAGE = `Usage: /${PICKUP_HANDOFF_COMMAND_NAME} [options] [semantic-slug|search words]

Pick up an existing handoff from this branch, present its summary, and wait for user direction.

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

type HandoffItemsLoadResult = { type: "loaded"; items: HandoffListItem[] } | { type: "failed"; message: string };

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
	return `Read this handoff artifact as active context for the session and present a concise handoff summary to the user.

Branch: ${branch}
Handoff: ${handoffSlug(key)}

Technical locator:
- Namespace: ${HANDOFF_NAMESPACE}
- Entry: ${key}

Report the branch and handoff slug picked up, summarize the continuation focus or current state, list proposed immediate next steps from the artifact, and call out any risks, stale assumptions, or verification needed. Then stop and wait for the user's instruction before running commands, editing files, or continuing implementation. If the artifact is stale or incomplete, do not proceed automatically; summarize what should be verified before work continues.

${fencedBlock("markdown", artifact)}`;
}

export function buildCreateHandoffPrompt(skillBlock: string | undefined, focus: string): string {
	const focusText = focus.trim();
	return `${skillBlock ?? CREATE_HANDOFF_FALLBACK}

Create a directed handoff artifact for this session.

Continuation focus:

${fencedBlock("text", focusText)}

Treat this as an explicit request to run the handoff create workflow. The handoff must be directed toward the supplied continuation focus. Compose the final Markdown handoff artifact first, then derive a semantic slug from that final content unless the user explicitly supplied one. Avoid overwriting an existing artifact unless replacement was explicitly requested, and keep normal copy focused on creating/picking up a handoff.

Before writing, confirm the branch unless the user explicitly named one, derive the slug from the final artifact content, and check for an existing key. Do not create a temporary Markdown file; store final Markdown directly through /dev/stdin:

${fencedBlock(
		"bash",
		`brmem check <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch>
brmem put <semantic-slug>${HANDOFF_KEY_SUFFIX} --namespace ${HANDOFF_NAMESPACE} --branch <branch> --file /dev/stdin <<'HANDOFF_EOF'
<final Markdown handoff content>
HANDOFF_EOF`,
	)}

Report the created handoff first. Include Branch Memory details only as technical storage evidence.`;
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

async function handleCreateHandoffCommand(pi: ExtensionAPI, args: string, ctx: CommandContext): Promise<void> {
	await ctx.waitForIdle();
	const focus = await resolveCreateFocus(pi, args, ctx);
	if (focus === undefined) {
		return;
	}

	let skill: Awaited<ReturnType<typeof expandHandoffSkill>>;
	let skillReadError: string | undefined;
	try {
		skill = await expandHandoffSkill(ctx.cwd, CREATE_HANDOFF_SKILL_NAME);
	} catch (error) {
		skillReadError = formatErrorMessage(error);
	}

	if (ctx.hasUI) {
		ctx.ui.notify(createHandoffStartMessage(CREATE_HANDOFF_START_MESSAGES, skill, skillReadError), skill ? "info" : "warning");
	}
	pi.sendUserMessage(buildCreateHandoffPrompt(skill?.block, focus));
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
		ctx.ui.notify(formatErrorMessage(error), "error");
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
		ctx.ui.notify(formatErrorMessage(error), "error");
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
		ctx.ui.notify(formatErrorMessage(error), "error");
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
	const lines = [details.mode === "all-branches" ? "Handoffs across branches" : `Handoffs on ${branch}`];
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

export default function handoffExtension(pi: ExtensionAPI): void {
	pi.registerMessageRenderer?.(HANDOFF_LIST_MESSAGE_TYPE, renderHandoffListMessage);

	if (pi.registerTool !== undefined) {
		pi.registerTool(buildDeriveHandoffSlugTool(pi));
		pi.registerTool(buildHandoffTabLaunchTool(pi));
		pi.registerTool(buildHandoffSelfLaunchTool(pi));
		pi.registerCommand(HANDOFF_TAB_COMMAND_NAME, {
			description: "Create a handoff and open a focused cmux tab to pick it up.",
			handler: async (args, ctx) => handleHandoffTabCommand(pi, args, ctx),
		});
		pi.registerCommand(HANDOFF_SELF_COMMAND_NAME, {
			description: "Create a handoff, clear context, and pick it up in this Pi session.",
			handler: async (args, ctx) => handleHandoffSelfCommand(pi, args, ctx),
		});
		pi.registerCommand(HANDOFF_SELF_PICKUP_COMMAND_NAME, {
			description: "Clear context and pick up a saved handoff in this Pi session.",
			handler: async (args, ctx) => handleHandoffSelfPickupCommand(pi, args, ctx),
		});
	}

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
