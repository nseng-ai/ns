import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { failure, ok, usageError, type ClinkrExit } from "@sdl/clinkr";
import { runOperationCommand } from "@sdl/cli-runtime";
import { formatErrorMessage } from "@sdl/core/primitives";
import { normalizePlanFilePath, validatePlanSlug } from "@sdl/plans";
import { z } from "zod";

import {
	AttachBranchContextError,
	AttachBranchContextUsageError,
	BranchContextNamespaceInvalidError,
	attachBranchContextEntry,
	checkBranchContextEntry,
	deleteBranchContextEntry,
	formatAttachEvidence,
	formatCheckEvidence,
	formatDeleteEvidence,
	formatListEvidence,
	listBranchContextEntries,
	type BranchContextAttachEvidence,
	type BranchContextCheckEvidence,
	type BranchContextDeleteEvidence,
	type BranchContextListEvidence,
} from "./attach.ts";
import {
	AmbiguousBranchContextPlanEntryError,
	NoAttachedBranchContextEntriesError,
	NoSupportedBranchContextPlanEntriesError,
	RequestedBranchContextPlanKeyNotFoundError,
	SavedPlanFallbackLoadError,
	UnsupportedBranchContextPlanKeyError,
	buildImplBranchContextPrompt,
	formatLoadedAttachedPlanEvidence,
	loadBranchContextPlan,
	type LoadedAttachedPlan,
} from "./attached-plan.ts";
import {
	BRANCH_CREATION_METHODS,
	createBranchContextFromFile,
	DEFAULT_BRANCH_CREATION_METHOD,
	formatBranchContextEvidence,
	type BranchContextEvidence,
} from "./branch-context-creation.ts";
import { createRealBranchContextContext, type BranchContextContext } from "./context.ts";

type BranchContextOperation = "create" | "load" | "attach" | "list" | "check" | "delete";

export const createRequestSchema = z.object({
	slug: z.string().describe("Branch context slug."),
	planFile: z.string().describe("Plan file path (must live outside the repository)."),
	branch: z.string().optional().describe("Branch name (defaults to the slug)."),
	branchCreation: z
		.enum(BRANCH_CREATION_METHODS)
		.default(DEFAULT_BRANCH_CREATION_METHOD)
		.describe("Branch creation method."),
	summary: z.string().optional().describe("Optional plan summary."),
});

export const loadRequestSchema = z.object({
	key: z.string().optional().describe("Branch-context key (defaults to the only attached entry)."),
	promptFile: z.string().optional().describe("Write the implementation prompt to this file."),
	includeContent: z
		.boolean()
		.optional()
		.describe("Include the branch-context entry content in JSON output."),
	includePrompt: z
		.boolean()
		.optional()
		.describe("Include the implementation prompt in JSON output."),
});

export const attachRequestSchema = z.object({
	key: z.string().optional().describe("Entry key for --file form."),
	file: z.string().optional().describe("File to attach for arbitrary-key form."),
	plan: z.string().optional().describe("Saved plan slug to attach as <slug>.md."),
	branch: z.string().optional().describe("Target branch (defaults to current branch)."),
});

export const listRequestSchema = z.object({
	branch: z.string().optional().describe("Branch to list (defaults to current branch)."),
});

export const keyRequestSchema = z.object({
	key: z.string().describe("Branch-context entry key."),
	branch: z.string().optional().describe("Target branch (defaults to current branch)."),
});

export type CreateRequest = z.infer<typeof createRequestSchema>;
export type LoadRequest = z.infer<typeof loadRequestSchema>;
export type AttachRequest = z.infer<typeof attachRequestSchema>;
export type ListRequest = z.infer<typeof listRequestSchema>;
export type KeyRequest = z.infer<typeof keyRequestSchema>;

export type BranchContextData = ReturnType<typeof branchContextJson>;
export type LoadPlanData = ReturnType<typeof loadedPlanJson>;
export type AttachData = ReturnType<typeof attachJson>;
export type ListData = ReturnType<typeof listJson>;
export type CheckData = ReturnType<typeof checkJson>;
export type DeleteData = ReturnType<typeof deleteJson>;

export const branchContextResultSchema = z.object({
	slug: z.string(),
	branch: z.string(),
	branchCreation: z.enum(BRANCH_CREATION_METHODS),
	startPoint: z.string(),
	namespace: z.string(),
	key: z.string(),
	refName: z.string(),
	commit: z.string(),
	sourceFile: z.string(),
	summary: z.string().optional(),
});

export const loadPlanResultSchema = z.object({
	branch: z.string(),
	namespace: z.string(),
	selectedKey: z.string(),
	refName: z.string(),
	byteCount: z.number(),
	availableKeys: z.array(z.string()),
	source: z.union([z.literal("attached"), z.literal("saved")]),
	sourceFile: z.string().optional(),
	implementationPromptFile: z.string().optional(),
	attachedPlanContent: z.string().optional(),
	implementationPrompt: z.string().optional(),
});

export const attachResultSchema = z.object({
	branch: z.string(),
	namespace: z.string(),
	key: z.string(),
	refName: z.string(),
	commit: z.string(),
	sourceFile: z.string(),
	planSlug: z.string().optional(),
});

export const listResultSchema = z.object({
	branch: z.string(),
	entries: z.array(
		z.object({
			namespace: z.string(),
			key: z.string(),
			branch: z.string(),
			refName: z.string(),
		}),
	),
});

export const checkResultSchema = z.object({
	branch: z.string(),
	namespace: z.string(),
	key: z.string(),
	present: z.boolean(),
});

export const deleteResultSchema = z.object({
	branch: z.string(),
	namespace: z.string(),
	key: z.string(),
	deleted: z.boolean(),
});

export function createRealBranchContextCliContext(options: {
	cwd: string;
	env?: NodeJS.ProcessEnv | undefined;
	stderr?: ((text: string) => void) | undefined;
	planStoreRoot?: string | undefined;
}): BranchContextCliContext {
	return {
		context: createRealBranchContextContext({
			cwd: options.cwd,
			...(options.env === undefined ? {} : { env: options.env }),
			...(options.stderr === undefined ? {} : { stderr: options.stderr }),
		}),
		cwd: options.cwd,
		...(options.planStoreRoot === undefined ? {} : { planStoreRoot: options.planStoreRoot }),
	};
}

export interface CliDeps {
	context?: BranchContextContext | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	planStoreRoot?: string | undefined;
}

export interface BranchContextCliContext {
	context: BranchContextContext;
	cwd: string;
	planStoreRoot?: string;
}

export async function handleCreate(
	ctx: BranchContextCliContext,
	request: CreateRequest,
): Promise<ClinkrExit<BranchContextData>> {
	return await runOperationCommand({
		operation: "create",
		action: async () => {
			const slugError = validatePlanSlug(request.slug);
			if (slugError !== undefined) {
				return usageError(`Invalid branch context slug: ${slugError}`, {
					code: "invalid-slug",
					argument: "slug",
					reason: slugError,
				});
			}
			const evidence = await createBranchContextFromFile(
				ctx.context.commands,
				{
					slug: request.slug,
					filePath: request.planFile,
					...(request.branch === undefined ? {} : { branchName: request.branch }),
					branchCreation: request.branchCreation,
					...(request.summary === undefined ? {} : { summary: request.summary }),
				},
				operationOptions(ctx),
			);
			return ok(branchContextJson(evidence), { human: formatBranchContextEvidence(evidence) });
		},
		failureFromError: branchContextExitFromError,
	});
}

export async function handleLoad(
	ctx: BranchContextCliContext,
	request: LoadRequest,
): Promise<ClinkrExit<LoadPlanData>> {
	return await runOperationCommand({
		operation: "load",
		action: async () => {
			const requestedKey = request.key;
			const plan = await loadBranchContextPlan(
				ctx.context.commands,
				requestedKey === undefined ? {} : { requestedKey },
				operationOptions(ctx),
			);
			const promptFile =
				request.promptFile === undefined ? undefined : normalizePlanFilePath(request.promptFile);
			const implementationPrompt = buildImplBranchContextPrompt(plan);
			if (promptFile !== undefined) {
				await mkdir(dirname(promptFile), { recursive: true });
				await writeFile(promptFile, implementationPrompt, "utf8");
			}
			const data = loadedPlanJson(plan, {
				promptFile,
				attachedPlanContent: request.includeContent === true ? plan.content : undefined,
				implementationPrompt: request.includePrompt === true ? implementationPrompt : undefined,
			});
			return ok(data, { human: formatLoadPlanHuman(plan, promptFile, implementationPrompt) });
		},
		failureFromError: branchContextExitFromError,
	});
}

export async function handleAttach(
	ctx: BranchContextCliContext,
	request: AttachRequest,
): Promise<ClinkrExit<AttachData>> {
	return await runOperationCommand({
		operation: "attach",
		action: async () => {
			const evidence = await attachBranchContextEntry(
				ctx.context.commands,
				{
					key: request.key,
					filePath: request.file,
					planSlug: request.plan,
					branch: request.branch,
				},
				operationOptions(ctx),
			);
			return ok(attachJson(evidence), { human: formatAttachEvidence(evidence) });
		},
		failureFromError: branchContextExitFromError,
	});
}

export async function handleList(
	ctx: BranchContextCliContext,
	request: ListRequest,
): Promise<ClinkrExit<ListData>> {
	return await runOperationCommand({
		operation: "list",
		action: async () => {
			const list = await listBranchContextEntries(
				{ branch: request.branch },
				operationOptions(ctx),
			);
			return ok(listJson(list), { human: formatListEvidence(list.branch, list.entries) });
		},
		failureFromError: branchContextExitFromError,
	});
}

export async function handleCheck(
	ctx: BranchContextCliContext,
	request: KeyRequest,
): Promise<ClinkrExit<CheckData>> {
	return await runOperationCommand({
		operation: "check",
		action: async () => {
			const evidence = await checkBranchContextEntry(request, operationOptions(ctx));
			return ok(checkJson(evidence), { human: formatCheckEvidence(evidence) });
		},
		failureFromError: branchContextExitFromError,
	});
}

export async function handleDelete(
	ctx: BranchContextCliContext,
	request: KeyRequest,
): Promise<ClinkrExit<DeleteData>> {
	return await runOperationCommand({
		operation: "delete",
		action: async () => {
			const evidence = await deleteBranchContextEntry(request, operationOptions(ctx));
			return ok(deleteJson(evidence), { human: formatDeleteEvidence(evidence) });
		},
		failureFromError: branchContextExitFromError,
	});
}

function branchContextExitFromError(
	operation: BranchContextOperation,
	error: unknown,
): ClinkrExit<never> {
	if (error instanceof AttachBranchContextUsageError) {
		return usageError(error.message, { code: error.code });
	}
	return failure(branchContextErrorType(operation), formatErrorMessage(error), {
		code: branchContextErrorCode(error),
		...branchContextErrorData(error),
	});
}

function branchContextErrorType(operation: BranchContextOperation): string {
	switch (operation) {
		case "create":
			return "branch-context-create-failed";
		case "load":
			return "branch-context-load-failed";
		case "attach":
			return "branch-context-attach-failed";
		case "list":
			return "branch-context-list-failed";
		case "check":
			return "branch-context-check-failed";
		case "delete":
			return "branch-context-delete-failed";
	}
}

function branchContextErrorCode(error: unknown): string {
	if (error instanceof NoAttachedBranchContextEntriesError) return "no-attached-entries";
	if (error instanceof AmbiguousBranchContextPlanEntryError) return "ambiguous-attached-plan";
	if (error instanceof UnsupportedBranchContextPlanKeyError) {
		return "unsupported-attached-plan-key";
	}
	if (error instanceof NoSupportedBranchContextPlanEntriesError) {
		return "no-supported-attached-plans";
	}
	if (error instanceof RequestedBranchContextPlanKeyNotFoundError) {
		return "attached-plan-key-not-found";
	}
	if (error instanceof SavedPlanFallbackLoadError) return "fallback-resolution-failed";
	if (error instanceof BranchContextNamespaceInvalidError) return error.code;
	if (error instanceof AttachBranchContextError) return normalizeErrorCode(error.code);
	return "unexpected-error";
}

function branchContextErrorData(error: unknown): Record<string, unknown> {
	if (error instanceof NoAttachedBranchContextEntriesError) return { branch: error.branch };
	if (error instanceof AmbiguousBranchContextPlanEntryError) {
		return { branch: error.branch, availableKeys: error.availableKeys };
	}
	if (error instanceof UnsupportedBranchContextPlanKeyError) {
		return { branch: error.branch, key: error.key };
	}
	if (error instanceof NoSupportedBranchContextPlanEntriesError) {
		return { branch: error.branch, availableKeys: error.availableKeys };
	}
	if (error instanceof RequestedBranchContextPlanKeyNotFoundError) {
		return {
			branch: error.branch,
			key: error.key,
			availableKeys: error.availableKeys,
			supportedKeys: error.supportedKeys,
		};
	}
	if (error instanceof SavedPlanFallbackLoadError) {
		return {
			branch: error.branch,
			attachedMessage: error.attachedMessage,
			fallbackMessage: error.fallbackMessage,
		};
	}
	if (error instanceof BranchContextNamespaceInvalidError) {
		return { branch: error.branch, unsupportedKeys: error.unsupportedKeys };
	}
	return {};
}

function normalizeErrorCode(code: string): string {
	return code.replaceAll("_", "-");
}

function operationOptions(ctx: BranchContextCliContext) {
	return {
		cwd: ctx.cwd,
		context: ctx.context,
		...(ctx.planStoreRoot === undefined ? {} : { planStoreRoot: ctx.planStoreRoot }),
	};
}

function formatLoadPlanHuman(
	plan: LoadedAttachedPlan,
	promptFile: string | undefined,
	implementationPrompt: string,
): string {
	if (promptFile !== undefined) {
		return `${formatLoadedAttachedPlanEvidence(plan)}\nImplementation prompt file: ${promptFile}`;
	}
	return `${formatLoadedAttachedPlanEvidence(plan)}\n\n${implementationPrompt}`;
}

function branchContextJson(evidence: BranchContextEvidence): {
	slug: string;
	branch: string;
	branchCreation: BranchContextEvidence["branchCreation"];
	startPoint: string;
	namespace: string;
	key: string;
	refName: string;
	commit: string;
	sourceFile: string;
	summary?: string;
} {
	return {
		slug: evidence.slug,
		branch: evidence.branch,
		branchCreation: evidence.branchCreation,
		startPoint: evidence.startPoint,
		namespace: evidence.namespace,
		key: evidence.key,
		refName: evidence.refName,
		commit: evidence.commit,
		sourceFile: evidence.sourceFile,
		...(evidence.summary === undefined ? {} : { summary: evidence.summary }),
	};
}

interface LoadedPlanJsonOptions {
	promptFile?: string | undefined;
	attachedPlanContent?: string | undefined;
	implementationPrompt?: string | undefined;
}

function listJson(list: BranchContextListEvidence): {
	branch: string;
	entries: {
		namespace: string;
		key: string;
		branch: string;
		refName: string;
	}[];
} {
	return {
		branch: list.branch,
		entries: list.entries.map((entry) => ({
			namespace: entry.namespace,
			key: entry.key,
			branch: entry.branch,
			refName: entry.refName,
		})),
	};
}

function attachJson(evidence: BranchContextAttachEvidence): {
	branch: string;
	namespace: string;
	key: string;
	refName: string;
	commit: string;
	sourceFile: string;
	planSlug?: string;
} {
	return {
		branch: evidence.branch,
		namespace: evidence.namespace,
		key: evidence.key,
		refName: evidence.refName,
		commit: evidence.commit,
		sourceFile: evidence.sourceFile,
		...(evidence.planSlug === undefined ? {} : { planSlug: evidence.planSlug }),
	};
}

function checkJson(evidence: BranchContextCheckEvidence): {
	branch: string;
	namespace: string;
	key: string;
	present: boolean;
} {
	return {
		branch: evidence.branch,
		namespace: evidence.namespace,
		key: evidence.key,
		present: evidence.present,
	};
}

function deleteJson(evidence: BranchContextDeleteEvidence): {
	branch: string;
	namespace: string;
	key: string;
	deleted: boolean;
} {
	return {
		branch: evidence.branch,
		namespace: evidence.namespace,
		key: evidence.key,
		deleted: evidence.deleted,
	};
}

function loadedPlanJson(
	plan: LoadedAttachedPlan,
	options: LoadedPlanJsonOptions = {},
): {
	branch: string;
	namespace: string;
	selectedKey: string;
	refName: string;
	byteCount: number;
	availableKeys: string[];
	source: LoadedAttachedPlan["source"];
	sourceFile?: string;
	implementationPromptFile?: string;
	attachedPlanContent?: string;
	implementationPrompt?: string;
} {
	return {
		branch: plan.branch,
		namespace: plan.namespace,
		selectedKey: plan.selectedKey,
		refName: plan.refName,
		byteCount: plan.byteCount,
		availableKeys: plan.availableKeys,
		source: plan.source,
		...(plan.sourceFile === undefined ? {} : { sourceFile: plan.sourceFile }),
		...(options.promptFile === undefined ? {} : { implementationPromptFile: options.promptFile }),
		...(options.attachedPlanContent === undefined
			? {}
			: { attachedPlanContent: options.attachedPlanContent }),
		...(options.implementationPrompt === undefined
			? {}
			: { implementationPrompt: options.implementationPrompt }),
	};
}
