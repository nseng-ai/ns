import { modelShortcutParity } from "./model-shortcuts.ts";
import { prExtensionParity } from "../core/pr/extension.ts";
import { worktreeStatusParity } from "./worktree-status.ts";
import type { PiSurfaceParity } from "../runtime/parity-extension.ts";

// Extracted Pi-tool packages own package-local parity metadata/tests and are
// registered through .pi/extensions/*.ts discovery adapters. Importing them into
// this host static registry would invert the intended tool -> @nseng-ai/pi-runtime dependency direction.
export const STATIC_PI_EXTENSION_PARITY_RECORDS = [
	...modelShortcutParity,
	...prExtensionParity,
	...worktreeStatusParity,
] as const;

export function loadPiExtensionParityRecords(): readonly PiSurfaceParity[] {
	return STATIC_PI_EXTENSION_PARITY_RECORDS;
}
