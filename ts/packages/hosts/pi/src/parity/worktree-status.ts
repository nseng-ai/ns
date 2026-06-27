import { definePiSurfaceParity } from "./extension.ts";

// The implementation lives in @sdl/worktree-status. This tiny Pi-owned record keeps
// parity accounting local without making @sdl/pi import the extension package.
export const worktreeStatusParity = definePiSurfaceParity([
	{
		kind: "command",
		surface: "pi:worktree-status-refresh",
		workflow: "Manually refresh the Pi worktree status footer",
		parity: "WAIVED",
		fallback:
			"Outside Pi, run the underlying Git, Graphite, GitHub, and Branch Memory fact commands directly or rely on the harness's own status surface.",
		ownerObjective: "cross-harness-parity",
		sourcePackage: "@sdl/worktree-status",
		sourceModule: "extension",
		notes:
			"This command is Pi-native status UI owned by @sdl/worktree-status; @sdl/pi keeps only parity metadata to avoid a package cycle.",
	},
] as const);
