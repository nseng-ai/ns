import { registerLandCommand, type LandExtensionAPI } from "@asdl/ccc/land";

import { definePiSurfaceParity } from "./parity.ts";

export type ExtensionAPI = LandExtensionAPI;

export const landParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "sdl:code:land",
		workflow: "Land the current PR or Graphite stack into trunk",
		parity: "PARTIAL",
		trackedGap:
			"cross-harness-parity roadmap: add a clinkr-based CLI entry and skill for the unified /sdl:code:land orchestration.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "land",
		notes:
			"Pi command exposes the SDL code-lifecycle surface and delegates to CCC land orchestration; no bin or installed skill currently makes the unified workflow reachable outside Pi.",
	},
] as const);

export default function landExtension(pi: ExtensionAPI): void {
	registerLandCommand(pi);
}
