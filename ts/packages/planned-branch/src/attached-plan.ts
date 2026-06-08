import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { TextEncoder } from "node:util";

import { RealPlannedBranchBrmemGateway, type AttachedPlanEntry, type PlannedBranchBrmemGateway } from "./brmem-gateway.ts";
import { PLAN_BRANCH_NAMESPACE } from "./constants.ts";
import { RealPlannedBranchGitGateway, type PlannedBranchGitGateway } from "./git-gateway.ts";
import type { PlanCommandExecApi } from "./plan-persistence.ts";
import { resolveSelectedSavedPlanFile, resolveSelectedSavedTsPlanFile } from "./saved-plan-selection.ts";
import { planFileFormatForKind, type PlanFileKind } from "./source-plan-file.ts";

const PLANNED_BRANCH_IMPL_PROMPT_TEMPLATE = readFileSync(new URL("./prompts/planned-branch-impl.md", import.meta.url), "utf8").trimEnd();

export type { AttachedPlanEntry } from "./brmem-gateway.ts";
export { parseBrmemGetContent, parseBrmemListEntries } from "./brmem-gateway.ts";

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
	signal?: AbortSignal | undefined;
	git?: PlannedBranchGitGateway | undefined;
	brmem?: PlannedBranchBrmemGateway | undefined;
	planStoreRoot?: string | undefined;
	sessionEntries?: readonly unknown[] | undefined;
}

export class NoAttachedPlannedBranchEntriesError extends Error {
	readonly branch: string;

	constructor(branch: string) {
		super(
			[
				`No planned-branch entries on branch \`${branch}\`.`,
				"",
				"Create a saved plan with `planned-branch exec write-plan-file`, attach it with",
				"`planned-branch exec create`, or provide a branch/key that already has a canonical plan.",
			].join("\n"),
		);
		this.name = "NoAttachedPlannedBranchEntriesError";
		this.branch = branch;
	}
}

export class NoAttachedPlannedBranchPlanKindEntriesError extends Error {
	readonly branch: string;
	readonly kind: PlanFileKind;

	constructor(branch: string, kind: PlanFileKind, availableKeys: readonly string[]) {
		const format = planFileFormatForKind(kind);
		super(
			[
				`No attached planned-branch ${format.displayName} entries exist on branch \`${branch}\` in namespace \`${PLAN_BRANCH_NAMESPACE}\`.`,
				`Expected suffix: ${format.suffix}`,
				"",
				"Available keys:",
				formatAvailableKeys([...availableKeys]),
			].join("\n"),
		);
		this.name = "NoAttachedPlannedBranchPlanKindEntriesError";
		this.branch = branch;
		this.kind = kind;
	}
}

export async function loadPlannedBranchPlan(
	pi: PlanCommandExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	return loadPlannedBranchPlanForKind(pi, params, options, "markdown");
}

export async function loadPlannedBranchTsPlan(
	pi: PlanCommandExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	return loadPlannedBranchPlanForKind(pi, params, options, "typescript-recipe");
}

async function loadPlannedBranchPlanForKind(
	pi: PlanCommandExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
	kind: PlanFileKind,
): Promise<LoadedAttachedPlan> {
	try {
		return await loadAttachedPlanForKind(pi, params, options, kind);
	} catch (error) {
		if (!isSavedPlanFallbackEligibleError(error) || params.requestedKey !== undefined) {
			throw error;
		}

		try {
			return await loadSavedPlanFallback(pi, error.branch, options, kind);
		} catch (fallbackError) {
			throw new Error(
				[
					"Failed to load an attached planned-branch plan and no saved-plan fallback could be loaded.",
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

function isSavedPlanFallbackEligibleError(error: unknown): error is NoAttachedPlannedBranchEntriesError | NoAttachedPlannedBranchPlanKindEntriesError {
	return error instanceof NoAttachedPlannedBranchEntriesError || error instanceof NoAttachedPlannedBranchPlanKindEntriesError;
}

export async function loadAttachedPlan(
	pi: PlanCommandExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	return loadAttachedPlanForKind(pi, params, options, "markdown");
}

export async function loadAttachedTsPlan(
	pi: PlanCommandExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	return loadAttachedPlanForKind(pi, params, options, "typescript-recipe");
}

async function loadAttachedPlanForKind(
	pi: PlanCommandExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
	kind: PlanFileKind,
): Promise<LoadedAttachedPlan> {
	const git = options.git ?? new RealPlannedBranchGitGateway(pi);
	const brmem = options.brmem ?? new RealPlannedBranchBrmemGateway(pi);
	const branch = await resolveSafeImplementationBranch(git, options.cwd, options.signal);
	const list = await brmem.listAttachedPlans({ cwd: options.cwd, branch, signal: options.signal });
	if (!list.ok) {
		throw new Error(list.error.message);
	}

	const entries = list.value;
	if (entries.length === 0) {
		throw new NoAttachedPlannedBranchEntriesError(branch);
	}

	const selectionInput = params.requestedKey === undefined ? { branch, entries } : { branch, requestedKey: params.requestedKey, entries };
	const selectedKey = selectAttachedPlanKeyForKind(selectionInput, kind);
	const get = await brmem.getAttachedPlan({ cwd: options.cwd, branch, key: selectedKey, signal: options.signal });
	if (!get.ok) {
		throw new Error(get.error.message);
	}

	const data = get.value;
	const availableKeys = sortedUniqueKeys(entries);
	return {
		branch,
		namespace: PLAN_BRANCH_NAMESPACE,
		selectedKey,
		refName: data.refName,
		content: data.content,
		byteCount: new TextEncoder().encode(data.content).length,
		availableKeys,
		source: "attached",
	};
}

async function loadSavedPlanFallback(
	pi: PlanCommandExecApi,
	branch: string,
	options: LoadAttachedPlanOptions,
	kind: PlanFileKind,
): Promise<LoadedAttachedPlan> {
	const selected = await (kind === "markdown" ? resolveSelectedSavedPlanFile : resolveSelectedSavedTsPlanFile)(pi, {
		cwd: options.cwd,
		git: options.git,
		planStoreRoot: options.planStoreRoot,
		sessionEntries: options.sessionEntries,
		shouldFallbackToLatest: true,
	});
	const fileInfo = selectedSavedPlanFileInfo(selected);
	const content = await readFile(fileInfo.filePath, "utf8");
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

function selectedSavedPlanFileInfo(selected: Awaited<ReturnType<typeof resolveSelectedSavedPlanFile>>): { filePath: string; fileName: string } {
	if (selected.type === "explicit") {
		return { filePath: selected.filePath, fileName: selected.fileName };
	}
	return { filePath: selected.plan.filePath, fileName: selected.plan.fileName };
}

export function normalizeRequestedAttachedPlanKey(requestedKey: string): string {
	return normalizeRequestedAttachedPlanKeyForSuffix(requestedKey, ".md");
}

export function normalizeRequestedAttachedTsPlanKey(requestedKey: string): string {
	return normalizeRequestedAttachedPlanKeyForSuffix(requestedKey, ".plan.ts");
}

function normalizeRequestedAttachedPlanKeyForSuffix(requestedKey: string, suffix: ".md" | ".plan.ts"): string {
	const trimmed = requestedKey.trim();
	if (trimmed.length === 0) {
		throw new Error("Requested attached plan key is empty.");
	}
	if (trimmed.startsWith("/")) {
		throw new Error("Requested attached plan key must not start with `/`.");
	}
	if (trimmed.includes("..")) {
		throw new Error("Requested attached plan key must not contain `..`.");
	}
	if (trimmed.endsWith(".md") || trimmed.endsWith(".plan.ts")) {
		return trimmed;
	}
	return `${trimmed}${suffix}`;
}

export function selectAttachedPlanKey(input: { branch: string; requestedKey?: string; entries: AttachedPlanEntry[] }): string {
	return selectAttachedPlanKeyForKind(input, "markdown");
}

export function selectAttachedTsPlanKey(input: { branch: string; requestedKey?: string; entries: AttachedPlanEntry[] }): string {
	return selectAttachedPlanKeyForKind(input, "typescript-recipe");
}

function selectAttachedPlanKeyForKind(input: { branch: string; requestedKey?: string; entries: AttachedPlanEntry[] }, kind: PlanFileKind): string {
	const format = planFileFormatForKind(kind);
	const suffix = format.suffix;
	const matchingEntries = input.entries.filter((entry) => entry.key.endsWith(suffix));
	const availableKeys = sortedUniqueKeys(matchingEntries);
	const available = new Set(availableKeys);

	if (input.requestedKey !== undefined) {
		const key = normalizeRequestedAttachedPlanKeyForSuffix(input.requestedKey, suffix);
		if (!available.has(key)) {
			throw new Error(
				[
					`Requested attached plan key \`${key}\` was not found on branch \`${input.branch}\` in namespace \`${PLAN_BRANCH_NAMESPACE}\`.`,
					"",
					"Available keys:",
					formatAvailableKeys(availableKeys),
				].join("\n"),
			);
		}
		return key;
	}

	const segment = finalBranchSegment(input.branch);
	const branchSegmentKey = `${segment}${suffix}`;
	if (available.has(branchSegmentKey)) {
		return branchSegmentKey;
	}

	if (matchingEntries.length === 0) {
		throw new NoAttachedPlannedBranchPlanKindEntriesError(input.branch, kind, sortedUniqueKeys(input.entries));
	}

	if (matchingEntries.length === 1) {
		const [entry] = matchingEntries;
		if (entry !== undefined) {
			return entry.key;
		}
	}

	throw new Error(
		[
			`Multiple attached plans exist on branch \`${input.branch}\`, and no branch-segment match was found.`,
			"",
			"Available keys:",
			formatAvailableKeys(availableKeys),
			"",
			"Run `planned-branch exec load-plan <key>` to choose one.",
		].join("\n"),
	);
}

export function buildImplPlannedBranchPrompt(plan: LoadedAttachedPlan): string {
	const isSavedPlan = plan.source === "saved";
	return renderTemplate(PLANNED_BRANCH_IMPL_PROMPT_TEMPLATE, {
		loaded_plan_description: isSavedPlan ? "saved planned-branch plan from the local plan store" : "attached planned-branch plan",
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
	return plan.source === "saved" ? "Loaded saved planned-branch plan from local plan store." : "Loaded attached planned-branch plan.";
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

async function resolveSafeImplementationBranch(git: PlannedBranchGitGateway, cwd: string, signal: AbortSignal | undefined): Promise<string> {
	const repoRoot = await git.repoRoot({ cwd, signal });
	if (!repoRoot.ok) {
		throw new Error(["Cannot load attached plan: not in a Git repository.", "", repoRoot.error.message].join("\n"));
	}

	const branchResult = await git.implementationBranch({ cwd, signal });
	if (!branchResult.ok) {
		throw new Error(["Cannot load attached plan from detached HEAD. Check out a feature branch first.", "", branchResult.error.message].join("\n"));
	}
	const branch = branchResult.value;

	const defaultBranch = await git.defaultBranch({ cwd, signal });
	const defaultBranchValue = defaultBranch.type === "found" ? defaultBranch.value : undefined;
	if (branch === "main" || branch === "master" || branch === defaultBranchValue) {
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

function finalBranchSegment(branch: string): string {
	const segments = branch.split("/").filter((segment) => segment.length > 0);
	return segments.at(-1) ?? branch;
}

