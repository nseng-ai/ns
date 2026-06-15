import { isRecord } from "../cmux/primitives.ts";
import { truncateDisplayLine } from "../terminal-presentation.ts";
import { PICKUP_HANDOFF_COMMAND_NAME } from "./shared.ts";
import type { CustomMessage, RenderComponent, RenderTheme } from "./runtime-types.ts";
import type {
	HandoffListBranchGroup,
	HandoffListMessageDetails,
	HandoffListMessageItem,
	HandoffListMode,
} from "./list-types.ts";

export const HANDOFF_LIST_MESSAGE_TYPE = "handoff-list";

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
