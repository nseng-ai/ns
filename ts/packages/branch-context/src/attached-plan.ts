import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { TextEncoder } from "node:util";

import type { AttachedPlanEntry } from "./brmem-gateway.ts";
import { BRANCH_CONTEXT_NAMESPACE, BRANCH_CONTEXT_PLAN_KEY } from "./constants.ts";
import type { CommandExecApi } from "@asdl/core/exec";
import type { GitGateway } from "@asdl/core/git";
import { resolveSelectedSavedPlanFile } from "@asdl/plans";
import type { BranchContextContext } from "./context.ts";

const BRANCH_CONTEXT_IMPL_PROMPT_TEMPLATE = readFileSync(new URL("./prompts/branch-context-impl.md", import.meta.url), "utf8").trimEnd();

export type LoadedPlanSource = "attached" | "saved";

export interface LoadedAttachedPlan {
	branch: string;
	namespace: string;
	selectedKey: string;
	refName: string;
	content: string;
	byteCount: number;
	availableKeys: string[];
	source: LoadedPlanSource;
	sourceFile?: string;
}

export interface LoadAttachedPlanParams {
	requestedKey?: string;
}

export interface LoadAttachedPlanOptions {
	cwd: string;
	context: BranchContextContext;
	signal?: AbortSignal | undefined;
	planStoreRoot?: string | undefined;
	sessionEntries?: readonly unknown[] | undefined;
	readTextFile?: ((path: string) => Promise<string>) | undefined;
}

export class NoAttachedBranchContextEntriesError extends Error {
	readonly branch: string;

	constructor(branch: string) {
		super(
			[
				`No branch-context entries on branch \`${branch}\`.`,
				"",
				"Create a saved plan with `enriched-plan exec save`, attach it with `branch-context exec from-plan`,",
				"or provide a branch/key that already has a canonical plan.",
			].join("\n"),
		);
		this.name = "NoAttachedBranchContextEntriesError";
		this.branch = branch;
	}
}

export class NoBranchContextPlanEntryError extends Error {
	readonly branch: string;

	constructor(branch: string, availableKeys: readonly string[]) {
		super(
			[
				`No branch-context plan entry exists on branch \`${branch}\` in namespace \`${BRANCH_CONTEXT_NAMESPACE}\`.`,
				`Expected key: ${BRANCH_CONTEXT_PLAN_KEY}`,
				"",
				"Available keys:",
				formatAvailableKeys([...availableKeys]),
			].join("\n"),
		);
		this.name = "NoBranchContextPlanEntryError";
		this.branch = branch;
	}
}

export async function loadBranchContextPlan(
	pi: CommandExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	try {
		return await loadAttachedPlan(pi, params, options);
	} catch (error) {
		if (!isSavedPlanFallbackEligibleError(error) || params.requestedKey !== undefined) {
			throw error;
		}

		try {
			return await loadSavedPlanFallback(pi, error.branch, options);
		} catch (fallbackError) {
			throw new Error(
				[
					"Failed to load an attached branch-context plan and no saved-plan fallback could be loaded.",
					"",
					"Attached-plan failure:",
					error.message,
					"",
					"Saved-plan fallback failure:",
					fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
				].join("\n"),
			);
		}
	}
}

function isSavedPlanFallbackEligibleError(error: unknown): error is NoAttachedBranchContextEntriesError | NoBranchContextPlanEntryError {
	return error instanceof NoAttachedBranchContextEntriesError || error instanceof NoBranchContextPlanEntryError;
}

export async function loadAttachedPlan(
	_pi: CommandExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	const branch = await resolveSafeImplementationBranch(options.context.git, options.cwd, options.signal);
	const list = await options.context.brmem.listAttachedPlans({ cwd: options.cwd, branch, signal: options.signal });
	if (!list.ok) {
		throw new Error(list.error.message);
	}

	const entries = list.value;
	if (entries.length === 0) {
		throw new NoAttachedBranchContextEntriesError(branch);
	}

	const selectionInput = params.requestedKey === undefined ? { branch, entries } : { branch, requestedKey: params.requestedKey, entries };
	const selectedKey = selectAttachedPlanKey(selectionInput);
	const get = await options.context.brmem.getAttachedPlan({ cwd: options.cwd, branch, key: selectedKey, signal: options.signal });
	if (!get.ok) {
		throw new Error(get.error.message);
	}

	const data = get.value;
	const availableKeys = sortedUniqueKeys(entries);
	return {
		branch,
		namespace: BRANCH_CONTEXT_NAMESPACE,
		selectedKey,
		refName: data.refName,
		content: data.content,
		byteCount: new TextEncoder().encode(data.content).length,
		availableKeys,
		source: "attached",
	};
}

async function loadSavedPlanFallback(
	pi: CommandExecApi,
	branch: string,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	const selected = await resolveSelectedSavedPlanFile(pi, {
		cwd: options.cwd,
		git: options.context.git,
		planStoreRoot: options.planStoreRoot,
		sessionEntries: options.sessionEntries,
		shouldFallbackToLatest: true,
	});
	const fileInfo = selectedSavedPlanFileInfo(selected);
	const readTextFile = options.readTextFile ?? defaultReadTextFile;
	const content = await readTextFile(fileInfo.filePath);
	return {
		branch,
		namespace: "local-plan-store",
		selectedKey: fileInfo.fileName,
		refName: fileInfo.filePath,
		content,
		byteCount: new TextEncoder().encode(content).length,
		availableKeys: [fileInfo.fileName],
		source: "saved",
		sourceFile: fileInfo.filePath,
	};
}

function defaultReadTextFile(path: string): Promise<string> {
	return readFile(path, "utf8");
}

function selectedSavedPlanFileInfo(selected: Awaited<ReturnType<typeof resolveSelectedSavedPlanFile>>): { filePath: string; fileName: string } {
	if (selected.type === "explicit") {
		return { filePath: selected.filePath, fileName: selected.fileName };
	}
	return { filePath: selected.plan.filePath, fileName: selected.plan.fileName };
}

export function normalizeRequestedBranchContextKey(requestedKey: string): string {
	const trimmed = requestedKey.trim();
	if (trimmed.length === 0) {
		throw new Error("Requested branch-context key is empty.");
	}
	if (trimmed.startsWith("/")) {
		throw new Error("Requested branch-context key must not start with `/`.");
	}
	if (trimmed.includes("..")) {
		throw new Error("Requested branch-context key must not contain `..`.");
	}
	return trimmed;
}

export function selectAttachedPlanKey(input: { branch: string; requestedKey?: string; entries: AttachedPlanEntry[] }): string {
	const availableKeys = sortedUniqueKeys(input.entries);
	const available = new Set(availableKeys);
	const key = input.requestedKey === undefined ? BRANCH_CONTEXT_PLAN_KEY : normalizeRequestedBranchContextKey(input.requestedKey);
	if (available.has(key)) {
		return key;
	}
	if (input.requestedKey === undefined) {
		throw new NoBranchContextPlanEntryError(input.branch, availableKeys);
	}
	throw new Error(
		[
			`Requested branch-context key \`${key}\` was not found on branch \`${input.branch}\` in namespace \`${BRANCH_CONTEXT_NAMESPACE}\`.`,
			"",
			"Available keys:",
			formatAvailableKeys(availableKeys),
		].join("\n"),
	);
}

export function buildImplBranchContextPrompt(plan: LoadedAttachedPlan): string {
	const isSavedPlan = plan.source === "saved";
	return renderTemplate(BRANCH_CONTEXT_IMPL_PROMPT_TEMPLATE, {
		loaded_plan_description: isSavedPlan ? "saved branch-context plan from the local plan store" : "attached branch-context plan",
		plan_label: isSavedPlan ? "SAVED PLAN" : "ATTACHED PLAN",
		branch: plan.branch,
		namespace: plan.namespace,
		selected_key: plan.selectedKey,
		ref: plan.refName,
		byte_count: String(plan.byteCount),
		attached_plan: plan.content,
	});
}

function renderTemplate(template: string, values: Record<string, string>): string {
	let rendered = template;
	for (const [key, value] of Object.entries(values)) {
		rendered = rendered.split(`{{${key}}}`).join(value);
	}
	return rendered;
}

export function loadedPlanTitle(plan: Pick<LoadedAttachedPlan, "source">): string {
	return plan.source === "saved" ? "Loaded saved branch-context plan from local plan store." : "Loaded attached branch-context plan.";
}

export function formatLoadedAttachedPlanEvidence(plan: LoadedAttachedPlan): string {
	return [
		loadedPlanTitle(plan),
		`Branch: ${plan.branch}`,
		`Namespace: ${plan.namespace}`,
		`Selected key: ${plan.selectedKey}`,
		`Ref: ${plan.refName}`,
		`Bytes: ${plan.byteCount}`,
	].join("\n");
}

async function resolveSafeImplementationBranch(git: GitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const repoRoot = await git.repoRoot({ cwd, signal });
	if (!repoRoot.ok) {
		throw new Error(["Cannot load attached plan: not in a Git repository.", "", repoRoot.error.message].join("\n"));
	}

	const branchResult = await git.currentBranch({ cwd, signal });
	if (!branchResult.ok) {
		throw new Error(["Cannot load attached plan from detached HEAD. Check out a feature branch first.", "", branchResult.error.message].join("\n"));
	}
	const branch = branchResult.value;

	const trunkBranch = await git.trunkBranch({ cwd, signal });
	const trunkBranchValue = trunkBranch.type === "found" ? trunkBranch.value : undefined;
	if (branch === "main" || branch === "master" || branch === trunkBranchValue) {
		throw new Error(`Refusing to implement directly on trunk (\`${branch}\`). Check out a feature branch first.`);
	}

	return branch;
}

function sortedUniqueKeys(entries: AttachedPlanEntry[]): string[] {
	return [...new Set(entries.map((entry) => entry.key))].sort();
}

function formatAvailableKeys(keys: string[]): string {
	return keys.length > 0 ? keys.map((key) => `- ${key}`).join("\n") : "(none)";
}

