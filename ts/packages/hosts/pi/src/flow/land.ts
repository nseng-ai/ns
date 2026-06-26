import { registerLandCommand, type LandExtensionAPI } from "@sdl/ccc/land";

import { definePiSurfaceParity } from "../parity/extension.ts";

export type ExtensionAPI = LandExtensionAPI;

export const landParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "sdl:flow:land",
		workflow: "Land the current PR or Graphite stack into trunk",
		parity: "PARTIAL",
		trackedGap:
			"cross-harness-parity roadmap: add a clinkr-based CLI entry and skill for the unified /sdl:flow:land orchestration.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/pi",
		sourceModule: "land",
		notes:
			"Pi command exposes the SDL code-lifecycle surface and delegates to CCC land orchestration; no bin or installed skill currently makes the unified workflow reachable outside Pi.",
	},
] as const);

export default function landExtension(pi: ExtensionAPI): void {
	registerLandCommand(pi);
}
