#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import process from "node:process";

import { buildImplPlannedBranchPrompt, loadAttachedPlan, type LoadedAttachedPlan } from "./attached-plan.ts";
import { createRealPlannedBranchContext, type PlannedBranchContext } from "./context.ts";
import {
	createPlannedBranchFromFile,
	formatPlannedBranchEvidence,
	type BranchCreationMethod,
	type PlannedBranchEvidence,
} from "./planned-branch-creation.ts";
import { normalizePlanFilePath, validatePlanSlug } from "./plan-persistence.ts";
import {
	findLatestSourceBranchPlanFile,
	formatSourceBranchPlanFileEvidence,
	writeSourceBranchPlanFile,
	type LatestSourceBranchPlanFileEvidence,
	type SourceBranchPlanFileEvidence,
} from "./source-plan-file.ts";
import { resolvePlanSourceFile } from "./plan-persistence.ts";

const VERSION = "0.1.0";
const JSON_FORMAT = "json";

export interface CliDeps {
	context?: PlannedBranchContext | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	stdin?: (() => Promise<string>) | undefined;
	planStoreRoot?: string | undefined;
}

interface RequiredCliDeps {
	context: PlannedBranchContext;
	cwd: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	stdin: () => Promise<string>;
	planStoreRoot?: string;
}

type ParseResult<T> = { type: "ok"; value: T } | { type: "help" } | { type: "error"; message: string };
type ValueParseResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

interface WritePlanFileArgs {
	slug: string;
	summary?: string;
	contentSource: { type: "stdin" } | { type: "content-file"; path: string };
	format?: "json";
}

interface ResolvePlanArgs {
	path?: string;
	format?: "json";
}

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
}

interface JsonFailure {
	success: false;
	error: { code: string; message: string };
}

interface ExplicitResolvePlanEvidence {
	source: "explicit";
	filePath: string;
}

type LatestResolvePlanEvidence = LatestSourceBranchPlanFileEvidence & { source: "latest" };

type ResolvePlanEvidence = ExplicitResolvePlanEvidence | LatestResolvePlanEvidence;

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));
	const requiredDeps: RequiredCliDeps = {
		context: deps.context ?? createRealPlannedBranchContext(),
		cwd: deps.cwd ?? process.cwd(),
		stdout,
		stderr,
		stdin: deps.stdin ?? readStdin,
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
			case "write-plan-file":
				return await runWritePlanFile(args.slice(1), deps);
			case "resolve-plan":
				return await runResolvePlan(args.slice(1), deps);
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

async function runWritePlanFile(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parseWritePlanFileArgs(args);
	if (parsed.type === "help") {
		deps.stdout(writePlanFileHelp());
		return 0;
	}
	if (parsed.type === "error") return writeFailure(parsed.message, { stdout: deps.stdout, stderr: deps.stderr, json: wantsJsonFormat(args) });

	const options = parsed.value;
	const content = await readContentSource(options.contentSource, deps);
	const evidence = await writeSourceBranchPlanFile(
		deps.context.commands,
		{ slug: options.slug, content, ...(options.summary === undefined ? {} : { summary: options.summary }) },
		{ cwd: deps.cwd, git: deps.context.git, ...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }) },
	);
	if (options.format === "json") {
		deps.stdout(`${JSON.stringify({ success: true, ...sourcePlanFileJson(evidence) })}\n`);
		return 0;
	}
	deps.stdout(`${formatSourceBranchPlanFileEvidence(evidence)}\n`);
	return 0;
}

async function runResolvePlan(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parseResolvePlanArgs(args);
	if (parsed.type === "help") {
		deps.stdout(resolvePlanHelp());
		return 0;
	}
	if (parsed.type === "error") return writeFailure(parsed.message, { stdout: deps.stdout, stderr: deps.stderr, json: wantsJsonFormat(args) });

	const evidence = await resolvePlanEvidence(parsed.value, deps);
	if (parsed.value.format === "json") {
		deps.stdout(`${JSON.stringify({ success: true, ...resolvePlanJson(evidence) })}\n`);
		return 0;
	}
	deps.stdout(`${formatResolvePlanEvidence(evidence)}\n`);
	return 0;
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
		{ cwd: deps.cwd, git: deps.context.git },
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

	const requestedKey = parsed.value.keyOrSlug;
	const plan = await loadAttachedPlan(deps.context.commands, requestedKey === undefined ? {} : { requestedKey }, { cwd: deps.cwd, git: deps.context.git });
	const implementationPrompt = buildImplPlannedBranchPrompt(plan);
	if (parsed.value.format === "json") {
		deps.stdout(`${JSON.stringify({ success: true, ...loadedPlanJson(plan, implementationPrompt) })}\n`);
		return 0;
	}
	deps.stdout(`${formatLoadedPlan(plan)}\n\n${implementationPrompt}\n`);
	return 0;
}

function wantsJsonFormat(args: readonly string[]): boolean {
	return args.some((arg, index) => arg === "--format" && args[index + 1] === JSON_FORMAT);
}

function parseWritePlanFileArgs(args: readonly string[]): ParseResult<WritePlanFileArgs> {
	let slug: string | undefined;
	let summary: string | undefined;
	let hasStdin = false;
	let contentFile: string | undefined;
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
		if (arg === "--summary") {
			const parsed = parseFlagValue(args, index, "--summary");
			if (parsed.type === "error") return parsed;
			summary = parsed.value;
			index += 1;
			continue;
		}
		if (arg === "--stdin") {
			hasStdin = true;
			continue;
		}
		if (arg === "--content-file") {
			const parsed = parseFlagValue(args, index, "--content-file");
			if (parsed.type === "error") return parsed;
			contentFile = parsed.value;
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
	const slugError = validatePlanSlug(slug);
	if (slugError !== undefined) return { type: "error", message: `Invalid saved plan slug: ${slugError}` };
	if (hasStdin === Boolean(contentFile)) return { type: "error", message: "Pass exactly one of --stdin or --content-file <path>." };
	const contentSource = hasStdin ? { type: "stdin" as const } : { type: "content-file" as const, path: contentFile as string };
	return { type: "ok", value: { slug, contentSource, ...(summary === undefined ? {} : { summary }), ...(format === undefined ? {} : { format }) } };
}

function parseResolvePlanArgs(args: readonly string[]): ParseResult<ResolvePlanArgs> {
	let path: string | undefined;
	let format: "json" | undefined;
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
		if (arg.startsWith("-")) return { type: "error", message: `Unknown option: ${arg}` };
		if (path !== undefined) return { type: "error", message: "resolve-plan accepts at most one plan file path." };
		path = arg;
	}
	return { type: "ok", value: { ...(path === undefined ? {} : { path }), ...(format === undefined ? {} : { format }) } };
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
		if (arg.startsWith("-")) return { type: "error", message: `Unknown option: ${arg}` };
		if (keyOrSlug !== undefined) return { type: "error", message: "load-plan accepts at most one key or slug." };
		keyOrSlug = arg;
	}
	return { type: "ok", value: { ...(keyOrSlug === undefined ? {} : { keyOrSlug }), ...(format === undefined ? {} : { format }) } };
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

async function readContentSource(source: WritePlanFileArgs["contentSource"], deps: RequiredCliDeps): Promise<string> {
	if (source.type === "stdin") return deps.stdin();
	return readFile(normalizePlanFilePath(source.path), "utf8");
}

async function resolvePlanEvidence(args: ResolvePlanArgs, deps: RequiredCliDeps): Promise<ResolvePlanEvidence> {
	if (args.path !== undefined) {
		const filePath = await resolvePlanSourceFile(deps.context.commands, deps.cwd, args.path, undefined, deps.context.git);
		return { source: "explicit", filePath };
	}
	const latest = await findLatestSourceBranchPlanFile(deps.context.commands, {
		cwd: deps.cwd,
		git: deps.context.git,
		...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
	});
	return { source: "latest", ...latest };
}

function sourcePlanFileJson(evidence: SourceBranchPlanFileEvidence): Record<string, unknown> {
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

function loadedPlanJson(plan: LoadedAttachedPlan, implementationPrompt: string): Record<string, unknown> {
	return {
		branch: plan.branch,
		namespace: plan.namespace,
		selected_key: plan.selectedKey,
		ref_name: plan.refName,
		byte_count: plan.byteCount,
		available_keys: plan.availableKeys,
		attached_plan_content: plan.content,
		implementation_prompt: implementationPrompt,
	};
}

function formatResolvePlanEvidence(evidence: ResolvePlanEvidence): string {
	if (evidence.source === "explicit") {
		return [`Resolved explicit plan file.`, `Path: ${evidence.filePath}`].join("\n");
	}
	return formatLatestSourceBranchPlanFileEvidence(evidence);
}

function formatLatestSourceBranchPlanFileEvidence(evidence: LatestSourceBranchPlanFileEvidence): string {
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

function formatLoadedPlan(plan: LoadedAttachedPlan): string {
	return [
		"Loaded attached planned-branch plan.",
		`Branch: ${plan.branch}`,
		`Namespace: ${plan.namespace}`,
		`Selected key: ${plan.selectedKey}`,
		`Ref: ${plan.refName}`,
		`Bytes: ${plan.byteCount}`,
	].join("\n");
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

async function readStdin(): Promise<string> {
	let content = "";
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) {
		content += chunk;
	}
	return content;
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
		"  write-plan-file    Save a source-branch plan file in the local store.",
		"  resolve-plan       Resolve an explicit or latest source-branch plan file.",
		"  create             Create a planned branch and attach a plan with Branch Memory.",
		"  load-plan          Load an attached plan and render the implementation prompt.",
		"",
	].join("\n");
}

function writePlanFileHelp(): string {
	return [
		"Usage: planned-branch exec write-plan-file --slug <saved-plan-slug> [--summary <text>] --stdin|--content-file <path> [--format json]",
		"",
	].join("\n");
}

function resolvePlanHelp(): string {
	return ["Usage: planned-branch exec resolve-plan [absolute-or-home-plan-file.md] [--format json]", ""].join("\n");
}

function createHelp(): string {
	return [
		"Usage: planned-branch exec create --slug <planned-branch-slug> --plan-file <path> [--branch <branch>] [--branch-creation plain-git|graphite] [--summary <text>] [--format json]",
		"",
	].join("\n");
}

function loadPlanHelp(): string {
	return ["Usage: planned-branch exec load-plan [key-or-slug] [--format json]", ""].join("\n");
}

if (import.meta.main) {
	const exitCode = await runCli(process.argv.slice(2));
	process.exitCode = exitCode;
}
