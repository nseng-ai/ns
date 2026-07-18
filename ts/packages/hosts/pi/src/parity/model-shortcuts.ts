import { MODEL_SHORTCUT_CATALOG } from "../core/model-shortcuts/extension.ts";
import { definePiSurfaceParity } from "../runtime/parity-extension.ts";

export const modelShortcutParity = definePiSurfaceParity(
	MODEL_SHORTCUT_CATALOG.map((shortcut) => ({
		kind: "command",
		surface: shortcut.command,
		workflow: `Switch the current Pi session model using the ${shortcut.key} shortcut`,
		parity: "WAIVED",
		fallback:
			"Use the target harness's own model-selection mechanism before continuing the workflow.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi",
		sourceModule: "model-shortcuts",
		notes:
			"Model shortcuts are Pi session-local conveniences rather than portable engineering workflow logic.",
	})),
);
