import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { TextEncoder } from "node:util";

import { formatErrorMessage, optionalEntries } from "@sdl/core/primitives";

import {
	getBranchContextPlan,
	listBranchContextPlans,
	type AttachedPlanEntry,
	unwrapBranchContextBrmemResult,
} from "./branch-memory.ts";
import {
	BRANCH_CONTEXT_NAMESPACE,
	UNSUPPORTED_ATTACHED_PLAN_KEY,
	isSupportedBranchContextPlanKey,
} from "./constants.ts";
import type { CommandExecApi } from "@sdl/core/exec";
import type { GitGateway } from "@sdl/git";
import { resolveSelectedSavedPlanFile } from "@sdl/plans";
import type { BranchContextContext } from "./context.ts";

const BRANCH_CONTEXT_IMPL_PROMPT_TEMPLATE = readFileSync(
	new URL("./prompts/branch-context-impl.md", import.meta.url),
	"utf8",
).trimEnd();

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
	signal?: AbortSignal;
	planStoreRoot?: string;
	sessionEntries?: readonly unknown[];
	readTextFile?: (path: string) => Promise<string>;
}

export class NoAttachedBranchContextEntriesError extends Error {
	readonly branch: string;

	constructor(branch: string) {
		super(
			[
				`No branch-context entries on branch \`${branch}\`.`,
				"",
				"Create a saved plan with `enriched-plan exec save`, attach it with `sdl branch-context exec from-plan`,",
				"or provide a branch/key that already has a canonical plan.",
			].join("\n"),
		);
		this.name = "NoAttachedBranchContextEntriesError";
		this.branch = branch;
	}
}

export class AmbiguousBranchContextPlanEntryError extends Error {
	readonly branch: string;
	readonly availableKeys: readonly string[];

	constructor(branch: string, availableKeys: readonly string[]) {
		super(
			[
				`Multiple supported branch-context plan entries exist on branch \`${branch}\` in namespace \`${BRANCH_CONTEXT_NAMESPACE}\`.`,
				"Pass an explicit named Markdown branch-context key to choose which plan to load.",
				"",
				"Supported keys:",
				formatAvailableKeys([...availableKeys]),
			].join("\n"),
		);
		this.name = "AmbiguousBranchContextPlanEntryError";
		this.branch = branch;
		this.availableKeys = [...availableKeys];
	}
}

export class UnsupportedBranchContextPlanKeyError extends Error {
	readonly branch: string;
	readonly key: string;

	constructor(branch: string, key: string) {
		super(formatUnsupportedBranchContextPlanKeyMessage(branch, key));
		this.name = "UnsupportedBranchContextPlanKeyError";
		this.branch = branch;
		this.key = key;
	}
}

export class NoSupportedBranchContextPlanEntriesError extends Error {
	readonly branch: string;
	readonly availableKeys: readonly string[];

	constructor(branch: string, availableKeys: readonly string[]) {
		super(
			[
				`No supported branch-context plan entries exist on branch \`${branch}\` in namespace \`${BRANCH_CONTEXT_NAMESPACE}\`.`,
				`Legacy key \`${UNSUPPORTED_ATTACHED_PLAN_KEY}\` is no longer supported; reattach the plan under a named Markdown key such as <slug>.md.`,
				"",
				"Available keys:",
				formatAvailableKeys([...availableKeys]),
			].join("\n"),
		);
		this.name = "NoSupportedBranchContextPlanEntriesError";
		this.branch = branch;
		this.availableKeys = [...availableKeys];
	}
}

export class RequestedBranchContextPlanKeyNotFoundError extends Error {
	readonly branch: string;
	readonly key: string;
	readonly availableKeys: readonly string[];
	readonly supportedKeys: readonly string[];

	constructor(params: {
		branch: string;
		key: string;
		availableKeys: readonly string[];
		supportedKeys: readonly string[];
	}) {
		super(
			[
				`Requested branch-context key \`${params.key}\` was not found on branch \`${params.branch}\` in namespace \`${BRANCH_CONTEXT_NAMESPACE}\`.`,
				"",
				"Supported keys:",
				formatAvailableKeys(params.supportedKeys),
				"",
				"Available keys:",
				formatAvailableKeys(params.availableKeys),
			].join("\n"),
		);
		this.name = "RequestedBranchContextPlanKeyNotFoundError";
		this.branch = params.branch;
		this.key = params.key;
		this.availableKeys = [...params.availableKeys];
		this.supportedKeys = [...params.supportedKeys];
	}
}

export class SavedPlanFallbackLoadError extends Error {
	readonly branch: string;
	readonly attachedMessage: string;
	readonly fallbackMessage: string;

	constructor(params: { branch: string; attachedError: Error; fallbackError: unknown }) {
		const fallbackMessage = formatErrorMessage(params.fallbackError);
		super(
			[
				"Failed to load an attached branch-context plan and no saved-plan fallback could be loaded.",
				"",
				"Attached-plan failure:",
				params.attachedError.message,
				"",
				"Saved-plan fallback failure:",
				fallbackMessage,
			].join("\n"),
		);
		this.name = "SavedPlanFallbackLoadError";
		this.branch = params.branch;
		this.attachedMessage = params.attachedError.message;
		this.fallbackMessage = fallbackMessage;
	}
}

export async function loadBranchContextPlan(
	pi: CommandExecApi,
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	try {
		return await loadAttachedPlan(params, options);
	} catch (error) {
		if (!isSavedPlanFallbackEligibleError(error) || params.requestedKey !== undefined) {
			throw error;
		}

		try {
			return await loadSavedPlanFallback(pi, error.branch, options);
		} catch (fallbackError) {
			throw new SavedPlanFallbackLoadError({
				branch: error.branch,
				attachedError: error,
				fallbackError,
			});
		}
	}
}

function isSavedPlanFallbackEligibleError(
	error: unknown,
): error is NoAttachedBranchContextEntriesError {
	return error instanceof NoAttachedBranchContextEntriesError;
}

export async function loadAttachedPlan(
	params: LoadAttachedPlanParams,
	options: LoadAttachedPlanOptions,
): Promise<LoadedAttachedPlan> {
	const branch = await resolveSafeImplementationBranch(
		options.context.git,
		options.cwd,
		options.signal,
	);
	const entries = unwrapBranchContextBrmemResult(
		await listBranchContextPlans(options.context.brmem, { branch }),
	);
	if (entries.length === 0) {
		throw new NoAttachedBranchContextEntriesError(branch);
	}

	const selectionInput =
		params.requestedKey === undefined
			? { branch, entries }
			: { branch, requestedKey: params.requestedKey, entries };
	const selectedKey = selectAttachedPlanKey(selectionInput);
	const data = unwrapBranchContextBrmemResult(
		await getBranchContextPlan(options.context.brmem, {
			branch,
			key: selectedKey,
		}),
	);
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
		...optionalEntries({
			planStoreRoot: options.planStoreRoot,
			sessionEntries: options.sessionEntries,
		}),
		shouldAllowSessionSourceBranchMismatch: true,
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

function selectedSavedPlanFileInfo(
	selected: Awaited<ReturnType<typeof resolveSelectedSavedPlanFile>>,
): { filePath: string; fileName: string } {
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

export function selectAttachedPlanKey(input: {
	branch: string;
	requestedKey?: string;
	entries: AttachedPlanEntry[];
}): string {
	const availableKeys = sortedUniqueKeys(input.entries);
	const supportedKeys = availableKeys.filter(isSupportedBranchContextPlanKey);
	const supported = new Set(supportedKeys);
	if (input.requestedKey === undefined) {
		if (supportedKeys.length === 1) {
			return supportedKeys[0]!;
		}
		if (supportedKeys.length === 0) {
			if (availableKeys.length === 0) {
				throw new NoAttachedBranchContextEntriesError(input.branch);
			}
			throw new NoSupportedBranchContextPlanEntriesError(input.branch, availableKeys);
		}
		throw new AmbiguousBranchContextPlanEntryError(input.branch, supportedKeys);
	}

	const key = normalizeRequestedBranchContextKey(input.requestedKey);
	if (!isSupportedBranchContextPlanKey(key)) {
		throw new UnsupportedBranchContextPlanKeyError(input.branch, key);
	}
	if (supported.has(key)) {
		return key;
	}
	throw new RequestedBranchContextPlanKeyNotFoundError({
		branch: input.branch,
		key,
		availableKeys,
		supportedKeys,
	});
}

export function buildImplBranchContextPrompt(plan: LoadedAttachedPlan): string {
	const isSavedPlan = plan.source === "saved";
	return renderTemplate(BRANCH_CONTEXT_IMPL_PROMPT_TEMPLATE, {
		loaded_plan_description: isSavedPlan
			? "saved branch-context plan from the local plan store"
			: "attached branch-context plan",
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
	return plan.source === "saved"
		? "Loaded saved branch-context plan from local plan store."
		: "Loaded attached branch-context plan.";
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

async function resolveSafeImplementationBranch(
	git: GitGateway,
	cwd: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	const repoRoot = await git.repoRoot({ cwd, signal });
	if (!repoRoot.ok) {
		throw new Error(
			["Cannot load attached plan: not in a Git repository.", "", repoRoot.error.message].join(
				"\n",
			),
		);
	}

	const branchResult = await git.currentBranch({ cwd, signal });
	if (branchResult.type === "detached") {
		throw new Error(
			"Cannot load attached plan from detached HEAD. Check out a feature branch first.",
		);
	}
	if (branchResult.type === "failure") {
		throw new Error(
			[
				"Cannot load attached plan because the current branch could not be resolved.",
				"",
				branchResult.error.message,
			].join("\n"),
		);
	}
	const branch = branchResult.branch;

	const trunkBranch = await git.trunkBranch({ cwd, signal });
	const trunkBranchValue = trunkBranch.type === "found" ? trunkBranch.value : undefined;
	if (branch === "main" || branch === "master" || branch === trunkBranchValue) {
		throw new Error(
			`Refusing to implement directly on trunk (\`${branch}\`). Check out a feature branch first.`,
		);
	}

	return branch;
}

function sortedUniqueKeys(entries: AttachedPlanEntry[]): string[] {
	return [...new Set(entries.map((entry) => entry.key))].sort();
}

function formatUnsupportedBranchContextPlanKeyMessage(branch: string, key: string): string {
	if (key === UNSUPPORTED_ATTACHED_PLAN_KEY) {
		return [
			`Legacy branch-context key ${key} is no longer supported on branch \`${branch}\`.`,
			"Attach the plan under a named Markdown key such as <slug>.md, then load that key.",
		].join("\n");
	}
	return [
		`Unsupported branch-context key ${key} on branch \`${branch}\`.`,
		"Branch-context plans must use a named Markdown key such as <slug>.md.",
	].join("\n");
}

export function formatAvailableKeys(keys: readonly string[]): string {
	return keys.length > 0 ? keys.map((key) => `- ${key}`).join("\n") : "(none)";
}
