#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";

import { runCheckpointCommand, runCheckpointIfPending } from "./checkpoint.ts";
import { createRealAsdlDevContext, type AsdlDevContext } from "./context.ts";
import {
	CHECKPOINT_MODEL_ENV,
	DEFAULT_CHECKPOINT_MODEL_REF,
	DEFAULT_PR_DESCRIPTION_MODEL_REF,
	DEFAULT_TEXT_BACKEND,
	PR_DESCRIPTION_MODEL_ENV,
	TEXT_BACKEND_ENV,
} from "./text-generation.ts";
import { formatHumanFailure, formatJson } from "./output.ts";
import { lookupPreviewUrl, type PreviewUrlOptions } from "./preview-url.ts";
import { PR_DESCRIPTION_PROMPT_ENV, REPO_PR_DESCRIPTION_PROMPT_PATH } from "./pr-description.ts";
import { runPrRegenCommand } from "./pr-regen.ts";
import { runSubmitCommand, type SubmitOutputListener, type SubmitRestackConfirmationPrompt } from "./submit.ts";

export type ConfirmPrompt = (title: string, message: string) => Promise<boolean> | boolean;

export interface CliDeps {
	context?: AsdlDevContext | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	env?: Record<string, string | undefined> | undefined;
	onOutput?: SubmitOutputListener | undefined;
	confirm?: ConfirmPrompt | undefined;
}

export interface AsdlDevCommandInfo {
	name: string;
	description: string;
}

export interface AsdlDevCliContext {
	context: AsdlDevContext;
	cwd: string;
	env: Record<string, string | undefined>;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	onOutput?: SubmitOutputListener;
	confirm?: ConfirmPrompt;
}

interface ParsedSubmitArgs {
	restack: boolean;
}

interface ParsedPrRegenArgs {
	shouldForce: boolean;
}

interface RequiredCliDeps {
	context: AsdlDevContext;
	cwd: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	env: Record<string, string | undefined>;
	onOutput?: SubmitOutputListener;
	confirm?: ConfirmPrompt;
}

interface CommandSpecForListing {
	name: string;
	description: string;
}

const PREVIEW_URL_COMMAND: CommandSpecForListing = {
	name: "preview-url",
	description: "Print the Vercel preview URL for a branch.",
};

const CHECKPOINT_COMMAND: CommandSpecForListing = {
	name: "cp",
	description: "Create a checkpoint commit for the current diff.",
};

const MIGRATED_COMMANDS: readonly CommandSpecForListing[] = [PREVIEW_URL_COMMAND, CHECKPOINT_COMMAND];

const LEGACY_COMMANDS: CommandSpecForListing[] = [
	{
		name: "submit",
		description: "Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai.",
	},
	{
		name: "pr-regen",
		description: "Regenerate the current branch PR's title and description with the asdl PR-description prompt.",
	},
];

const MIGRATED_COMMAND_NAMES = new Set(MIGRATED_COMMANDS.map((command) => command.name));

export function buildCli(): ClinkrGroup<AsdlDevCliContext> {
	const group = new ClinkrGroup<AsdlDevCliContext>({
		name: "asdl-dev",
		description: "Developer tools for asdl-tools.",
		runtimeInfo: () => "runtime: typescript\nentry_point: asdl-dev bin asdl-dev -> ts/packages/asdl-dev/src/cli.ts\n",
	});

	group.command(
		rawCommand({
			name: PREVIEW_URL_COMMAND.name,
			description: "Print the Vercel preview URL for the selected branch.",
			summary: PREVIEW_URL_COMMAND.description,
			schema: z.object({
				branch: z.string().describe("Branch to look up. Defaults to the current git branch.").optional(),
				project: z
					.string()
					.describe("Vercel project. Defaults to VERCEL_PROJECT, .vercel/project.json, then asdl-tools.")
					.optional(),
				scope: z.string().describe("Vercel scope/team. Defaults to VERCEL_SCOPE, then schrockns-projects.").optional(),
				json: z.boolean().default(false).describe("Emit machine-readable JSON on stdout, including failures."),
			}),
			run: async (ctx, request) => {
				const lookupOptions: PreviewUrlOptions = {
					cwd: ctx.cwd,
					env: ctx.env,
				};
				if (request.branch) {
					lookupOptions.branch = request.branch;
				}
				if (request.project) {
					lookupOptions.project = request.project;
				}
				if (request.scope) {
					lookupOptions.scope = request.scope;
				}

				const result = await lookupPreviewUrl(lookupOptions, ctx.context);
				if (request.json) {
					ctx.stdout(formatJson(result.payload));
					return result.exitCode;
				}

				if (result.payload.success) {
					ctx.stdout(`${result.payload.preview_url}\n`);
				} else {
					ctx.stderr(formatHumanFailure(result.payload));
				}
				return result.exitCode;
			},
		}),
	);

	group.command(
		rawCommand({
			name: CHECKPOINT_COMMAND.name,
			description: `Create a checkpoint commit for the current git diff using a model-authored message.

Environment:
  ${TEXT_BACKEND_ENV}      Text generation backend. Defaults to ${DEFAULT_TEXT_BACKEND}.
  ${CHECKPOINT_MODEL_ENV}  Backend-native model reference. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}.`,
			summary: CHECKPOINT_COMMAND.description,
			schema: z.object({}),
			run: async (ctx) => {
				const result = await runCheckpointCommand({
					cwd: ctx.cwd,
					env: ctx.env,
					gateway: ctx.context.checkpoint,
					textGeneration: ctx.context.textGeneration,
				});
				if (result.stdout !== "") {
					ctx.stdout(result.stdout);
				}
				if (result.stderr !== "") {
					ctx.stderr(result.stderr);
				}
				return result.exitCode;
			},
		}),
	);

	return group;
}

export function listAsdlDevCommands(): AsdlDevCommandInfo[] {
	return [...MIGRATED_COMMANDS, ...LEGACY_COMMANDS].map((command) => ({
		name: command.name,
		description: command.description,
	}));
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => {
		process.stdout.write(text);
	});
	const stderr = deps.stderr ?? ((text: string) => {
		process.stderr.write(text);
	});

	const context = deps.context ?? createRealAsdlDevContext();
	const cwd = deps.cwd ?? process.cwd();
	const env = deps.env ?? process.env;

	const commandName = args[0];
	if (commandName === undefined || commandName === "--help" || commandName === "-h") {
		stdout(topLevelHelp());
		return 0;
	}
	if (commandName === "--runtime") {
		stdout(runtimeInfo());
		return 0;
	}

	// Dispatch to migrated (clinkr-based) commands
	if (MIGRATED_COMMAND_NAMES.has(commandName)) {
		const contextWithIO: AsdlDevCliContext = { context, cwd, env, stdout, stderr };
		if (deps.onOutput !== undefined) {
			contextWithIO.onOutput = deps.onOutput;
		}
		if (deps.confirm !== undefined) {
			contextWithIO.confirm = deps.confirm;
		}
		const cli = buildCli();
		const io = resolveIo({ stdout, stderr });
		return cli.run(args, { context: contextWithIO, io });
	}

	// Dispatch to legacy commands
	const commandDeps: RequiredCliDeps = {
		context,
		cwd,
		stdout,
		stderr,
		env,
	};
	if (deps.onOutput !== undefined) {
		commandDeps.onOutput = deps.onOutput;
	}
	if (deps.confirm !== undefined) {
		commandDeps.confirm = deps.confirm;
	}

	if (commandName === "submit") {
		return runSubmitCliCommand(args.slice(1), commandDeps);
	}
	if (commandName === "pr-regen") {
		return runPrRegenCliCommand(args.slice(1), commandDeps);
	}

	stderr(`Unknown command: ${commandName}\n\n${topLevelHelp()}`);
	return 2;
}

async function runSubmitCliCommand(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parseSubmitArgs(args);
	if (parsed.kind === "help") {
		deps.stdout(submitHelp());
		return 0;
	}
	if (parsed.kind === "error") {
		deps.stderr(`Error: ${parsed.message}\n\n${submitHelp()}`);
		return 2;
	}

	const checkpoint = await runCheckpointIfPending({
		cwd: deps.cwd,
		env: deps.env,
		gateway: deps.context.checkpoint,
		textGeneration: deps.context.textGeneration,
	});
	if (checkpoint.kind === "failed") {
		deps.stderr(formatCheckpointBeforeSubmitFailure(checkpoint.output.stderr));
		return checkpoint.output.exitCode;
	}
	if (checkpoint.kind === "checkpointed") {
		writeCommandResultOutput(checkpoint.output, deps);
	}

	const confirm = deps.confirm;
	const result = await runSubmitCommand({
		cwd: deps.cwd,
		gateway: deps.context.submit,
		metadataGateway: deps.context.submitMetadata,
		restack: parsed.options.restack,
		prDescription: {
			githubPr: deps.context.githubPr,
			textGeneration: deps.context.textGeneration,
			git: deps.context.git,
			env: deps.env,
		},
		...(deps.onOutput === undefined ? {} : { onOutput: deps.onOutput }),
		...(confirm === undefined
			? {}
			: {
					confirmRestack: (prompt: SubmitRestackConfirmationPrompt) => confirm(prompt.title, prompt.message),
				}),
	});
	writeCommandResultOutput(result, deps);
	return result.exitCode;
}

async function runPrRegenCliCommand(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parsePrRegenArgs(args);
	if (parsed.kind === "help") {
		deps.stdout(prRegenHelp());
		return 0;
	}
	if (parsed.kind === "error") {
		deps.stderr(`Error: ${parsed.message}\n\n${prRegenHelp()}`);
		return 2;
	}

	const result = await runPrRegenCommand({
		cwd: deps.cwd,
		env: deps.env,
		githubPr: deps.context.githubPr,
		textGeneration: deps.context.textGeneration,
		git: deps.context.git,
		shouldForce: parsed.options.shouldForce,
	});
	writeCommandResultOutput(result, deps);
	return result.exitCode;
}

function writeCommandResultOutput(result: { stdout: string; stderr: string }, deps: Pick<RequiredCliDeps, "stdout" | "stderr">): void {
	if (result.stdout !== "") {
		deps.stdout(result.stdout);
	}
	if (result.stderr !== "") {
		deps.stderr(result.stderr);
	}
}

function formatCheckpointBeforeSubmitFailure(stderr: string): string {
	const trimmed = stderr.trimEnd();
	const message = trimmed === "" ? "Checkpoint before submit failed. Submission was not attempted." : `Checkpoint before submit failed. Submission was not attempted.\n\n${trimmed}`;
	return `${message}\n`;
}

type ParseResult<T> = { kind: "ok"; options: T } | { kind: "help" } | { kind: "error"; message: string };

function parseSubmitArgs(args: readonly string[]): ParseResult<ParsedSubmitArgs> {
	const options: ParsedSubmitArgs = { restack: false };

	for (const arg of args) {
		if (arg === "--help" || arg === "-h") {
			return { kind: "help" };
		}
		if (arg === "--restack") {
			options.restack = true;
			continue;
		}
		return { kind: "error", message: arg.startsWith("-") ? `Unknown option: ${arg}` : `Unexpected argument: ${arg}` };
	}

	return { kind: "ok", options };
}

function parsePrRegenArgs(args: readonly string[]): ParseResult<ParsedPrRegenArgs> {
	const options: ParsedPrRegenArgs = { shouldForce: false };
	for (const arg of args) {
		if (arg === "--help" || arg === "-h") {
			return { kind: "help" };
		}
		if (arg === "--force") {
			options.shouldForce = true;
			continue;
		}
		return { kind: "error", message: arg.startsWith("-") ? `Unknown option: ${arg}` : `Unexpected argument: ${arg}` };
	}
	return { kind: "ok", options };
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: asdl-dev bin asdl-dev -> ts/packages/asdl-dev/src/cli.ts\n";
}

function topLevelHelp(): string {
	const commandLines = listAsdlDevCommands().map((command) => `  ${command.name.padEnd(12)}  ${command.description}`).join("\n");
	return `Usage: asdl-dev [--runtime] <command> [options]

Developer tools for asdl-tools.

*-dev CLIs use a flat list of task commands; avoid nested command groups.

Commands:
${commandLines}

Options:
  -h, --help    Show this help message.
  --runtime     Show CLI runtime diagnostics and exit.
`;
}



function submitHelp(): string {
	return `Usage: asdl-dev submit [options]

Checkpoint outstanding worktree changes with \`asdl-dev cp\`, verify Graphite readiness with \`gt submit -nps --no-ai --dry-run\`, then submit the current Graphite stack with \`gt submit -nps --no-ai\`.

For newly-created PRs, \`asdl-dev submit\` prepares generated PR titles/descriptions locally before \`gt submit\` so Graphite can create PRs with correct initial metadata. Already-open PRs and any post-submit mismatches may still be updated after submit. Manually edited existing PR bodies are never overwritten; use \`asdl-dev pr-regen --force\` when you intend to replace one.

Automatic checkpointing uses the same model environment variables as \`asdl-dev cp\` when the worktree is dirty: ${TEXT_BACKEND_ENV} and ${CHECKPOINT_MODEL_ENV}.

PR description generation uses ${PR_DESCRIPTION_MODEL_ENV} (defaults to ${DEFAULT_PR_DESCRIPTION_MODEL_REF}) and resolves the system prompt from ${PR_DESCRIPTION_PROMPT_ENV}, then ${REPO_PR_DESCRIPTION_PROMPT_PATH}, then the built-in prompt.

If the dry-run says restack is required, interactive invocations ask before running \`gt restack --no-interactive\`; non-interactive invocations exit with guidance unless \`--restack\` is supplied.

Options:
  --restack   If restack is required, run \`gt restack --no-interactive\` without prompting before submitting.
  -h, --help  Show this help message.
`;
}

function prRegenHelp(): string {
	return `Usage: asdl-dev pr-regen [options]

Regenerate the current branch PR's title and description with the asdl PR-description prompt.

By default this refuses to overwrite a non-empty PR body unless it contains the asdl generated-body marker. Empty generated bodies and marker-bearing bodies are safe to overwrite; pass --force to overwrite a manually edited body.

Environment:
  ${TEXT_BACKEND_ENV}                 Text generation backend. Defaults to ${DEFAULT_TEXT_BACKEND}.
  ${PR_DESCRIPTION_MODEL_ENV}  Backend-native model reference. Defaults to ${DEFAULT_PR_DESCRIPTION_MODEL_REF}.
  ${PR_DESCRIPTION_PROMPT_ENV}  Prompt file path. Overrides ${REPO_PR_DESCRIPTION_PROMPT_PATH} and the built-in prompt.

Options:
  --force     Overwrite the PR body even when the asdl generated-body marker is absent.
  -h, --help  Show this help message.
`;
}

function createTerminalConfirmPrompt(): ConfirmPrompt | undefined {
	if (process.stdin.isTTY !== true || process.stderr.isTTY !== true) {
		return undefined;
	}

	return async (title: string, message: string): Promise<boolean> => {
		const readline = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
		try {
			const answer = await readline.question(`${title}\n\n${message}\n\nContinue? [y/N] `);
			return isYesAnswer(answer);
		} catch {
			return false;
		} finally {
			readline.close();
		}
	};
}

function isYesAnswer(answer: string): boolean {
	const normalized = answer.trim().toLowerCase();
	return normalized === "y" || normalized === "yes";
}

if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
	const confirm = createTerminalConfirmPrompt();
	process.exitCode = await runCli(process.argv.slice(2), confirm === undefined ? {} : { confirm });
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
