#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { ClinkrFailure, ClinkrGroup, createProcessIo, ok, type ClinkrExit, type ClinkrIo, type LegacyMachineOutput } from "@asdl/clinkr";
import { z } from "zod";

import { NodeCommandExecApi, type PlanCommandExecApi } from "./command-runtime.ts";
import { RealPlansGitGateway, type PlansGitGateway } from "./git-gateway.ts";
import { normalizePlanFilePath, resolvePlanSourceFile, validatePlanSlug } from "./plan-persistence.ts";
import {
	findLatestSavedPlanFile,
	formatSavedPlanFileEvidence,
	listSavedPlans,
	writeSavedPlanFile,
	type LatestSavedPlanFileEvidence,
	type SavedPlanFileEvidence,
	type SavedPlanListItem,
} from "./saved-plan-file.ts";

const VERSION = "0.1.0";
const PLANS_ERROR_TYPE = "plans_error";

const listRequestSchema = z.object({
	plan_store_root: z.string().optional().describe("Plan store root directory (relative paths resolve against cwd)."),
});

const writeRequestSchema = z.object({
	slug: z.string().describe("Saved plan slug."),
	summary: z.string().optional().describe("Optional saved-plan summary."),
	stdin: z.boolean().optional().describe("Read plan content from stdin."),
	content_file: z.string().optional().describe("Read plan content from this file path."),
});

const resolveRequestSchema = z.object({
	path: z.string().optional().describe("Absolute, @-prefixed, or home-relative plan file path."),
});

type ListRequest = z.infer<typeof listRequestSchema>;
type WriteRequest = z.infer<typeof writeRequestSchema>;
type ResolveRequest = z.infer<typeof resolveRequestSchema>;

interface JsonFailure {
	success: false;
	error: { code: string; message: string };
}

interface ExplicitResolvePlanEvidence {
	source: "explicit";
	filePath: string;
}

type LatestResolvePlanEvidence = LatestSavedPlanFileEvidence & { source: "latest" };

type ResolvePlanEvidence = ExplicitResolvePlanEvidence | LatestResolvePlanEvidence;

interface ListData {
	plans: Record<string, unknown>[];
}

type WriteData = Record<string, unknown>;
type ResolveData = Record<string, unknown>;

export interface CliDeps {
	commands?: PlanCommandExecApi | undefined;
	git?: PlansGitGateway | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	stdin?: (() => Promise<string>) | undefined;
	planStoreRoot?: string | undefined;
}

export interface PlansCliContext {
	commands: PlanCommandExecApi;
	git: PlansGitGateway;
	cwd: string;
	stdin: () => Promise<string>;
	planStoreRoot?: string;
}

export function buildCli(): ClinkrGroup<PlansCliContext> {
	const root = new ClinkrGroup<PlansCliContext>({
		name: "plans",
		description: "Saved planned-branch plan operations.",
		version: VERSION,
		runtimeInfo,
	});

	root.command({
		name: "list",
		description: "List saved plans for the current repository across all branch keys.",
		schema: listRequestSchema,
		handler: handleList,
		renderHuman: (data) => stripOneTrailingNewline(formatSavedPlanListFromJson(data.plans)),
		legacyMachine: legacyListMachine,
	});

	const execGroup = new ClinkrGroup<PlansCliContext>({
		name: "exec",
		description: "Run hidden deterministic saved-plan operations for agents.",
		isHidden: true,
	});
	execGroup.command({
		name: "write",
		description: "Save a source-branch plan file in the local store.",
		schema: writeRequestSchema,
		handler: handleWrite,
		renderHuman: (data) => data["__human"] as string,
		legacyMachine: legacyObjectMachine,
	});
	execGroup.command({
		name: "resolve",
		description: "Resolve an explicit or latest source-branch plan file.",
		schema: resolveRequestSchema,
		positionals: { path: { position: 0 } },
		handler: handleResolve,
		renderHuman: (data) => data["__human"] as string,
		legacyMachine: legacyObjectMachine,
	});
	root.group(execGroup);

	return root;
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const commands = deps.commands ?? new NodeCommandExecApi();
	const context: PlansCliContext = {
		commands,
		git: deps.git ?? new RealPlansGitGateway(commands),
		cwd: deps.cwd ?? process.cwd(),
		stdin: deps.stdin ?? readStdin,
		...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
	};
	const io = buildIo(deps);
	return buildCli().run(args, { context, io });
}

async function handleList(ctx: PlansCliContext, request: ListRequest): Promise<ClinkrExit<ListData>> {
	try {
		const cliPlanStoreRoot = request.plan_store_root === undefined ? undefined : normalizeRootPath(request.plan_store_root, ctx.cwd);
		const planStoreRoot = cliPlanStoreRoot ?? ctx.planStoreRoot;
		const plans = await listSavedPlans(ctx.commands, {
			cwd: ctx.cwd,
			git: ctx.git,
			...(planStoreRoot === undefined ? {} : { planStoreRoot }),
		});
		return ok({ plans: plans.map(savedPlanListItemJson) });
	} catch (error) {
		throw asPlansFailure(error);
	}
}

async function handleWrite(ctx: PlansCliContext, request: WriteRequest): Promise<ClinkrExit<WriteData>> {
	try {
		const slugError = validatePlanSlug(request.slug);
		if (slugError !== undefined) throw plansFailure(`Invalid saved plan slug: ${slugError}`);
		if (Boolean(request.stdin) === (request.content_file !== undefined)) {
			throw plansFailure("Pass exactly one of --stdin or --content-file <path>.");
		}

		const content = request.stdin === true ? await ctx.stdin() : await readFile(normalizePlanFilePath(request.content_file as string), "utf8");
		const evidence = await writeSavedPlanFile(
			ctx.commands,
			{ slug: request.slug, content, ...(request.summary === undefined ? {} : { summary: request.summary }) },
			{ cwd: ctx.cwd, git: ctx.git, ...(ctx.planStoreRoot === undefined ? {} : { planStoreRoot: ctx.planStoreRoot }) },
		);
		return ok(withHuman(savedPlanFileJson(evidence), formatSavedPlanFileEvidence(evidence)));
	} catch (error) {
		throw asPlansFailure(error);
	}
}

async function handleResolve(ctx: PlansCliContext, request: ResolveRequest): Promise<ClinkrExit<ResolveData>> {
	try {
		const evidence = await resolvePlanEvidence(request, ctx);
		return ok(withHuman(resolvePlanJson(evidence), formatResolvePlanEvidence(evidence)));
	} catch (error) {
		throw asPlansFailure(error);
	}
}

function buildIo(deps: CliDeps): ClinkrIo {
	if (deps.stdout === undefined && deps.stderr === undefined) return createProcessIo();
	return {
		stdout: deps.stdout ?? ((text: string) => process.stdout.write(text)),
		stderr: deps.stderr ?? ((text: string) => process.stderr.write(text)),
	};
}

function legacyListMachine(exit: ClinkrExit<ListData>): LegacyMachineOutput {
	if (exit.type === "ok") {
		return { body: { success: true, plans: exit.data.plans }, exitCode: 0, serialization: "compact" };
	}
	return legacyFailure(exit);
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
		const body: JsonFailure = { success: false, error: { code: PLANS_ERROR_TYPE, message: exit.message } };
		return { body, exitCode: 2, serialization: "compact" };
	}
	const body: JsonFailure = { success: false, error: { code: PLANS_ERROR_TYPE, message: "Unexpected ok exit." } };
	return { body, exitCode: 2, serialization: "compact" };
}

function plansFailure(message: string): ClinkrFailure {
	return new ClinkrFailure({ errorType: PLANS_ERROR_TYPE, message });
}

function asPlansFailure(error: unknown): ClinkrFailure {
	if (error instanceof ClinkrFailure) return error;
	return plansFailure(errorMessage(error));
}

function normalizeRootPath(rawPath: string, cwd: string): string {
	const normalized = normalizePlanFilePath(rawPath);
	return resolve(cwd, normalized);
}

async function resolvePlanEvidence(args: ResolveRequest, ctx: PlansCliContext): Promise<ResolvePlanEvidence> {
	if (args.path !== undefined) {
		const filePath = await resolvePlanSourceFile(ctx.commands, {
			cwd: ctx.cwd,
			rawFilePath: args.path,
			git: ctx.git,
		});
		return { source: "explicit", filePath };
	}
	const latest = await findLatestSavedPlanFile(ctx.commands, {
		cwd: ctx.cwd,
		git: ctx.git,
		...(ctx.planStoreRoot === undefined ? {} : { planStoreRoot: ctx.planStoreRoot }),
	});
	return { source: "latest", ...latest };
}

function formatSavedPlanListFromJson(plans: readonly Record<string, unknown>[]): string {
	if (plans.length === 0) {
		return "No saved plans found for the current repository.\n";
	}

	const lines = ["Saved plans:"];
	for (const plan of plans) {
		lines.push(
			[
				`- ${plan["slug"]}`,
				`  Branch key: ${plan["branch_key"]}`,
				`  Modified: ${new Date(plan["modified_time_ms"] as number).toISOString()}`,
				`  Path: ${plan["path"]}`,
			].join("\n"),
		);
	}
	return `${lines.join("\n")}\n`;
}

function formatSavedPlanList(plans: readonly SavedPlanListItem[]): string {
	if (plans.length === 0) {
		return "No saved plans found for the current repository.\n";
	}

	const lines = ["Saved plans:"];
	for (const plan of plans) {
		lines.push(
			[
				`- ${plan.slug}`,
				`  Branch key: ${plan.branchKey}`,
				`  Modified: ${new Date(plan.modifiedTimeMs).toISOString()}`,
				`  Path: ${plan.filePath}`,
			].join("\n"),
		);
	}
	return `${lines.join("\n")}\n`;
}

function savedPlanListItemJson(plan: SavedPlanListItem): Record<string, unknown> {
	return {
		slug: plan.slug,
		branch_key: plan.branchKey,
		modified_time_ms: plan.modifiedTimeMs,
		path: plan.filePath,
		file_name: plan.fileName,
		repo: {
			root: plan.repoRoot,
			key: plan.repoKey,
			identity_source: plan.repoIdentitySource,
			plan_store_path: plan.repoDirectoryPath,
		},
	};
}

function savedPlanFileJson(evidence: SavedPlanFileEvidence): Record<string, unknown> {
	return {
		slug: evidence.slug,
		file_path: evidence.filePath,
		repo_root: evidence.repoRoot,
		repo_key: evidence.repoKey,
		repo_identity_source: evidence.repoIdentitySource,
		source_branch: evidence.sourceBranch,
		branch_key: evidence.branchKey,
		...(evidence.summary === undefined ? {} : { summary: evidence.summary }),
	};
}

function resolvePlanJson(evidence: ResolvePlanEvidence): Record<string, unknown> {
	switch (evidence.source) {
		case "explicit":
			return {
				source: evidence.source,
				file_path: evidence.filePath,
			};
		case "latest":
			return {
				source: evidence.source,
				file_path: evidence.filePath,
				slug: evidence.slug,
				file_name: evidence.fileName,
				modified_time_ms: evidence.modifiedTimeMs,
				repo_root: evidence.repoRoot,
				repo_key: evidence.repoKey,
				repo_identity_source: evidence.repoIdentitySource,
				source_branch: evidence.sourceBranch,
				branch_key: evidence.branchKey,
				directory_path: evidence.directoryPath,
			};
	}
}

function formatResolvePlanEvidence(evidence: ResolvePlanEvidence): string {
	if (evidence.source === "explicit") {
		return [`Resolved explicit plan file.`, `Path: ${evidence.filePath}`].join("\n");
	}
	return formatLatestSavedPlanFileEvidence(evidence);
}

function formatLatestSavedPlanFileEvidence(evidence: LatestSavedPlanFileEvidence): string {
	return [
		"Resolved latest saved plan file in local plan store.",
		`Path: ${evidence.filePath}`,
		`Repo key: ${evidence.repoKey}`,
		`Repo root: ${evidence.repoRoot}`,
		`Repo identity source: ${evidence.repoIdentitySource}`,
		`Source branch: ${evidence.sourceBranch}`,
		`Branch path segment: ${evidence.branchKey}`,
		`Slug: ${evidence.slug}`,
		`Modified time ms: ${evidence.modifiedTimeMs}`,
	].join("\n");
}

function withHuman(data: Record<string, unknown>, human: string): Record<string, unknown> {
	return { ...data, __human: human };
}

function stripOneTrailingNewline(value: string): string {
	return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function readStdin(): Promise<string> {
	let content = "";
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) {
		content += chunk;
	}
	return content;
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: @asdl/plans bin plans -> ts/packages/plans/src/cli.ts\n";
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
