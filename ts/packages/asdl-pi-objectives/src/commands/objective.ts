import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";

import { runObjectiveList } from "./list.ts";
import { runObjectiveNext } from "./next.ts";

const CUSTOM_TYPE = "objective";

const SUBCOMMANDS = [
	{
		name: "next",
		description: "Inspect an objective and suggest the next PR-sized slice",
	},
	{
		name: "list",
		description: "Render objective list in the Pi TUI",
	},
] as const;

const LIST_FLAGS = [
	{
		value: "--here",
		label: "--here",
		description: "list objective snapshots on the current branch",
	},
	{
		value: "--branch ",
		label: "--branch <name>",
		description: "list objective snapshots for a specific branch",
	},
	{
		value: "--all",
		label: "--all",
		description: "include closed objectives in repo view",
	},
	{
		value: "--closed",
		label: "--closed",
		description: "show only closed objectives in repo view",
	},
] as const;

export type ParsedObjectiveCommand = {
	subcommand?: string;
	restArgs: string;
};

export function parseRootArgs(argsText: string): ParsedObjectiveCommand {
	const trimmed = argsText.trim();
	if (trimmed.length === 0) {
		return { restArgs: "" };
	}

	const match = trimmed.match(/^(\S+)(?:\s+(.*))?$/s);
	if (!match?.[1]) {
		return { restArgs: "" };
	}

	return {
		subcommand: match[1],
		restArgs: match[2] ?? "",
	};
}

export function formatObjectiveRootUsage(): string {
	return "Usage: /objective <next|list> [args]\nAliases remain available: /objective-next, /objective-list.";
}

export function formatUnknownSubcommandMessage(subcommand: string): string {
	return `Unknown objective subcommand: ${subcommand}\nValid subcommands: next, list, ls.`;
}

export function completeObjectiveArgs(prefix: string): AutocompleteItem[] | null {
	const argsPrefix = prefix.replace(/^\s+/, "");
	const firstToken = argsPrefix.match(/^\S+/)?.[0];
	const completingFirstToken = !firstToken || argsPrefix.length === firstToken.length;

	if (completingFirstToken) {
		return completeSubcommand(firstToken ?? "");
	}

	if (firstToken === "list" || firstToken === "ls") {
		return completeListArgs(argsPrefix);
	}

	if (firstToken === "next") {
		return null;
	}

	return completeSubcommand(firstToken);
}

export function completeSubcommand(prefix: string): AutocompleteItem[] | null {
	const filtered = SUBCOMMANDS.filter((subcommand) => subcommand.name.startsWith(prefix)).map((subcommand) => ({
		value: `${subcommand.name} `,
		label: subcommand.name,
		description: subcommand.description,
	}));
	return filtered.length > 0 ? filtered : null;
}

export function completeListArgs(prefix: string): AutocompleteItem[] | null {
	const match = prefix.match(/^(list|ls)\s+(.*)$/s);
	if (!match?.[1]) {
		return null;
	}

	const subcommand = match[1];
	const restPrefix = match[2] ?? "";
	const currentToken = restPrefix.match(/(?:^|\s)(\S*)$/)?.[1] ?? "";
	const precedingArgs = restPrefix.slice(0, restPrefix.length - currentToken.length).trimEnd();
	const filtered = LIST_FLAGS.filter((flag) => flag.value.startsWith(currentToken)).map((flag) => {
		const restValue = precedingArgs ? `${precedingArgs} ${flag.value}` : flag.value;
		return {
			value: `${subcommand} ${restValue}`,
			label: flag.label,
			description: flag.description,
		};
	});
	return filtered.length > 0 ? filtered : null;
}

function emitRootMessage(pi: ExtensionAPI, content: string, details: Record<string, unknown> = {}): void {
	pi.sendMessage({
		customType: CUSTOM_TYPE,
		content,
		display: true,
		details,
	});
}

async function dispatchObjectiveRoot(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	parsed: ParsedObjectiveCommand,
): Promise<void> {
	if (parsed.subcommand === "next") {
		await runObjectiveNext(pi, ctx, parsed.restArgs);
		return;
	}
	if (parsed.subcommand === "list" || parsed.subcommand === "ls") {
		await runObjectiveList(pi, ctx, parsed.restArgs);
		return;
	}

	const message = parsed.subcommand ? formatUnknownSubcommandMessage(parsed.subcommand) : formatObjectiveRootUsage();
	const status = parsed.subcommand ? "unknown-subcommand" : "usage";
	emitRootMessage(pi, message, { status, subcommand: parsed.subcommand });
	if (ctx.hasUI) {
		ctx.ui.notify(message.split("\n")[0] ?? message, parsed.subcommand ? "error" : "info");
	}
}

export function registerObjectiveRoot(pi: ExtensionAPI): void {
	pi.registerCommand("objective", {
		description: "Run asdl objective commands (next, list)",
		getArgumentCompletions: completeObjectiveArgs,
		handler: async (argsText, ctx) => {
			await dispatchObjectiveRoot(pi, ctx, parseRootArgs(argsText));
		},
	});
}
