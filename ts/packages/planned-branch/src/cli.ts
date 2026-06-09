#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
	type BranchCreationMethod,
	type PlannedBranchEvidence,
} from "./planned-branch-creation.ts";

const VERSION = "0.1.0";
const JSON_FORMAT = "json";

export interface CliDeps {
	context?: PlannedBranchContext | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	planStoreRoot?: string | undefined;
}

interface RequiredCliDeps {
	context: PlannedBranchContext;
	cwd: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	planStoreRoot?: string;
}

type ParseResult<T> = { type: "ok"; value: T } | { type: "help" } | { type: "error"; message: string };
type ValueParseResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

interface CreateArgs {
	slug: string;
	planFile: string;
	branch?: string;
	branchCreation?: BranchCreationMethod;
	summary?: string;
	format?: "json";
}

interface LoadPlanArgs {
	keyOrSlug?: string;
	format?: "json";
	promptFile?: string;
	shouldIncludeContent: boolean;
	shouldIncludePrompt: boolean;
}

interface JsonFailure {
	success: false;
	error: { code: string; message: string };
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));
	const requiredDeps: RequiredCliDeps = {
		context: deps.context ?? createRealPlannedBranchContext(),
		cwd: deps.cwd ?? process.cwd(),
		stdout,
		stderr,
		...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
	};

	const command = args[0];
	if (command === undefined || command === "--help" || command === "-h") {
		stdout(topLevelHelp());
		return 0;
	}
	if (command === "--version" || command === "-V") {
		stdout(`${VERSION}\n`);
		return 0;
	}
	if (command !== "exec") {
		stderr(`Unknown command: ${command}\n\n${topLevelHelp()}`);
		return 2;
	}

	return runExecCommand(args.slice(1), requiredDeps);
}

async function runExecCommand(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const operation = args[0];
	if (operation === undefined || operation === "--help" || operation === "-h") {
		deps.stdout(execHelp());
		return 0;
	}

	try {
		switch (operation) {
			case "create":
				return await runCreate(args.slice(1), deps);
			case "load-plan":
				return await runLoadPlan(args.slice(1), deps);
			default:
				deps.stderr(`Unknown exec operation: ${operation}\n\n${execHelp()}`);
				return 2;
		}
	} catch (error) {
		return writeFailure(errorMessage(error), { stdout: deps.stdout, stderr: deps.stderr, json: wantsJsonFormat(args) });
	}
}

async function runCreate(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parseCreateArgs(args);
	if (parsed.type === "help") {
		deps.stdout(createHelp());
		return 0;
	}
	if (parsed.type === "error") return writeFailure(parsed.message, { stdout: deps.stdout, stderr: deps.stderr, json: wantsJsonFormat(args) });

	const options = parsed.value;
	const evidence = await createPlannedBranchFromFile(
		deps.context.commands,
		{
			slug: options.slug,
			filePath: options.planFile,
			...(options.branch === undefined ? {} : { branchName: options.branch }),
			...(options.branchCreation === undefined ? {} : { branchCreation: options.branchCreation }),
			...(options.summary === undefined ? {} : { summary: options.summary }),
		},
		{ cwd: deps.cwd, git: deps.context.git, brmem: deps.context.brmem, graphite: deps.context.graphite },
	);
	if (options.format === "json") {
		deps.stdout(`${JSON.stringify({ success: true, ...plannedBranchJson(evidence) })}\n`);
		return 0;
	}
	deps.stdout(`${formatPlannedBranchEvidence(evidence)}\n`);
	return 0;
}

async function runLoadPlan(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parseLoadPlanArgs(args);
	if (parsed.type === "help") {
		deps.stdout(loadPlanHelp());
		return 0;
	}
	if (parsed.type === "error") return writeFailure(parsed.message, { stdout: deps.stdout, stderr: deps.stderr, json: wantsJsonFormat(args) });
	if ((parsed.value.shouldIncludeContent || parsed.value.shouldIncludePrompt) && parsed.value.format !== "json") {
		return writeFailure("--include-content and --include-prompt require --format json.", { stdout: deps.stdout, stderr: deps.stderr, json: false });
	}

	const requestedKey = parsed.value.keyOrSlug;
	const plan = await loadPlannedBranchPlan(deps.context.commands, requestedKey === undefined ? {} : { requestedKey }, {
		cwd: deps.cwd,
		git: deps.context.git,
		brmem: deps.context.brmem,
		...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
	});
	const promptFile = parsed.value.promptFile === undefined ? undefined : normalizePlanFilePath(parsed.value.promptFile);
	if (promptFile !== undefined) {
		await writeFile(promptFile, buildImplPlannedBranchPrompt(plan), "utf8");
	}
	if (parsed.value.format === "json") {
		deps.stdout(
			`${JSON.stringify({
				success: true,
				...loadedPlanJson(plan, {
					promptFile,
					attachedPlanContent: parsed.value.shouldIncludeContent ? plan.content : undefined,
					implementationPrompt: parsed.value.shouldIncludePrompt ? buildImplPlannedBranchPrompt(plan) : undefined,
				}),
			})}\n`,
		);
		return 0;
	}
	if (promptFile !== undefined) {
		deps.stdout(`${formatLoadedAttachedPlanEvidence(plan)}\nImplementation prompt file: ${promptFile}\n`);
		return 0;
	}
	deps.stdout(`${formatLoadedAttachedPlanEvidence(plan)}\n\n${buildImplPlannedBranchPrompt(plan)}\n`);
	return 0;
}

function wantsJsonFormat(args: readonly string[]): boolean {
	return args.some((arg, index) => arg === "--format" && args[index + 1] === JSON_FORMAT);
}

function parseCreateArgs(args: readonly string[]): ParseResult<CreateArgs> {
	let slug: string | undefined;
	let planFile: string | undefined;
	let branch: string | undefined;
	let branchCreation: BranchCreationMethod | undefined;
	let summary: string | undefined;
	let format: "json" | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) continue;
		if (arg === "--help" || arg === "-h") return { type: "help" };
		if (arg === "--slug") {
			const parsed = parseFlagValue(args, index, "--slug");
			if (parsed.type === "error") return parsed;
			slug = parsed.value;
			index += 1;
			continue;
		}
		if (arg === "--plan-file") {
			const parsed = parseFlagValue(args, index, "--plan-file");
			if (parsed.type === "error") return parsed;
			planFile = parsed.value;
			index += 1;
			continue;
		}
		if (arg === "--branch") {
			const parsed = parseFlagValue(args, index, "--branch");
			if (parsed.type === "error") return parsed;
			branch = parsed.value;
			index += 1;
			continue;
		}
		if (arg === "--branch-creation") {
			const parsed = parseFlagValue(args, index, "--branch-creation");
			if (parsed.type === "error") return parsed;
			const value = parsed.value;
			if (value !== "plain-git" && value !== "graphite") {
				return { type: "error", message: "--branch-creation must be one of plain-git or graphite." };
			}
			branchCreation = value;
			index += 1;
			continue;
		}
		if (arg === "--summary") {
			const parsed = parseFlagValue(args, index, "--summary");
			if (parsed.type === "error") return parsed;
			summary = parsed.value;
			index += 1;
			continue;
		}
		if (arg === "--format") {
			const value = parseFlagValue(args, index, "--format");
			if (value.type === "error") return value;
			const parsed = parseFormat(value.value);
			if (parsed.type === "error") return parsed;
			format = parsed.value;
			index += 1;
			continue;
		}
		return { type: "error", message: `Unknown option: ${arg}` };
	}

	if (slug === undefined) return { type: "error", message: "Missing required option: --slug" };
	if (planFile === undefined) return { type: "error", message: "Missing required option: --plan-file" };
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) return { type: "error", message: `Invalid planned branch slug: ${slugError}` };
	return {
		type: "ok",
		value: {
			slug,
			planFile,
			...(branch === undefined ? {} : { branch }),
			...(branchCreation === undefined ? {} : { branchCreation }),
			...(summary === undefined ? {} : { summary }),
			...(format === undefined ? {} : { format }),
		},
	};
}

function parseLoadPlanArgs(args: readonly string[]): ParseResult<LoadPlanArgs> {
	let keyOrSlug: string | undefined;
	let format: "json" | undefined;
	let promptFile: string | undefined;
	let shouldIncludeContent = false;
	let shouldIncludePrompt = false;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) continue;
		if (arg === "--help" || arg === "-h") return { type: "help" };
		if (arg === "--format") {
			const value = parseFlagValue(args, index, "--format");
			if (value.type === "error") return value;
			const parsed = parseFormat(value.value);
			if (parsed.type === "error") return parsed;
			format = parsed.value;
			index += 1;
			continue;
		}
		if (arg === "--prompt-file") {
			const value = parseFlagValue(args, index, "--prompt-file");
			if (value.type === "error") return value;
			promptFile = value.value;
			index += 1;
			continue;
		}
		if (arg === "--include-content") {
			shouldIncludeContent = true;
			continue;
		}
		if (arg === "--include-prompt") {
			shouldIncludePrompt = true;
			continue;
		}
		if (arg.startsWith("-")) return { type: "error", message: `Unknown option: ${arg}` };
		if (keyOrSlug !== undefined) return { type: "error", message: "load-plan accepts at most one key or slug." };
		keyOrSlug = arg;
	}
	return {
		type: "ok",
		value: {
			shouldIncludeContent,
			shouldIncludePrompt,
			...(keyOrSlug === undefined ? {} : { keyOrSlug }),
			...(format === undefined ? {} : { format }),
			...(promptFile === undefined ? {} : { promptFile }),
		},
	};
}

function parseFormat(value: string): ValueParseResult<"json"> {
	if (value === JSON_FORMAT) return { type: "ok", value };
	return { type: "error", message: "--format must be json." };
}

function parseFlagValue(args: readonly string[], index: number, flag: string): ValueParseResult<string> {
	const value = args[index + 1];
	if (value === undefined || value.startsWith("--")) {
		return { type: "error", message: `${flag} requires a value.` };
	}
	return { type: "ok", value };
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

function writeFailure(message: string, output: { stdout: (text: string) => void; stderr: (text: string) => void; json: boolean }): number {
	if (output.json) {
		const payload: JsonFailure = { success: false, error: { code: "planned_branch_error", message } };
		output.stdout(`${JSON.stringify(payload)}\n`);
		return 2;
	}
	output.stderr(`Error: ${message}\n`);
	return 2;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function topLevelHelp(): string {
	return [
		"Usage: planned-branch [--version] <command>",
		"",
		"Commands:",
		"  exec    Run hidden deterministic planned-branch operations for agents.",
		"",
		"Options:",
		"  -h, --help       Show this help.",
		"  -V, --version    Show the package version.",
		"",
	].join("\n");
}

function execHelp(): string {
	return [
		"Usage: planned-branch exec <operation>",
		"",
		"Operations:",
		"  create     Create a planned branch and attach a plan with Branch Memory.",
		"  load-plan  Load an attached plan and render the implementation prompt.",
		"",
	].join("\n");
}

function createHelp(): string {
	return [
		"Usage: planned-branch exec create --slug <planned-branch-slug> --plan-file <path> [--branch <branch>] [--branch-creation plain-git|graphite] [--summary <text>] [--format json]",
		"",
	].join("\n");
}

function loadPlanHelp(): string {
	return [
		"Usage: planned-branch exec load-plan [key-or-slug] [--prompt-file <path>] [--include-content] [--include-prompt] [--format json]",
		"",
		"JSON output is metadata-only by default. Use --prompt-file for normal agent handoff;",
		"use --include-content or --include-prompt only when the caller can safely accept large stdout.",
		"",
	].join("\n");
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
