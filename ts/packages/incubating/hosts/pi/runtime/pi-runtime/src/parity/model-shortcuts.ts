import { MODEL_SHORTCUTS, modelRef } from "../core/model-shortcuts/extension.ts";
import { definePiSurfaceParity } from "../runtime/parity-extension.ts";

export const modelShortcutParity = definePiSurfaceParity(
	MODEL_SHORTCUTS.map((shortcut) => ({
		kind: "command",
		surface: shortcut.command,
		workflow: `Switch the current Pi session model to ${modelRef(shortcut)} and optionally execute supplied prompt text`,
		parity: "WAIVED",
		fallback:
			"Select the equivalent model with the target harness, then submit the prompt through its ordinary input mechanism.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi-runtime",
		sourceModule: "model-shortcuts",
		notes:
			"Model shortcuts are Pi session-local conveniences rather than portable engineering workflow logic.",
	})),
);
