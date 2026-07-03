import { definePiSurfaceParity } from "../runtime/parity-extension.ts";

// The implementation lives in @ns/pi/worktree-status. This record keeps parity
// accounting adjacent to the Pi-owned worktree-status surface.
export const worktreeStatusParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "pi:worktree-status-refresh",
		workflow: "Manually refresh the Pi worktree status footer",
		parity: "WAIVED",
		fallback:
			"Outside Pi, run the underlying Git, Graphite, GitHub, and Branch Memory fact commands directly or rely on the harness's own status surface.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@ns/pi/worktree-status",
		sourceModule: "extension",
		notes:
			"This command is Pi-native status UI owned by @ns/pi/worktree-status; the host package records parity for its own footer surface.",
	},
] as const);
