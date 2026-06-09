#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { NodeCommandExecApi, type PlanCommandExecApi } from "./command-runtime.ts";
import { RealPlansGitGateway, type PlansGitGateway } from "./git-gateway.ts";
import { listSavedPlans, type SavedPlanListItem } from "./saved-plan-file.ts";
import { normalizePlanFilePath } from "./plan-persistence.ts";

const VERSION = "0.1.0";
const JSON_FORMAT = "json";

export interface CliDeps {
	commands?: PlanCommandExecApi | undefined;
	git?: PlansGitGateway | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	planStoreRoot?: string | undefined;
}

interface RequiredCliDeps {
	commands: PlanCommandExecApi;
	git: PlansGitGateway;
	cwd: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	planStoreRoot?: string;
}

type ParseResult<T> = { type: "ok"; value: T } | { type: "help" } | { type: "error"; message: string };
type ValueParseResult<T> = { type: "ok"; value: T } | { type: "error"; message: string };

interface ListArgs {
	format?: "json";
	planStoreRoot?: string;
}

interface JsonFailure {
	success: false;
	error: { code: string; message: string };
}

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
	if (command !== "list") {
		stderr(`Unknown command: ${command}\n\n${topLevelHelp()}`);
		return 2;
	}

	return runList(args.slice(1), requiredDeps);
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

function topLevelHelp(): string {
	return [
		"Usage: plans [--version] <command>",
		"",
		"Commands:",
		"  list    List saved plans for the current repository across all branch keys.",
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
