#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

import { ClinkrGroup, ok, type ClinkrExit } from "@sdl/clinkr";
import { defineCli, runClinkrCommand } from "@sdl/core/cli-entry";
import { normalizePlanFilePath, validatePlanSlug } from "@sdl/plans";
import { z } from "zod";

import {
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

const BRANCH_CONTEXT_ERROR_TYPE = "branch_context_error";

const createRequestSchema = z.object({
	slug: z.string().describe("Branch context slug."),
	planFile: z.string().describe("Plan file path (must live outside the repository)."),
	branch: z.string().optional().describe("Branch name (defaults to the slug)."),
	branchCreation: z
		.enum(BRANCH_CREATION_METHODS)
		.default(DEFAULT_BRANCH_CREATION_METHOD)
		.describe("Branch creation method."),
	summary: z.string().optional().describe("Optional plan summary."),
});

const loadRequestSchema = z.object({
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

const attachRequestSchema = z.object({
	key: z.string().optional().describe("Entry key for --file form."),
	file: z.string().optional().describe("File to attach for arbitrary-key form."),
	plan: z.string().optional().describe("Saved plan slug to attach as <slug>.md."),
	branch: z.string().optional().describe("Target branch (defaults to current branch)."),
});

const listRequestSchema = z.object({
	branch: z.string().optional().describe("Branch to list (defaults to current branch)."),
});

const keyRequestSchema = z.object({
	key: z.string().describe("Branch-context entry key."),
	branch: z.string().optional().describe("Target branch (defaults to current branch)."),
});

type CreateRequest = z.infer<typeof createRequestSchema>;
type LoadRequest = z.infer<typeof loadRequestSchema>;
type AttachRequest = z.infer<typeof attachRequestSchema>;
type ListRequest = z.infer<typeof listRequestSchema>;
type KeyRequest = z.infer<typeof keyRequestSchema>;

type BranchContextData = ReturnType<typeof branchContextJson>;
type LoadPlanData = ReturnType<typeof loadedPlanJson>;
type AttachData = ReturnType<typeof attachJson>;
type ListData = ReturnType<typeof listJson>;
type CheckData = ReturnType<typeof checkJson>;
type DeleteData = ReturnType<typeof deleteJson>;

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

const entry = defineCli<BranchContextCliContext, CliDeps, undefined>({
	metaUrl: import.meta.url,
	runtime: "typescript",
	description: "Branch context operations.",
	prepareRun: ({ deps, cwd }) => {
		const context: BranchContextCliContext = {
			context: deps.context ?? createRealBranchContextContext({ cwd }),
			cwd,
			...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
		};
		return { type: "run", context, buildState: undefined };
	},
	configureCli: ({ root }) => {
		const execGroup = new ClinkrGroup<BranchContextCliContext>({
			name: "exec",
			description: "Run hidden deterministic branch-context operations for agents.",
			isHidden: true,
		});
		execGroup.command({
			name: "from-plan",
			description: "Create a branch context from a saved plan.",
			schema: createRequestSchema,
			handler: handleCreate,
		});
		execGroup.command({
			name: "load",
			description: "Load a branch-context entry and render the implementation prompt.",
			schema: loadRequestSchema,
			positionals: { key: { position: 0 } },
			handler: handleLoad,
		});
		execGroup.command({
			name: "attach",
			description: "Attach a saved plan or file as branch context.",
			schema: attachRequestSchema,
			positionals: { key: { position: 0 } },
			handler: handleAttach,
		});
		execGroup.command({
			name: "list",
			description: "List branch-context entries.",
			schema: listRequestSchema,
			handler: handleList,
		});
		execGroup.command({
			name: "check",
			description: "Check whether a branch-context entry exists.",
			schema: keyRequestSchema,
			positionals: { key: { position: 0 } },
			handler: handleCheck,
		});
		execGroup.command({
			name: "delete",
			description: "Delete a branch-context entry.",
			schema: keyRequestSchema,
			positionals: { key: { position: 0 } },
			handler: handleDelete,
		});
		root.group(execGroup);
	},
});

export const VERSION = entry.version;

export function buildCli(): ClinkrGroup<BranchContextCliContext> {
	return entry.buildCli(undefined);
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	return await entry.run(args, deps);
}

async function handleCreate(
	ctx: BranchContextCliContext,
	request: CreateRequest,
): Promise<ClinkrExit<BranchContextData>> {
	return await runClinkrCommand(BRANCH_CONTEXT_ERROR_TYPE, async () => {
		const slugError = validatePlanSlug(request.slug);
		if (slugError !== undefined) throw new Error(`Invalid branch context slug: ${slugError}`);
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
	});
}

async function handleLoad(
	ctx: BranchContextCliContext,
	request: LoadRequest,
): Promise<ClinkrExit<LoadPlanData>> {
	return await runClinkrCommand(BRANCH_CONTEXT_ERROR_TYPE, async () => {
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
			await writeFile(promptFile, implementationPrompt, "utf8");
		}
		const data = loadedPlanJson(plan, {
			promptFile,
			attachedPlanContent: request.includeContent === true ? plan.content : undefined,
			implementationPrompt: request.includePrompt === true ? implementationPrompt : undefined,
		});
		return ok(data, { human: formatLoadPlanHuman(plan, promptFile, implementationPrompt) });
	});
}

async function handleAttach(
	ctx: BranchContextCliContext,
	request: AttachRequest,
): Promise<ClinkrExit<AttachData>> {
	return await runClinkrCommand(BRANCH_CONTEXT_ERROR_TYPE, async () => {
		const evidence = await attachBranchContextEntry(
			ctx.context.commands,
			{ key: request.key, filePath: request.file, planSlug: request.plan, branch: request.branch },
			operationOptions(ctx),
		);
		return ok(attachJson(evidence), { human: formatAttachEvidence(evidence) });
	});
}

async function handleList(
	ctx: BranchContextCliContext,
	request: ListRequest,
): Promise<ClinkrExit<ListData>> {
	return await runClinkrCommand(BRANCH_CONTEXT_ERROR_TYPE, async () => {
		const list = await listBranchContextEntries({ branch: request.branch }, operationOptions(ctx));
		return ok(listJson(list), { human: formatListEvidence(list.branch, list.entries) });
	});
}

async function handleCheck(
	ctx: BranchContextCliContext,
	request: KeyRequest,
): Promise<ClinkrExit<CheckData>> {
	return await runClinkrCommand(BRANCH_CONTEXT_ERROR_TYPE, async () => {
		const evidence = await checkBranchContextEntry(request, operationOptions(ctx));
		return ok(checkJson(evidence), { human: formatCheckEvidence(evidence) });
	});
}

async function handleDelete(
	ctx: BranchContextCliContext,
	request: KeyRequest,
): Promise<ClinkrExit<DeleteData>> {
	return await runClinkrCommand(BRANCH_CONTEXT_ERROR_TYPE, async () => {
		const evidence = await deleteBranchContextEntry(request, operationOptions(ctx));
		return ok(deleteJson(evidence), { human: formatDeleteEvidence(evidence) });
	});
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
	branch_creation: BranchContextEvidence["branchCreation"];
	start_point: string;
	namespace: string;
	key: string;
	ref_name: string;
	commit: string;
	source_file: string;
	summary?: string;
} {
	return {
		slug: evidence.slug,
		branch: evidence.branch,
		branch_creation: evidence.branchCreation,
		start_point: evidence.startPoint,
		namespace: evidence.namespace,
		key: evidence.key,
		ref_name: evidence.refName,
		commit: evidence.commit,
		source_file: evidence.sourceFile,
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
		ref_name: string;
	}[];
} {
	return {
		branch: list.branch,
		entries: list.entries.map((entry) => ({
			namespace: entry.namespace,
			key: entry.key,
			branch: entry.branch,
			ref_name: entry.refName,
		})),
	};
}

function attachJson(evidence: BranchContextAttachEvidence): {
	branch: string;
	namespace: string;
	key: string;
	ref_name: string;
	commit: string;
	source_file: string;
	plan_slug?: string;
} {
	return {
		branch: evidence.branch,
		namespace: evidence.namespace,
		key: evidence.key,
		ref_name: evidence.refName,
		commit: evidence.commit,
		source_file: evidence.sourceFile,
		...(evidence.planSlug === undefined ? {} : { plan_slug: evidence.planSlug }),
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
	selected_key: string;
	ref_name: string;
	byte_count: number;
	available_keys: string[];
	source: LoadedAttachedPlan["source"];
	source_file?: string;
	implementation_prompt_file?: string;
	attached_plan_content?: string;
	implementation_prompt?: string;
} {
	return {
		branch: plan.branch,
		namespace: plan.namespace,
		selected_key: plan.selectedKey,
		ref_name: plan.refName,
		byte_count: plan.byteCount,
		available_keys: plan.availableKeys,
		source: plan.source,
		...(plan.sourceFile === undefined ? {} : { source_file: plan.sourceFile }),
		...(options.promptFile === undefined ? {} : { implementation_prompt_file: options.promptFile }),
		...(options.attachedPlanContent === undefined
			? {}
			: { attached_plan_content: options.attachedPlanContent }),
		...(options.implementationPrompt === undefined
			? {}
			: { implementation_prompt: options.implementationPrompt }),
	};
}

await entry.runIfMain({ isImportMetaMain: import.meta.main });
