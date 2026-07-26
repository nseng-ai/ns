import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";
import { composeEditorComponent, withEditorInput, type EditorDecorator } from "./editor-compose.ts";

/** Decorates an editor so Shift+Enter and Alt+Enter insert a literal newline. */
export function createMultilineEditorDecorator(
	isMultilineKey: (data: string) => boolean = matchesMultilineKey,
): EditorDecorator {
	return (editor) =>
		withEditorInput(editor, (data, delegate) => {
			delegate(isMultilineKey(data) ? "\n" : data);
		});
}

export function matchesMultilineKey(data: string): boolean {
	return matchesKey(data, "shift+enter") || matchesKey(data, "alt+enter");
}

export function registerMultilineEditor(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		composeEditorComponent(ctx.ui, createMultilineEditorDecorator());
	});
}
