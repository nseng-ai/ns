import { buildFencedTextBlock, formatErrorMessage } from "@ns/core/primitives";
import {
	HANDOFF_KEY_SUFFIX,
	HANDOFF_NAMESPACE,
	handoffKeyToSlug,
	isHandoffKey,
	listHandoffSummaries,
	readHandoffArtifact,
	type HandoffSummary,
} from "../api/index.ts";
import { currentBranch } from "./branch-resolution.ts";
import { LIST_HANDOFF_COMMAND_NAME, PICKUP_HANDOFF_COMMAND_NAME } from "./command-constants.ts";
import { setStatus } from "./ui-status.ts";
import { createPiHandoffStorageDeps } from "./api-context.ts";
import { HANDOFF_LIST_MESSAGE_TYPE, formatHandoffListPlain } from "./list-rendering.ts";
import type { CommandContext, ExtensionAPI } from "./runtime-types.ts";
import type {
	HandoffArgsParseResult,
	HandoffItemsLoadResult,
	HandoffListItem,
	HandoffListMessageDetails,
	PreviewedHandoffListItem,
	ListHandoffArgs,
	PickupHandoffArgs,
} from "./list-types.ts";

const MAX_PREVIEW_CHARS = 240;

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

type BranchFlagConsumeResult =
	| { type: "consumed"; branch: string; index: number }
	| { type: "invalid"; message: string }
	| { type: "not-branch" };

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
		const branchFlag = consumeBranchFlag(tokens, index);
		if (branchFlag.type === "invalid") {
			return { type: "invalid", message: branchFlag.message };
		}
		if (branchFlag.type === "consumed") {
			parsed.branch = branchFlag.branch;
			index = branchFlag.index;
			continue;
		}
		if (token.startsWith("-")) {
			return { type: "invalid", message: `Unknown flag: ${token}` };
		}
		if (token.includes("/")) {
			return {
				type: "invalid",
				message:
					"Handoff selectors cannot contain '/'; use a semantic slug like address-review-feedback.",
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
		const branchFlag = consumeBranchFlag(tokens, index);
		if (branchFlag.type === "invalid") {
			return { type: "invalid", message: branchFlag.message };
		}
		if (branchFlag.type === "consumed") {
			parsed.branch = branchFlag.branch;
			index = branchFlag.index;
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

function consumeBranchFlag(tokens: readonly string[], index: number): BranchFlagConsumeResult {
	const token = tokens[index];
	if (token === undefined) {
		return { type: "not-branch" };
	}
	if (token === "--branch") {
		const value = tokens[index + 1];
		if (value === undefined || value.startsWith("--")) {
			return { type: "invalid", message: "Missing value for --branch." };
		}
		return { type: "consumed", branch: value, index: index + 1 };
	}
	if (token.startsWith("--branch=")) {
		const value = token.slice("--branch=".length);
		if (value.length === 0) {
			return { type: "invalid", message: "Missing value for --branch." };
		}
		return { type: "consumed", branch: value, index };
	}
	return { type: "not-branch" };
}

export function resolveHandoffKey(
	selector: string[],
	handoffKeys: string[],
): { key?: string; ambiguousKeys?: string[] } {
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
Handoff: ${handoffKeyToSlug(key)}

Technical locator:
- Namespace: ${HANDOFF_NAMESPACE}
- Entry: ${key}

Report the branch and handoff slug picked up, summarize the continuation focus or current state, list proposed immediate next steps from the artifact, and call out any risks, stale assumptions, or verification needed. Then stop and wait for the user's instruction before running commands, editing files, or continuing implementation. If the artifact is stale or incomplete, do not proceed automatically; summarize what should be verified before work continues.

${buildFencedTextBlock(artifact, "markdown")}`;
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
	return selector
		.flatMap((part) => part.toLowerCase().split(/[-_.]+/))
		.filter((term) => term.length > 0);
}

function handoffKeyTokens(key: string): string[] {
	return splitSelectorTerms([handoffKeyToSlug(key)]);
}

export async function handlePickupHandoffCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
): Promise<void> {
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
		selectedKey = await chooseHandoff(
			pi,
			ctx,
			branch,
			itemsForKeys(handoffItems, selection.ambiguousKeys),
		);
	} else {
		const selectorText = args.selector.join(" ").trim() || "(none)";
		ctx.ui.notify(
			`No handoff matched ${selectorText} on branch ${branch}. Available: ${slugList(handoffItems)}.`,
			"warning",
		);
		return;
	}

	if (selectedKey === undefined) {
		return;
	}

	let artifact: string;
	setStatus(ctx, PICKUP_HANDOFF_COMMAND_NAME, `reading ${handoffKeyToSlug(selectedKey)}…`);
	try {
		artifact = await readHandoff(pi, ctx, branch, selectedKey);
	} catch (error) {
		ctx.ui.notify(formatErrorMessage(error), "error");
		return;
	} finally {
		setStatus(ctx, PICKUP_HANDOFF_COMMAND_NAME, undefined);
	}

	if (ctx.hasUI) {
		ctx.ui.notify(
			`Picked up handoff ${handoffKeyToSlug(selectedKey)} from branch ${branch}.`,
			"info",
		);
	}
	pi.sendUserMessage(buildPickupHandoffPrompt(branch, selectedKey, artifact));
}

export async function handleListHandoffCommand(
	pi: ExtensionAPI,
	rawArgs: string,
	ctx: CommandContext,
): Promise<void> {
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
		ctx.ui.notify(
			args.allBranches
				? "No handoffs found across active branches."
				: `No handoffs found on branch ${branch}.`,
			"info",
		);
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
	const deps = createPiHandoffStorageDeps(pi, ctx.cwd);
	const summaries = await listHandoffSummaries(deps, {
		...("allBranches" in options ? {} : { branch: options.branch }),
		shouldIncludeDeleted: false,
	});
	if (summaries.type === "error") {
		return { type: "failed", message: summaries.error.message };
	}
	return { type: "loaded", items: summaries.value.map(handoffSummaryToListItem) };
}

async function readHandoff(
	pi: ExtensionAPI,
	ctx: Pick<CommandContext, "cwd">,
	branch: string,
	key: string,
): Promise<string> {
	const deps = createPiHandoffStorageDeps(pi, ctx.cwd);
	const result = await readHandoffArtifact(deps, { branch, slug: handoffKeyToSlug(key) });
	if (result.type === "error") {
		throw new Error(result.error.message);
	}
	return result.value.content;
}

async function chooseHandoff(
	pi: ExtensionAPI,
	ctx: CommandContext,
	branch: string,
	items: HandoffListItem[],
): Promise<string | undefined> {
	if (!ctx.hasUI || ctx.ui.select === undefined) {
		ctx.ui.notify(
			`Found multiple handoffs on branch ${branch}:\n\n${items.map((item) => item.slug).join("\n")}\n\nRerun with a slug.`,
			"warning",
		);
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
		} catch {
			previewedItems.push({ ...item, preview: "(preview unreadable)" });
		}
	}
	return previewedItems;
}

function handoffSummaryToListItem(summary: HandoffSummary): HandoffListItem {
	return { branch: summary.branch, key: summary.key, slug: summary.slug };
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

function emitHandoffList(
	pi: ExtensionAPI,
	ctx: CommandContext,
	details: HandoffListMessageDetails,
): void {
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

function compactPreview(preview: string): string {
	const compacted = preview.replace(/\s+/g, " ").trim();
	if (compacted.length <= MAX_PREVIEW_CHARS) {
		return compacted;
	}
	return `${compacted.slice(0, MAX_PREVIEW_CHARS - 1)}…`;
}
