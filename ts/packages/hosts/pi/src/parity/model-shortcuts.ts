import { definePiSurfaceParity } from "../runtime/parity-extension.ts";

export const modelShortcutParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "model:*",
		workflow: "Switch the current Pi session model using a configured model profile",
		parity: "WAIVED",
		fallback:
			"Use the target harness's own model-selection mechanism before continuing the workflow.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@nseng-ai/pi",
		sourceModule: "model-shortcuts",
		notes:
			"Model profile commands are generated from ns.toml and are Pi session-local conveniences rather than portable engineering workflow logic.",
		matching: {
			type: "dynamic-family",
			rationale:
				"Profile names and command registrations are generated from project policy at session_start.",
		},
	},
] as const);
