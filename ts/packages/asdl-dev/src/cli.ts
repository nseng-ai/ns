#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

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

interface ParsedPreviewUrlArgs {
	shouldOutputJson: boolean;
	branch?: string;
	project?: string;
	scope?: string;
}

type PreviewUrlParseResult =
	| {
			kind: "ok";
			options: ParsedPreviewUrlArgs;
	  }
	| {
			kind: "help";
	  }
	| {
			kind: "error";
			message: string;
	  };

type CheckpointParseResult =
	| {
			kind: "ok";
	  }
	| {
			kind: "help";
	  }
	| {
			kind: "error";
			message: string;
	  };

interface ParsedSubmitArgs {
	restack: boolean;
}

interface ParsedPrRegenArgs {
	shouldForce: boolean;
}

type SubmitParseResult =
	| {
			kind: "ok";
			options: ParsedSubmitArgs;
	  }
	| {
			kind: "help";
	  }
	| {
			kind: "error";
			message: string;
	  };

type PrRegenParseResult =
	| {
			kind: "ok";
			options: ParsedPrRegenArgs;
	  }
	| {
			kind: "help";
	  }
	| {
			kind: "error";
			message: string;
	  };

interface CommandSpec {
	name: string;
	description: string;
	help: () => string;
	run: (args: readonly string[], deps: RequiredCliDeps) => Promise<number>;
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

const COMMANDS: CommandSpec[] = [
	{
		name: "preview-url",
		description: "Print the Vercel preview URL for a branch.",
		help: previewUrlHelp,
		run: runPreviewUrlCommand,
	},
	{
		name: "cp",
		description: "Create a checkpoint commit for the current diff.",
		help: checkpointHelp,
		run: runCheckpointCliCommand,
	},
	{
		name: "submit",
		description: "Checkpoint outstanding changes, then submit the current Graphite stack with gt submit -nps --no-ai.",
		help: submitHelp,
		run: runSubmitCliCommand,
	},
	{
		name: "pr-regen",
		description: "Regenerate the current branch PR's title and description with the asdl PR-description prompt.",
		help: prRegenHelp,
		run: runPrRegenCliCommand,
	},
];

export function listAsdlDevCommands(): AsdlDevCommandInfo[] {
	return COMMANDS.map(({ name, description }) => ({ name, description }));
}

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => {
		process.stdout.write(text);
	});
	const stderr = deps.stderr ?? ((text: string) => {
		process.stderr.write(text);
	});

	const commandName = args[0];
	if (commandName === undefined || commandName === "--help" || commandName === "-h") {
		stdout(topLevelHelp());
		return 0;
	}
	if (commandName === "--runtime") {
		stdout(runtimeInfo());
		return 0;
	}

	const command = COMMANDS.find((candidate) => candidate.name === commandName);
	if (command === undefined) {
		stderr(`Unknown command: ${commandName}\n\n${topLevelHelp()}`);
		return 2;
	}

	const commandDeps: RequiredCliDeps = {
		context: deps.context ?? createRealAsdlDevContext(),
		cwd: deps.cwd ?? process.cwd(),
		stdout,
		stderr,
		env: deps.env ?? process.env,
	};
	if (deps.onOutput !== undefined) {
		commandDeps.onOutput = deps.onOutput;
	}
	if (deps.confirm !== undefined) {
		commandDeps.confirm = deps.confirm;
	}
	return command.run(args.slice(1), commandDeps);
}

async function runCheckpointCliCommand(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parseCheckpointArgs(args);
	if (parsed.kind === "help") {
		deps.stdout(checkpointHelp());
		return 0;
	}
	if (parsed.kind === "error") {
		deps.stderr(`Error: ${parsed.message}\n\n${checkpointHelp()}`);
		return 2;
	}

	const result = await runCheckpointCommand({
		cwd: deps.cwd,
		env: deps.env,
		gateway: deps.context.checkpoint,
		textGeneration: deps.context.textGeneration,
	});
	if (result.stdout !== "") {
		deps.stdout(result.stdout);
	}
	if (result.stderr !== "") {
		deps.stderr(result.stderr);
	}
	return result.exitCode;
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

async function runPreviewUrlCommand(args: readonly string[], deps: RequiredCliDeps): Promise<number> {
	const parsed = parsePreviewUrlArgs(args);
	if (parsed.kind === "help") {
		deps.stdout(previewUrlHelp());
		return 0;
	}
	if (parsed.kind === "error") {
		deps.stderr(`Error: ${parsed.message}\n\n${previewUrlHelp()}`);
		return 2;
	}

	const lookupOptions: PreviewUrlOptions = {
		cwd: deps.cwd,
		env: deps.env,
	};
	if (parsed.options.branch !== undefined) {
		lookupOptions.branch = parsed.options.branch;
	}
	if (parsed.options.project !== undefined) {
		lookupOptions.project = parsed.options.project;
	}
	if (parsed.options.scope !== undefined) {
		lookupOptions.scope = parsed.options.scope;
	}

	const result = await lookupPreviewUrl(lookupOptions, deps.context);
	if (parsed.options.shouldOutputJson) {
		deps.stdout(formatJson(result.payload));
		return result.exitCode;
	}

	if (result.payload.success) {
		deps.stdout(`${result.payload.preview_url}\n`);
	} else {
		deps.stderr(formatHumanFailure(result.payload));
	}
	return result.exitCode;
}

function parsePreviewUrlArgs(args: readonly string[]): PreviewUrlParseResult {
	const options: ParsedPreviewUrlArgs = { shouldOutputJson: false };

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) continue;

		if (arg === "--help" || arg === "-h") {
			return { kind: "help" };
		}
		if (arg === "--json") {
			options.shouldOutputJson = true;
			continue;
		}

		const branchValue = inlineOptionValue(arg, "--branch");
		if (branchValue !== undefined) {
			options.branch = branchValue;
			continue;
		}
		if (arg === "--branch") {
			const value = args[index + 1];
			if (value === undefined) return { kind: "error", message: "--branch requires a value." };
			options.branch = value;
			index += 1;
			continue;
		}

		const projectValue = inlineOptionValue(arg, "--project");
		if (projectValue !== undefined) {
			options.project = projectValue;
			continue;
		}
		if (arg === "--project") {
			const value = args[index + 1];
			if (value === undefined) return { kind: "error", message: "--project requires a value." };
			options.project = value;
			index += 1;
			continue;
		}

		const scopeValue = inlineOptionValue(arg, "--scope");
		if (scopeValue !== undefined) {
			options.scope = scopeValue;
			continue;
		}
		if (arg === "--scope") {
			const value = args[index + 1];
			if (value === undefined) return { kind: "error", message: "--scope requires a value." };
			options.scope = value;
			index += 1;
			continue;
		}

		return { kind: "error", message: arg.startsWith("-") ? `Unknown option: ${arg}` : `Unexpected argument: ${arg}` };
	}

	return { kind: "ok", options };
}

function parseSubmitArgs(args: readonly string[]): SubmitParseResult {
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

function parsePrRegenArgs(args: readonly string[]): PrRegenParseResult {
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

function parseCheckpointArgs(args: readonly string[]): CheckpointParseResult {
	for (const arg of args) {
		if (arg === "--help" || arg === "-h") {
			return { kind: "help" };
		}
		return { kind: "error", message: arg.startsWith("-") ? `Unknown option: ${arg}` : `Unexpected argument: ${arg}` };
	}

	return { kind: "ok" };
}

function inlineOptionValue(arg: string, optionName: string): string | undefined {
	const prefix = `${optionName}=`;
	if (!arg.startsWith(prefix)) {
		return undefined;
	}
	return arg.slice(prefix.length);
}

function runtimeInfo(): string {
	return "runtime: typescript\nentry_point: asdl-dev bin asdl-dev -> ts/packages/asdl-dev/src/cli.ts\n";
}

function topLevelHelp(): string {
	const commandLines = COMMANDS.map((command) => `  ${command.name.padEnd(12)}  ${command.description}`).join("\n");
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

function previewUrlHelp(): string {
	return `Usage: asdl-dev preview-url [options]

Print the Vercel preview URL for the selected branch.

Options:
  --branch TEXT   Branch to look up. Defaults to the current git branch.
  --project TEXT  Vercel project. Defaults to VERCEL_PROJECT, .vercel/project.json, then asdl-tools.
  --scope TEXT    Vercel scope/team. Defaults to VERCEL_SCOPE, then schrockns-projects.
  --json          Emit machine-readable JSON on stdout, including failures.
  -h, --help      Show this help message.
`;
}

function checkpointHelp(): string {
	return `Usage: asdl-dev cp

Create a checkpoint commit for the current git diff using a model-authored message.

Environment:
  ${TEXT_BACKEND_ENV}      Text generation backend. Defaults to ${DEFAULT_TEXT_BACKEND}.
  ${CHECKPOINT_MODEL_ENV}  Backend-native model reference. Defaults to ${DEFAULT_CHECKPOINT_MODEL_REF}.

Options:
  -h, --help  Show this help message.
`;
}

function submitHelp(): string {
	return `Usage: asdl-dev submit [options]

Checkpoint outstanding worktree changes with \`asdl-dev cp\`, submit the current Graphite stack with \`gt submit -nps --no-ai\`, then generate PR titles/descriptions for submitted PRs whose bodies are empty or carry the asdl generated-body marker. Manually edited bodies are never overwritten; use \`asdl-dev pr-regen --force\` when you intend to replace one.

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
