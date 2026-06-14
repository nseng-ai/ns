#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { legacyCommand, type LegacyPayload } from "@asdl/clinkr/legacy";
import { z } from "zod";

import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { normalizePlanFilePath, validatePlanSlug } from "@asdl/plans";
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
} from "./attach.ts";

import {
	buildImplBranchContextPrompt,
	formatLoadedAttachedPlanEvidence,
	loadBranchContextPlan,
	type LoadedAttachedPlan,
} from "./attached-plan.ts";
import { createRealBranchContextContext, type BranchContextContext } from "./context.ts";
import {
	BRANCH_CREATION_METHODS,
	createBranchContextFromFile,
	DEFAULT_BRANCH_CREATION_METHOD,
	formatBranchContextEvidence,
	type BranchContextEvidence,
} from "./branch-context-creation.ts";

const VERSION = "0.1.0";
const BRANCH_CONTEXT_ERROR_TYPE = "branch_context_error";

const createRequestSchema = z.object({
	slug: z.string().describe("Branch context slug."),
	plan_file: z.string().describe("Plan file path (must live outside the repository)."),
	branch: z.string().optional().describe("Branch name (defaults to the slug)."),
	branch_creation: z.enum(BRANCH_CREATION_METHODS).default(DEFAULT_BRANCH_CREATION_METHOD).describe("Branch creation method."),
	summary: z.string().optional().describe("Optional plan summary."),
});

const loadRequestSchema = z.object({
	key: z.string().optional().describe("Branch-context key (defaults to the only attached entry)."),
	prompt_file: z.string().optional().describe("Write the implementation prompt to this file."),
	include_content: z.boolean().optional().describe("Include the branch-context entry content in JSON output."),
	include_prompt: z.boolean().optional().describe("Include the implementation prompt in JSON output."),
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

export function buildCli(): ClinkrGroup<BranchContextCliContext> {
	const root = new ClinkrGroup<BranchContextCliContext>({
		name: "branch-context",
		description: "Branch context operations.",
		version: VERSION,
		runtimeInfo,
	});

	const execGroup = new ClinkrGroup<BranchContextCliContext>({
		name: "exec",
		description: "Run hidden deterministic branch-context operations for agents.",
		isHidden: true,
	});
	execGroup.command(
		legacyCommand({
			name: "from-plan",
			description: "Create a branch context from a saved plan.",
			schema: createRequestSchema,
			errorType: BRANCH_CONTEXT_ERROR_TYPE,
			run: handleCreate,
		}),
	);
	execGroup.command(
		legacyCommand({
			name: "load",
			description: "Load a branch-context entry and render the implementation prompt.",
			schema: loadRequestSchema,
			positionals: { key: { position: 0 } },
			errorType: BRANCH_CONTEXT_ERROR_TYPE,
			run: handleLoad,
		}),
	);
	execGroup.command(
		legacyCommand({
			name: "attach",
			description: "Attach a saved plan or file as branch context.",
			schema: attachRequestSchema,
			positionals: { key: { position: 0 } },
			errorType: BRANCH_CONTEXT_ERROR_TYPE,
			run: handleAttach,
		}),
	);
	execGroup.command(
		legacyCommand({
			name: "list",
			description: "List branch-context entries.",
			schema: listRequestSchema,
			errorType: BRANCH_CONTEXT_ERROR_TYPE,
			run: handleList,
		}),
	);
	execGroup.command(
		legacyCommand({
			name: "check",
			description: "Check whether a branch-context entry exists.",
			schema: keyRequestSchema,
			positionals: { key: { position: 0 } },
			errorType: BRANCH_CONTEXT_ERROR_TYPE,
			run: handleCheck,
		}),
	);
	execGroup.command(
		legacyCommand({
			name: "delete",
			description: "Delete a branch-context entry.",
			schema: keyRequestSchema,
			positionals: { key: { position: 0 } },
			errorType: BRANCH_CONTEXT_ERROR_TYPE,
			run: handleDelete,
		}),
	);
	root.group(execGroup);

	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const context: BranchContextCliContext = {
		context: deps.context ?? createRealBranchContextContext(),
		cwd: deps.cwd ?? process.cwd(),
		...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
	};
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	return buildCli().run(args, { context, io });
}

async function handleCreate(ctx: BranchContextCliContext, request: CreateRequest): Promise<LegacyPayload> {
	const slugError = validatePlanSlug(request.slug);
	if (slugError !== undefined) throw new Error(`Invalid branch context slug: ${slugError}`);
	const evidence = await createBranchContextFromFile(
		ctx.context.commands,
		{
			slug: request.slug,
			filePath: request.plan_file,
			...(request.branch === undefined ? {} : { branchName: request.branch }),
			branchCreation: request.branch_creation,
			...(request.summary === undefined ? {} : { summary: request.summary }),
		},
		operationOptions(ctx),
	);
	return { machine: branchContextJson(evidence), human: formatBranchContextEvidence(evidence) };
}

async function handleLoad(ctx: BranchContextCliContext, request: LoadRequest): Promise<LegacyPayload> {
	const requestedKey = request.key;
	const plan = await loadBranchContextPlan(ctx.context.commands, requestedKey === undefined ? {} : { requestedKey }, operationOptions(ctx));
	const promptFile = request.prompt_file === undefined ? undefined : normalizePlanFilePath(request.prompt_file);
	if (promptFile !== undefined) {
		await writeFile(promptFile, buildImplBranchContextPrompt(plan), "utf8");
	}
	const machine = loadedPlanJson(plan, {
		promptFile,
		attachedPlanContent: request.include_content === true ? plan.content : undefined,
		implementationPrompt: request.include_prompt === true ? buildImplBranchContextPrompt(plan) : undefined,
	});
	return { machine, human: formatLoadPlanHuman(plan, promptFile) };
}

async function handleAttach(ctx: BranchContextCliContext, request: AttachRequest): Promise<LegacyPayload> {
	const evidence = await attachBranchContextEntry(ctx.context.commands, { key: request.key, filePath: request.file, planSlug: request.plan, branch: request.branch }, operationOptions(ctx));
	return { machine: attachJson(evidence), human: formatAttachEvidence(evidence) };
}

async function handleList(ctx: BranchContextCliContext, request: ListRequest): Promise<LegacyPayload> {
	const list = await listBranchContextEntries(ctx.context.commands, { branch: request.branch }, operationOptions(ctx));
	return {
		machine: { entries: list.entries.map((entry) => ({ namespace: entry.namespace, key: entry.key, branch: entry.branch, ref_name: entry.refName })) },
		human: formatListEvidence(list.branch, list.entries),
	};
}

async function handleCheck(ctx: BranchContextCliContext, request: KeyRequest): Promise<LegacyPayload> {
	const evidence = await checkBranchContextEntry(ctx.context.commands, request, operationOptions(ctx));
	return { machine: checkJson(evidence), human: formatCheckEvidence(evidence) };
}

async function handleDelete(ctx: BranchContextCliContext, request: KeyRequest): Promise<LegacyPayload> {
	const evidence = await deleteBranchContextEntry(ctx.context.commands, request, operationOptions(ctx));
	return { machine: deleteJson(evidence), human: formatDeleteEvidence(evidence) };
}

function operationOptions(ctx: BranchContextCliContext) {
	return {
		cwd: ctx.cwd,
		context: ctx.context,
		...(ctx.planStoreRoot === undefined ? {} : { planStoreRoot: ctx.planStoreRoot }),
	};
}

function formatLoadPlanHuman(plan: LoadedAttachedPlan, promptFile: string | undefined): string {
	if (promptFile !== undefined) {
		return `${formatLoadedAttachedPlanEvidence(plan)}\nImplementation prompt file: ${promptFile}`;
	}
	return `${formatLoadedAttachedPlanEvidence(plan)}\n\n${buildImplBranchContextPrompt(plan)}`;
}

function branchContextJson(evidence: BranchContextEvidence): Record<string, unknown> {
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

function attachJson(evidence: BranchContextAttachEvidence): Record<string, unknown> {
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

function checkJson(evidence: BranchContextCheckEvidence): Record<string, unknown> {
	return { branch: evidence.branch, namespace: evidence.namespace, key: evidence.key, present: evidence.present };
}

function deleteJson(evidence: BranchContextDeleteEvidence): Record<string, unknown> {
	return { branch: evidence.branch, namespace: evidence.namespace, key: evidence.key, deleted: evidence.deleted };
}

function loadedPlanJson(plan: LoadedAttachedPlan, options: LoadedPlanJsonOptions = {}): Record<string, unknown> {
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
		...(options.attachedPlanContent === undefined ? {} : { attached_plan_content: options.attachedPlanContent }),
		...(options.implementationPrompt === undefined ? {} : { implementation_prompt: options.implementationPrompt }),
	};
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/branch-context bin branch-context -> ts/packages/branch-context/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	const exitCode = await runCli(process.argv.slice(2));
	process.exitCode = exitCode;
}
