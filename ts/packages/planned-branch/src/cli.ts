#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ClinkrFailure, ClinkrGroup, createProcessIo, ok, type ClinkrExit, type ClinkrIo, type LegacyMachineOutput } from "@asdl/clinkr";
import { z } from "zod";

import { normalizePlanFilePath, validatePlanSlug } from "@asdl/plans";

import {
	buildImplPlannedBranchPrompt,
	formatLoadedAttachedPlanEvidence,
	loadPlannedBranchPlan,
	type LoadedAttachedPlan,
} from "./attached-plan.ts";
import { createRealPlannedBranchContext, type PlannedBranchContext } from "./context.ts";
import {
	createPlannedBranchFromFile,
	formatPlannedBranchEvidence,
	type PlannedBranchEvidence,
} from "./planned-branch-creation.ts";

const VERSION = "0.1.0";
const PLANNED_BRANCH_ERROR_TYPE = "planned_branch_error";

const createRequestSchema = z.object({
	slug: z.string().describe("Planned branch slug."),
	plan_file: z.string().describe("Plan file path (must live outside the repository)."),
	branch: z.string().optional().describe("Branch name (defaults to the slug)."),
	branch_creation: z.enum(["plain-git", "graphite"]).default("plain-git").describe("Branch creation method."),
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

type CreateData = Record<string, unknown>;
type LoadPlanData = Record<string, unknown>;

interface JsonFailure {
	success: false;
	error: { code: string; message: string };
}

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
	execGroup.command({
		name: "create",
		description: "Create a planned branch and attach a plan with Branch Memory.",
		schema: createRequestSchema,
		handler: handleCreate,
		renderHuman: (data) => data["__human"] as string,
		legacyMachine: legacyObjectMachine,
	});
	execGroup.command({
		name: "load-plan",
		description: "Load an attached plan and render the implementation prompt.",
		schema: loadPlanRequestSchema,
		positionals: { key_or_slug: { position: 0 } },
		handler: handleLoadPlan,
		renderHuman: (data) => data["__human"] as string,
		legacyMachine: legacyObjectMachine,
	});
	root.group(execGroup);

	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const context: PlannedBranchCliContext = {
		context: deps.context ?? createRealPlannedBranchContext(),
		cwd: deps.cwd ?? process.cwd(),
		...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
	};
	const io = buildIo(deps);
	return buildCli().run(args, { context, io });
}

async function handleCreate(ctx: PlannedBranchCliContext, request: CreateRequest): Promise<ClinkrExit<CreateData>> {
	try {
		const slugError = validatePlanSlug(request.slug);
		if (slugError !== undefined) throw plannedBranchFailure(`Invalid planned branch slug: ${slugError}`);
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
		return ok(withHuman(plannedBranchJson(evidence), formatPlannedBranchEvidence(evidence)));
	} catch (error) {
		throw asPlannedBranchFailure(error);
	}
}

async function handleLoadPlan(ctx: PlannedBranchCliContext, request: LoadPlanRequest): Promise<ClinkrExit<LoadPlanData>> {
	try {
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
		const data = loadedPlanJson(plan, {
			promptFile,
			attachedPlanContent: request.include_content === true ? plan.content : undefined,
			implementationPrompt: request.include_prompt === true ? buildImplPlannedBranchPrompt(plan) : undefined,
		});
		return ok(withHuman(data, formatLoadPlanHuman(plan, promptFile)));
	} catch (error) {
		throw asPlannedBranchFailure(error);
	}
}

function formatLoadPlanHuman(plan: LoadedAttachedPlan, promptFile: string | undefined): string {
	if (promptFile !== undefined) {
		return `${formatLoadedAttachedPlanEvidence(plan)}\nImplementation prompt file: ${promptFile}`;
	}
	return `${formatLoadedAttachedPlanEvidence(plan)}\n\n${buildImplPlannedBranchPrompt(plan)}`;
}

function buildIo(deps: CliDeps): ClinkrIo {
	if (deps.stdout === undefined && deps.stderr === undefined) return createProcessIo();
	return {
		stdout: deps.stdout ?? ((text: string) => process.stdout.write(text)),
		stderr: deps.stderr ?? ((text: string) => process.stderr.write(text)),
	};
}

function legacyObjectMachine(exit: ClinkrExit<Record<string, unknown>>): LegacyMachineOutput {
	if (exit.type === "ok") {
		const { __human: _human, ...data } = exit.data;
		return { body: { success: true, ...data }, exitCode: 0, serialization: "compact" };
	}
	return legacyFailure(exit);
}

function legacyFailure<T>(exit: ClinkrExit<T>): LegacyMachineOutput {
	if (exit.type === "failure") {
		const body: JsonFailure = { success: false, error: { code: exit.errorType, message: exit.message } };
		return { body, exitCode: 2, serialization: "compact" };
	}
	if (exit.type === "negative") {
		const body: JsonFailure = { success: false, error: { code: PLANNED_BRANCH_ERROR_TYPE, message: exit.message } };
		return { body, exitCode: 2, serialization: "compact" };
	}
	const body: JsonFailure = { success: false, error: { code: PLANNED_BRANCH_ERROR_TYPE, message: "Unexpected ok exit." } };
	return { body, exitCode: 2, serialization: "compact" };
}

function plannedBranchFailure(message: string): ClinkrFailure {
	return new ClinkrFailure({ errorType: PLANNED_BRANCH_ERROR_TYPE, message });
}

function asPlannedBranchFailure(error: unknown): ClinkrFailure {
	if (error instanceof ClinkrFailure) return error;
	return plannedBranchFailure(errorMessage(error));
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

function withHuman(data: Record<string, unknown>, human: string): Record<string, unknown> {
	return { ...data, __human: human };
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/planned-branch bin planned-branch -> ts/packages/planned-branch/src/cli.ts\n";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	const exitCode = await runCli(process.argv.slice(2));
	process.exitCode = exitCode;
}

function isDirectCliInvocation(metaUrl: string, argvPath: string | undefined): boolean {
	if (argvPath === undefined) return false;

	try {
		const modulePath = realpathSync(fileURLToPath(metaUrl));
		const entryPath = realpathSync(resolve(argvPath));
		return modulePath === entryPath;
	} catch {
		return false;
	}
}
