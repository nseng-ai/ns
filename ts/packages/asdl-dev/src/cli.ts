#!/usr/bin/env node

import process from "node:process";
import { createInterface } from "node:readline/promises";

import { z } from "zod";

import { ClinkrGroup, resolveIo } from "@asdl/clinkr";
import { rawCommand } from "@asdl/clinkr/raw";
import { isDirectCliInvocation } from "@asdl/core/cli-entry";

import { createRealAsdlDevContext, type AsdlDevContext } from "./context.ts";
import { DEFAULT_PR_DESCRIPTION_MODEL_REF, PR_DESCRIPTION_MODEL_ENV } from "./text-generation.ts";
import { PR_DESCRIPTION_PROMPT_ENV, REPO_PR_DESCRIPTION_PROMPT_PATH } from "@asdl/core/submit";
import { formatHumanFailure, formatJson, writeCommandResultOutput } from "./output.ts";
import { lookupPreviewUrl, type PreviewUrlOptions } from "./preview-url.ts";
import { runPrRegenCommand } from "./pr-regen.ts";

export type ConfirmPrompt = (title: string, message: string) => Promise<boolean> | boolean;
export type CliOutputListener = (stream: "stdout" | "stderr", text: string) => void;

export interface CliDeps {
	context?: AsdlDevContext | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	env?: Record<string, string | undefined> | undefined;
	onOutput?: CliOutputListener | undefined;
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
	onOutput?: CliOutputListener;
	confirm?: ConfirmPrompt;
}

const COMMAND_SUMMARIES = {
	"preview-url": "Print the Vercel preview URL for a branch.",
	"pr-regen": "Regenerate the current branch PR's title and description with the asdl PR-description prompt.",
} as const;

export function buildCli(): ClinkrGroup<AsdlDevCliContext> {
	const group = new ClinkrGroup<AsdlDevCliContext>({
		name: "asdl-dev",
		description: "Developer tools for asdl-tools.",
		runtimeInfo: () => "runtime: typescript\nentry_point: asdl-dev bin asdl-dev -> ts/packages/asdl-dev/src/cli.ts\n",
	});

	group.command(
		rawCommand({
			name: "preview-url",
			description: "Print the Vercel preview URL for the selected branch.",
			summary: COMMAND_SUMMARIES["preview-url"],
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
				if (request.branch !== undefined) {
					lookupOptions.branch = request.branch;
				}
				if (request.project !== undefined) {
					lookupOptions.project = request.project;
				}
				if (request.scope !== undefined) {
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
			name: "pr-regen",
			description: `Regenerate the current branch PR's title and description with the asdl PR-description prompt.

By default this regenerates both the PR title and body, replacing any existing body. The --force flag is accepted for compatibility with older guarded pr-regen workflows.

Environment:
  ${PR_DESCRIPTION_MODEL_ENV}  Model reference for the generated PR description. Defaults to ${DEFAULT_PR_DESCRIPTION_MODEL_REF}.
  ${PR_DESCRIPTION_PROMPT_ENV}  Prompt file path. Overrides ${REPO_PR_DESCRIPTION_PROMPT_PATH} and the built-in prompt.`,
			summary: COMMAND_SUMMARIES["pr-regen"],
			schema: z.object({
				force: z.boolean().default(false).describe("Compatibility flag from older guarded pr-regen workflows; pr-regen now always replaces the PR body."),
			}),
			run: async (ctx, request) => {
				const result = await runPrRegenCommand({
					cwd: ctx.cwd,
					env: ctx.env,
					githubPr: ctx.context.githubPr,
					textGeneration: ctx.context.textGeneration,
					git: ctx.context.git,
					shouldForce: request.force,
				});
				writeCommandResultOutput(result, ctx);
				return result.exitCode;
			},
		}),
	);

	return group;
}

export function listAsdlDevCommands(): AsdlDevCommandInfo[] {
	return Object.entries(COMMAND_SUMMARIES).map(([name, description]) => ({ name, description }));
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

	const contextWithIO: AsdlDevCliContext = { context, cwd, env, stdout, stderr };
	if (deps.onOutput !== undefined) {
		contextWithIO.onOutput = deps.onOutput;
	}
	if (deps.confirm !== undefined) {
		contextWithIO.confirm = deps.confirm;
	}

	const io = resolveIo({ stdout, stderr });
	return buildCli().run(args, { context: contextWithIO, io });
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
