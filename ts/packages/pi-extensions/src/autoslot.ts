import { registerAutoslotCommand, type AutoslotExtensionAPI } from "@asdl/ccc/autoslot";

import { definePiSurfaceParity } from "./parity.ts";

export type ExtensionAPI = AutoslotExtensionAPI;

export const autoslotParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "code:autoslot",
		workflow: "Create a Graphite branch from current work, then move it into a managed slot worktree",
		parity: "PARTIAL",
		trackedGap: "cross-harness-parity roadmap: decide whether autoslot gets a portable skill or remains a Pi-only source-control convenience.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@asdl/pi-extensions",
		sourceModule: "autoslot",
		notes: "Pi command delegates to CCC autoslot orchestration; no dedicated non-Pi skill currently owns the slot-moving variant.",
	},
] as const);

export default function autoslotExtension(pi: ExtensionAPI): void {
	registerAutoslotCommand(pi);
}
