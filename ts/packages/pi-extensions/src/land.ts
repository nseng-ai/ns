import { registerLandCommand, type LandExtensionAPI } from "@asdl/ccc/land";

import { definePiSurfaceParity } from "./parity.ts";

export type ExtensionAPI = LandExtensionAPI;

export const landParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "code:land",
		workflow: "Land the current PR or Graphite stack into trunk",
		parity: "NONE",
		trackedGap: "cross-harness-parity roadmap: add a clinkr-based CLI entry and skill for the unified /code:land orchestration.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "land",
		notes: "Pi command is a stable adapter over CCC land orchestration; no installed skill currently claims exact semantic parity.",
	},
] as const);

export default function landExtension(pi: ExtensionAPI): void {
	registerLandCommand(pi);
}
