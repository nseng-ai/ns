import { MODEL_SHORTCUTS, modelRef } from "../core/model-shortcuts/extension.ts";
import { definePiSurfaceParity } from "../runtime/parity-extension.ts";

export const modelShortcutParity = definePiSurfaceParity(
	MODEL_SHORTCUTS.map((shortcut) => ({
		kind: "command",
		surface: shortcut.command,
		workflow: `Switch the current Pi session model to ${modelRef(shortcut)}`,
		parity: "WAIVED",
		fallback:
			"Use the target harness's own model-selection mechanism before continuing the workflow.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@ns/pi",
		sourceModule: "model-shortcuts",
		notes:
			"Model shortcuts are Pi session-local conveniences rather than portable engineering workflow logic.",
	})),
);
