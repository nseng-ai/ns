import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCondensedScreenshots } from "./condensed-screenshots.ts";
import { registerMultilineEditor } from "./multiline-editor.ts";

export type EditorModFeature = (pi: ExtensionAPI) => void;

/**
 * The enabled feature list is intentionally source-controlled for now.
 * Comment out one registration line to disable that feature.
 */
export const enabledEditorModFeatures: readonly EditorModFeature[] = [
	registerMultilineEditor,
	registerCondensedScreenshots,
];

export default function editorModsExtension(pi: ExtensionAPI): void {
	for (const registerFeature of enabledEditorModFeatures) registerFeature(pi);
}
