import { branchContextExtensionParity } from "./branch-context-extension.ts";
import { claudeHandoffParity } from "./claude/handoff-command.ts";
import { codeWorkflowsParity } from "./code-workflows.ts";
import { contextProfilerParity } from "./context-profiler.ts";
import { grillUiParity } from "./grill-ui.ts";
import { handoffParity } from "./handoff.ts";
import { investigateParity } from "./investigate.ts";
import { modelShortcutParity } from "./model-shortcuts.ts";
import { objectiveParity } from "./objective.ts";
import { prFeedbackWatchParity } from "./pr-feedback-watch.ts";
import { prExtensionParity } from "./pr.ts";
import { sdlExtensionParity } from "./sdl-extension.ts";
import { smartRestackParity } from "./smart-restack.ts";
import { thermoCouncilParity } from "./thermo-council.ts";
import { worktreeStatusParity } from "./worktree-status.ts";
import type { PiSurfaceParity } from "./parity.ts";

export const STATIC_PI_EXTENSION_PARITY_RECORDS = [
	...branchContextExtensionParity,
	...claudeHandoffParity,
	...codeWorkflowsParity,
	...contextProfilerParity,
	...grillUiParity,
	...handoffParity,
	...investigateParity,
	...modelShortcutParity,
	...objectiveParity,
	...prFeedbackWatchParity,
	...prExtensionParity,
	...sdlExtensionParity,
	...smartRestackParity,
	...thermoCouncilParity,
	...worktreeStatusParity,
] as const;

export function loadPiExtensionParityRecords(): readonly PiSurfaceParity[] {
	return STATIC_PI_EXTENSION_PARITY_RECORDS;
}
