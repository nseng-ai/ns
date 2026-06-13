import { registerLandCommand, type LandExtensionAPI } from "@asdl/ccc/land";

import { definePiSurfaceParity } from "./parity.ts";

export type ExtensionAPI = LandExtensionAPI;

export const landParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "code:land",
		workflow: "Land the current PR or Graphite stack into trunk",
		parity: "PARTIAL",
		trackedGap: "cross-harness-parity roadmap: add a clinkr-based CLI entry and skill for the unified /code:land orchestration.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "land",
		notes: "CCC land orchestration is extracted and test-backed, but no bin or installed skill currently makes the unified workflow reachable outside Pi.",
	},
] as const);

export default function landExtension(pi: ExtensionAPI): void {
	registerLandCommand(pi);
}
