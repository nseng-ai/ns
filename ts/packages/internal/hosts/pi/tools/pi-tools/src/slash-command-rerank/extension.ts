/**
 * Pi extension that stacks a re-ranking wrapper over the host's built-in
 * autocomplete provider so namespaced slash commands surface on their suffix
 * segment (typing `/next` or `/nex` promotes `ns:objective:next`). It registers
 * no command or tool; on `session_start` it hands `ctx.ui.addAutocompleteProvider`
 * a factory that wraps the current provider. In rpc/minimal hosts the optional
 * `addAutocompleteProvider` is absent, so the extension is a no-op there.
 */

import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { AutocompleteProvider, SessionStartContext } from "@nseng-ai/pi-runtime/runtime/types";

import { rerankSlashCommandItems, slashCommandRerankQuery } from "./rerank.ts";

export interface SlashCommandRerankExtensionAPI {
	on(
		event: "session_start",
		handler: (event: unknown, ctx: SessionStartContext) => Promise<void> | void,
	): void;
}

/**
 * Wrap `current` so slash-command-NAME completion is re-ranked while every other
 * completion (argument, at-prefix, path) and every other provider method passes
 * through to `current` unchanged. Delegating method calls preserve `this` for the
 * class-based built-in provider.
 */
export function createSlashCommandRerankProvider(
	current: AutocompleteProvider,
): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const suggestions = await current.getSuggestions(lines, cursorLine, cursorCol, options);
			if (suggestions === null) return null;
			const query = slashCommandRerankQuery(lines, cursorLine, cursorCol, suggestions);
			if (query === null) return suggestions;
			return { ...suggestions, items: rerankSlashCommandItems(suggestions.items, query) };
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			if (
				isStaleSlashCommandCompletion({
					lines,
					cursorLine,
					cursorCol,
					itemValue: item.value,
					prefix,
				})
			) {
				return { lines, cursorLine, cursorCol };
			}
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},
		...optionalEntry(
			"shouldTriggerFileCompletion",
			current.shouldTriggerFileCompletion === undefined
				? undefined
				: (lines: string[], cursorLine: number, cursorCol: number) =>
						current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? false,
		),
	};
}

/**
 * Reject a slash-command picker item computed for older editor text. Pi TUI can
 * keep the prior picker visible while queued async refreshes catch up with a
 * fast terminal input burst; accepting it would replace or prepend the stale
 * command (commonly `/settings`) when the user presses Enter.
 */
interface IsStaleSlashCommandCompletionOptions {
	readonly lines: readonly string[];
	readonly cursorLine: number;
	readonly cursorCol: number;
	readonly itemValue: string;
	readonly prefix: string;
}

function isStaleSlashCommandCompletion({
	lines,
	cursorLine,
	cursorCol,
	itemValue,
	prefix,
}: IsStaleSlashCommandCompletionOptions): boolean {
	if (!prefix.startsWith("/") || prefix.slice(1).includes("/") || itemValue.includes("/")) {
		return false;
	}
	const line = lines[cursorLine] ?? "";
	const textBeforeCursor = line.slice(0, cursorCol);
	const textAfterCursor = line.slice(cursorCol);
	return textBeforeCursor !== prefix || textAfterCursor.trim().length > 0;
}

export default function slashCommandRerankExtension(pi: SlashCommandRerankExtensionAPI): void {
	let isRegistered = false;
	pi.on("session_start", (_event, ctx) => {
		if (isRegistered) return;
		// LBYL: rpc/minimal hosts have no addAutocompleteProvider. The flag prevents
		// double-wrapping if session_start ever re-fires.
		ctx.ui.addAutocompleteProvider?.(createSlashCommandRerankProvider);
		isRegistered = true;
	});
}
