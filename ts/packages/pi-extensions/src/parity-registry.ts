import { autobranchParity } from "./autobranch.ts";
import { autoslotParity } from "./autoslot.ts";
import { branchContextExtensionParity } from "./branch-context-extension.ts";
import { claudeHandoffParity } from "./claude/handoff-command.ts";
import { codeWorkflowsParity } from "./code-workflows.ts";
import { contextProfilerParity } from "./context-profiler.ts";
import { grillUiParity } from "./grill-ui.ts";
import { handoffParity } from "./handoff.ts";
import { landParity } from "./land.ts";
import { modelShortcutParity } from "./model-shortcuts.ts";
import { objectiveParity } from "./objective.ts";
import { prFeedbackWatchParity } from "./pr-feedback-watch.ts";
import { prExtensionParity } from "./pr.ts";
import { pushParity } from "./push.ts";
import { sdlExtensionParity } from "./sdl-extension.ts";
import { smartRestackParity } from "./smart-restack.ts";
import { trunkPullParity } from "./trunk-pull.ts";
import { worktreeStatusParity } from "./worktree-status.ts";

export const PI_EXTENSION_PARITY_RECORDS = [
	...autobranchParity,
	...autoslotParity,
	...branchContextExtensionParity,
	...claudeHandoffParity,
	...codeWorkflowsParity,
	...contextProfilerParity,
	...grillUiParity,
	...handoffParity,
	...landParity,
	...modelShortcutParity,
	...objectiveParity,
	...prFeedbackWatchParity,
	...prExtensionParity,
	...pushParity,
	...sdlExtensionParity,
	...smartRestackParity,
	...trunkPullParity,
	...worktreeStatusParity,
] as const;
