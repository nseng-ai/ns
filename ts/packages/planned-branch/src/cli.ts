#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import process from "node:process";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { legacyCommand, type LegacyPayload } from "@asdl/clinkr/legacy";
import { z } from "zod";

import { isDirectCliInvocation } from "@asdl/core/cli-entry";
import { normalizePlanFilePath, validatePlanSlug } from "@asdl/plans";

import {
	buildImplPlannedBranchPrompt,
	formatLoadedAttachedPlanEvidence,
	loadPlannedBranchPlan,
	type LoadedAttachedPlan,
} from "./attached-plan.ts";
import { createRealPlannedBranchContext, type PlannedBranchContext } from "./context.ts";
import {
	BRANCH_CREATION_METHODS,
	createPlannedBranchFromFile,
	DEFAULT_BRANCH_CREATION_METHOD,
	formatPlannedBranchEvidence,
	type PlannedBranchEvidence,
} from "./planned-branch-creation.ts";

const VERSION = "0.1.0";
const PLANNED_BRANCH_ERROR_TYPE = "planned_branch_error";

const createRequestSchema = z.object({
	slug: z.string().describe("Planned branch slug."),
	plan_file: z.string().describe("Plan file path (must live outside the repository)."),
	branch: z.string().optional().describe("Branch name (defaults to the slug)."),
	branch_creation: z.enum(BRANCH_CREATION_METHODS).default(DEFAULT_BRANCH_CREATION_METHOD).describe("Branch creation method."),
	summary: z.string().optional().describe("Optional plan summary."),
});

const loadPlanRequestSchema = z.object({
	key_or_slug: z.string().optional().describe("Attached plan key or slug."),
	prompt_file: z.string().optional().describe("Write the implementation prompt to this file."),
	include_content: z.boolean().optional().describe("Include the attached plan content in JSON output."),
	include_prompt: z.boolean().optional().describe("Include the implementation prompt in JSON output."),
});

type CreateRequest = z.infer<typeof createRequestSchema>;
type LoadPlanRequest = z.infer<typeof loadPlanRequestSchema>;

export interface CliDeps {
	context?: PlannedBranchContext | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	planStoreRoot?: string | undefined;
}

export interface PlannedBranchCliContext {
	context: PlannedBranchContext;
	cwd: string;
	planStoreRoot?: string;
}

export function buildCli(): ClinkrGroup<PlannedBranchCliContext> {
	const root = new ClinkrGroup<PlannedBranchCliContext>({
		name: "planned-branch",
		description: "Planned branch operations.",
		version: VERSION,
		runtimeInfo,
	});

	const execGroup = new ClinkrGroup<PlannedBranchCliContext>({
		name: "exec",
		description: "Run hidden deterministic planned-branch operations for agents.",
		isHidden: true,
	});
	execGroup.command(
		legacyCommand({
			name: "create",
			description: "Create a planned branch and attach a plan with Branch Memory.",
			schema: createRequestSchema,
			errorType: PLANNED_BRANCH_ERROR_TYPE,
			run: handleCreate,
		}),
	);
	execGroup.command(
		legacyCommand({
			name: "load-plan",
			description: "Load an attached plan and render the implementation prompt.",
			schema: loadPlanRequestSchema,
			positionals: { key_or_slug: { position: 0 } },
			errorType: PLANNED_BRANCH_ERROR_TYPE,
			run: handleLoadPlan,
		}),
	);
	root.group(execGroup);

	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const context: PlannedBranchCliContext = {
		context: deps.context ?? createRealPlannedBranchContext(),
		cwd: deps.cwd ?? process.cwd(),
		...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
	};
	const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
	return buildCli().run(args, { context, io });
}

async function handleCreate(ctx: PlannedBranchCliContext, request: CreateRequest): Promise<LegacyPayload> {
	const slugError = validatePlanSlug(request.slug);
	if (slugError !== undefined) throw new Error(`Invalid planned branch slug: ${slugError}`);
	const evidence = await createPlannedBranchFromFile(
		ctx.context.commands,
		{
			slug: request.slug,
			filePath: request.plan_file,
			...(request.branch === undefined ? {} : { branchName: request.branch }),
			branchCreation: request.branch_creation,
			...(request.summary === undefined ? {} : { summary: request.summary }),
		},
		{ cwd: ctx.cwd, git: ctx.context.git, brmem: ctx.context.brmem, graphite: ctx.context.graphite },
	);
	return { machine: plannedBranchJson(evidence), human: formatPlannedBranchEvidence(evidence) };
}

async function handleLoadPlan(ctx: PlannedBranchCliContext, request: LoadPlanRequest): Promise<LegacyPayload> {
	const requestedKey = request.key_or_slug;
	const plan = await loadPlannedBranchPlan(ctx.context.commands, requestedKey === undefined ? {} : { requestedKey }, {
		cwd: ctx.cwd,
		git: ctx.context.git,
		brmem: ctx.context.brmem,
		...(ctx.planStoreRoot === undefined ? {} : { planStoreRoot: ctx.planStoreRoot }),
	});
	const promptFile = request.prompt_file === undefined ? undefined : normalizePlanFilePath(request.prompt_file);
	if (promptFile !== undefined) {
		await writeFile(promptFile, buildImplPlannedBranchPrompt(plan), "utf8");
	}
	const machine = loadedPlanJson(plan, {
		promptFile,
		attachedPlanContent: request.include_content === true ? plan.content : undefined,
		implementationPrompt: request.include_prompt === true ? buildImplPlannedBranchPrompt(plan) : undefined,
	});
	return { machine, human: formatLoadPlanHuman(plan, promptFile) };
}

function formatLoadPlanHuman(plan: LoadedAttachedPlan, promptFile: string | undefined): string {
	if (promptFile !== undefined) {
		return `${formatLoadedAttachedPlanEvidence(plan)}\nImplementation prompt file: ${promptFile}`;
	}
	return `${formatLoadedAttachedPlanEvidence(plan)}\n\n${buildImplPlannedBranchPrompt(plan)}`;
}

function plannedBranchJson(evidence: PlannedBranchEvidence): Record<string, unknown> {
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
	return "runtime: typescript\nentry_point: @asdl/planned-branch bin planned-branch -> ts/packages/planned-branch/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	const exitCode = await runCli(process.argv.slice(2));
	process.exitCode = exitCode;
}
