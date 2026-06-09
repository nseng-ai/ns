#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
const JSON_FORMAT = "json";

export interface CliDeps {
	commands?: PlanCommandExecApi | undefined;
	git?: PlansGitGateway | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	stdin?: (() => Promise<string>) | undefined;
	planStoreRoot?: string | undefined;
}

interface RequiredCliDeps {
	commands: PlanCommandExecApi;
	git: PlansGitGateway;
	cwd: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	stdin: () => Promise<string>;
	planStoreRoot?: string;
}

type ParseResult<T> = { type: "ok"; value: T } | { type: "help" } | { type: "error"; message: string };
type ValueParseResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

interface ListArgs {
	format?: "json";
	planStoreRoot?: string;
}

interface WriteArgs {
	slug: string;
	summary?: string;
	contentSource: { type: "stdin" } | { type: "content-file"; path: string };
	format?: "json";
}

interface ResolveArgs {
	path?: string;
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

type LatestResolvePlanEvidence = LatestSavedPlanFileEvidence & { source: "latest" };

type ResolvePlanEvidence = ExplicitResolvePlanEvidence | LatestResolvePlanEvidence;

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => process.stdout.write(text));
	const stderr = deps.stderr ?? ((text: string) => process.stderr.write(text));
	const commands = deps.commands ?? new NodeCommandExecApi();
	const requiredDeps: RequiredCliDeps = {
		commands,
		git: deps.git ?? new RealPlansGitGateway(commands),
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
	if (command === "list") {
		return runList(args.slice(1), requiredDeps);
	}
	if (command === "exec") {
		return runExecCommand(args.slice(1), requiredDeps);
	}

	stderr(`Unknown command: ${command}\n\n${topLevelHelp()}`);
	return 2;
}

async function runList(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parseListArgs(args, deps.cwd);
	if (parsed.type === "help") {
		deps.stdout(listHelp());
		return 0;
	}
	if (parsed.type === "error") {
		return writeFailure(parsed.message, { stdout: deps.stdout, stderr: deps.stderr, json: wantsJsonFormat(args) });
	}

	try {
		const planStoreRoot = parsed.value.planStoreRoot ?? deps.planStoreRoot;
		const plans = await listSavedPlans(deps.commands, {
			cwd: deps.cwd,
			git: deps.git,
			...(planStoreRoot === undefined ? {} : { planStoreRoot }),
		});
		if (parsed.value.format === "json") {
			deps.stdout(`${JSON.stringify({ success: true, plans: plans.map(savedPlanListItemJson) })}\n`);
			return 0;
		}
		deps.stdout(formatSavedPlanList(plans));
		return 0;
	} catch (error) {
		return writeFailure(errorMessage(error), { stdout: deps.stdout, stderr: deps.stderr, json: parsed.value.format === "json" });
	}
}

async function runExecCommand(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const operation = args[0];
	if (operation === undefined || operation === "--help" || operation === "-h") {
		deps.stdout(execHelp());
		return 0;
	}

	try {
		switch (operation) {
			case "write":
				return await runWrite(args.slice(1), deps);
			case "resolve":
				return await runResolve(args.slice(1), deps);
			default:
				deps.stderr(`Unknown exec operation: ${operation}\n\n${execHelp()}`);
				return 2;
		}
	} catch (error) {
		return writeFailure(errorMessage(error), { stdout: deps.stdout, stderr: deps.stderr, json: wantsJsonFormat(args) });
	}
}

async function runWrite(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parseWriteArgs(args);
	if (parsed.type === "help") {
		deps.stdout(writeHelp());
		return 0;
	}
	if (parsed.type === "error") return writeFailure(parsed.message, { stdout: deps.stdout, stderr: deps.stderr, json: wantsJsonFormat(args) });

	const options = parsed.value;
	const content = await readContentSource(options.contentSource, deps);
	const evidence = await writeSavedPlanFile(
		deps.commands,
		{ slug: options.slug, content, ...(options.summary === undefined ? {} : { summary: options.summary }) },
		{ cwd: deps.cwd, git: deps.git, ...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }) },
	);
	if (options.format === "json") {
		deps.stdout(`${JSON.stringify({ success: true, ...savedPlanFileJson(evidence) })}\n`);
		return 0;
	}
	deps.stdout(`${formatSavedPlanFileEvidence(evidence)}\n`);
	return 0;
}

async function runResolve(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parseResolveArgs(args);
	if (parsed.type === "help") {
		deps.stdout(resolveHelp());
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

function parseListArgs(args: readonly string[], cwd: string): ParseResult<ListArgs> {
	let format: "json" | undefined;
	let planStoreRoot: string | undefined;

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
		if (arg === "--plan-store-root") {
			const value = parseFlagValue(args, index, "--plan-store-root");
			if (value.type === "error") return value;
			planStoreRoot = normalizeRootPath(value.value, cwd);
			index += 1;
			continue;
		}
		return { type: "error", message: `Unknown option: ${arg}` };
	}

	return { type: "ok", value: { ...(format === undefined ? {} : { format }), ...(planStoreRoot === undefined ? {} : { planStoreRoot }) } };
}

function parseWriteArgs(args: readonly string[]): ParseResult<WriteArgs> {
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

function parseResolveArgs(args: readonly string[]): ParseResult<ResolveArgs> {
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
		if (path !== undefined) return { type: "error", message: "resolve accepts at most one plan file path." };
		path = arg;
	}
	return { type: "ok", value: { ...(path === undefined ? {} : { path }), ...(format === undefined ? {} : { format }) } };
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

function normalizeRootPath(rawPath: string, cwd: string): string {
	const normalized = normalizePlanFilePath(rawPath);
	return resolve(cwd, normalized);
}

function wantsJsonFormat(args: readonly string[]): boolean {
	return args.some((arg, index) => arg === "--format" && args[index + 1] === JSON_FORMAT);
}

async function readContentSource(source: WriteArgs["contentSource"], deps: RequiredCliDeps): Promise<string> {
	if (source.type === "stdin") return deps.stdin();
	return readFile(normalizePlanFilePath(source.path), "utf8");
}

async function resolvePlanEvidence(args: ResolveArgs, deps: RequiredCliDeps): Promise<ResolvePlanEvidence> {
	if (args.path !== undefined) {
		const filePath = await resolvePlanSourceFile(deps.commands, {
			cwd: deps.cwd,
			rawFilePath: args.path,
			git: deps.git,
		});
		return { source: "explicit", filePath };
	}
	const latest = await findLatestSavedPlanFile(deps.commands, {
		cwd: deps.cwd,
		git: deps.git,
		...(deps.planStoreRoot === undefined ? {} : { planStoreRoot: deps.planStoreRoot }),
	});
	return { source: "latest", ...latest };
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

function writeFailure(message: string, output: { stdout: (text: string) => void; stderr: (text: string) => void; json: boolean }): number {
	if (output.json) {
		const payload: JsonFailure = { success: false, error: { code: "plans_error", message } };
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
		"Usage: plans [--version] <command>",
		"",
		"Commands:",
		"  list    List saved plans for the current repository across all branch keys.",
		"  exec    Run hidden deterministic saved-plan operations for agents.",
		"",
		"Options:",
		"  -h, --help       Show this help.",
		"  -V, --version    Show the package version.",
		"",
	].join("\n");
}

function listHelp(): string {
	return ["Usage: plans list [--format json] [--plan-store-root <path>]", ""].join("\n");
}

function execHelp(): string {
	return [
		"Usage: plans exec <operation>",
		"",
		"Operations:",
		"  write      Save a source-branch plan file in the local store.",
		"  resolve    Resolve an explicit or latest source-branch plan file.",
		"",
	].join("\n");
}

function writeHelp(): string {
	return ["Usage: plans exec write --slug <saved-plan-slug> [--summary <text>] --stdin|--content-file <path> [--format json]", ""].join("\n");
}

function resolveHelp(): string {
	return ["Usage: plans exec resolve [absolute-or-home-plan-file.md] [--format json]", ""].join("\n");
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
