import { asdlDevCodeExtensionParity, asdlDevExtensionParity } from "./asdl-dev-extension.ts";
import { autobranchParity } from "./autobranch.ts";
import { autoslotParity } from "./autoslot.ts";
import { branchContextExtensionParity } from "./branch-context-extension.ts";
import { changesParity } from "./changes.ts";
import { claudeHandoffParity } from "./claude/handoff-command.ts";
import { codeWorkflowsParity } from "./code-workflows.ts";
import { contextProfilerParity } from "./context-profiler.ts";
import { grillUiParity } from "./grill-ui.ts";
import { handoffParity } from "./handoff.ts";
import { landParity } from "./land.ts";
import { modelShortcutParity } from "./model-shortcuts.ts";
import { objectiveParity } from "./objective.ts";
import { prFeedbackWatchParity } from "./pr-feedback-watch.ts";
import { pushParity } from "./push.ts";
import { worktreeStatusParity } from "./worktree-status.ts";

export const PI_EXTENSION_PARITY_RECORDS = [
	...asdlDevExtensionParity,
	...asdlDevCodeExtensionParity,
	...autobranchParity,
	...autoslotParity,
	...branchContextExtensionParity,
	...changesParity,
	...claudeHandoffParity,
	...codeWorkflowsParity,
	...contextProfilerParity,
	...grillUiParity,
	...handoffParity,
	...landParity,
	...modelShortcutParity,
	...objectiveParity,
	...prFeedbackWatchParity,
	...pushParity,
	...worktreeStatusParity,
] as const;
