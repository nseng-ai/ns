import {
	loadRoastSkillEntries as loadCanonicalRoastSkillEntries,
	type RoastSkillEntry,
} from "@sdl/roaster";

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
import { roastParityForEntries, type LoadRoastSkillEntries } from "./roast.ts";
import { sdlExtensionParity } from "./sdl-extension.ts";
import { smartRestackParity } from "./smart-restack.ts";
import { trunkPullParity } from "./trunk-pull.ts";
import { worktreeStatusParity } from "./worktree-status.ts";
import type { PiSurfaceParity } from "./parity.ts";

export interface LoadPiExtensionParityRecordsOptions {
	readonly cwd?: string | undefined;
	readonly roastEntries?: readonly RoastSkillEntry[] | undefined;
	readonly loadRoastEntries?: LoadRoastSkillEntries | undefined;
}

export const STATIC_PI_EXTENSION_PARITY_RECORDS = [
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

export async function loadPiExtensionParityRecords(
	options: LoadPiExtensionParityRecordsOptions = {},
): Promise<readonly PiSurfaceParity[]> {
	const roastEntries = options.roastEntries ?? (await loadRoastEntriesForParity(options));
	return [...STATIC_PI_EXTENSION_PARITY_RECORDS, ...roastParityForEntries(roastEntries)];
}

async function loadRoastEntriesForParity(
	options: LoadPiExtensionParityRecordsOptions,
): Promise<readonly RoastSkillEntry[]> {
	const loadRoastEntries = options.loadRoastEntries ?? loadCanonicalRoastSkillEntries;
	const loaded = await loadRoastEntries({ cwd: options.cwd ?? process.cwd() });
	if (loaded.type === "error") {
		throw new Error(`Could not load Roaster roast parity metadata: ${loaded.error.message}`);
	}
	return loaded.value;
}
