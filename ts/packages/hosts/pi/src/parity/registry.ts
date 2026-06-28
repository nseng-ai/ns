import { branchContextExtensionParity } from "../branch-context/extension.ts";
import { claudeHandoffParity } from "../claude/handoff-command.ts";
import { codeWorkflowsParity } from "../flow/code-workflows.ts";
import { handoffParity } from "../handoff/extension.ts";
import { investigateParity } from "../investigate/extension.ts";
import { modelShortcutParity } from "../models/shortcuts.ts";
import { objectiveParity } from "../objectives/extension.ts";
import { prFeedbackWatchParity } from "../pr/feedback-watch.ts";
import { prExtensionParity } from "../pr/extension.ts";
import { sdlExtensionParity } from "../flow/sdl-extension.ts";
import { smartRestackParity } from "../flow/smart-restack.ts";
import { stackSquashParity } from "../flow/stack-squash.ts";
import { worktreeStatusParity } from "./worktree-status.ts";
import type { PiSurfaceParity } from "./extension.ts";

// Extracted Pi-tool packages own package-local parity metadata/tests and are
// registered through .pi/extensions/*.ts discovery adapters. Importing them into
// this host static registry would invert the intended tool -> @sdl/pi dependency direction.
export const STATIC_PI_EXTENSION_PARITY_RECORDS = [
	...branchContextExtensionParity,
	...claudeHandoffParity,
	...codeWorkflowsParity,
	...handoffParity,
	...investigateParity,
	...modelShortcutParity,
	...objectiveParity,
	...prFeedbackWatchParity,
	...prExtensionParity,
	...sdlExtensionParity,
	...smartRestackParity,
	...stackSquashParity,
	...worktreeStatusParity,
] as const;

export function loadPiExtensionParityRecords(): readonly PiSurfaceParity[] {
	return STATIC_PI_EXTENSION_PARITY_RECORDS;
}
