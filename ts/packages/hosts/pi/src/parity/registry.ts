import { investigateParity } from "../investigate/extension.ts";
import { modelShortcutParity } from "../models/shortcuts.ts";
import { prExtensionParity } from "../pr/extension.ts";
import { worktreeStatusParity } from "./worktree-status.ts";
import type { PiSurfaceParity } from "./extension.ts";

// Extracted Pi-tool packages own package-local parity metadata/tests and are
// registered through .pi/extensions/*.ts discovery adapters. Importing them into
// this host static registry would invert the intended tool -> @sdl/pi dependency direction.
export const STATIC_PI_EXTENSION_PARITY_RECORDS = [
	...investigateParity,
	...modelShortcutParity,
	...prExtensionParity,
	...worktreeStatusParity,
] as const;

export function loadPiExtensionParityRecords(): readonly PiSurfaceParity[] {
	return STATIC_PI_EXTENSION_PARITY_RECORDS;
}
