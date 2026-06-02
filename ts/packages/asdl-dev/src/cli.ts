#!/usr/bin/env bun

import process from "node:process";

import {
	defaultCommandResolver,
	runCommand,
	type CommandResolver,
	type CommandRunner,
} from "./command-runner.ts";
import { latestBranchDeployment, type LatestBranchDeploymentOptions } from "./deployment-lookup.ts";
import { formatHumanFailure, formatHumanSuccess, formatJson } from "./output.ts";

export type CliDeps = {
	runner?: CommandRunner | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	env?: Record<string, string | undefined> | undefined;
	resolveCommand?: CommandResolver | undefined;
};

type ParsedLatestArgs = {
	jsonOutput: boolean;
	branch?: string;
	project?: string;
	scope?: string;
};

type ParseResult =
	| {
			kind: "ok";
			options: ParsedLatestArgs;
	  }
	| {
			kind: "help";
	  }
	| {
			kind: "error";
			message: string;
	  };

const LATEST_BRANCH_DEPLOYMENT_COMMAND = "latest-branch-deployment";

export async function runCli(args: readonly string[], deps: CliDeps = {}): Promise<number> {
	const stdout = deps.stdout ?? ((text: string) => {
		process.stdout.write(text);
	});
	const stderr = deps.stderr ?? ((text: string) => {
		process.stderr.write(text);
	});

	const command = args[0];
	if (command === undefined || command === "--help" || command === "-h") {
		stdout(topLevelHelp());
		return 0;
	}

	if (command !== LATEST_BRANCH_DEPLOYMENT_COMMAND) {
		stderr(`Unknown command: ${command}\n\n${topLevelHelp()}`);
		return 2;
	}

	const parsed = parseLatestBranchDeploymentArgs(args.slice(1));
	if (parsed.kind === "help") {
		stdout(latestBranchDeploymentHelp());
		return 0;
	}
	if (parsed.kind === "error") {
		stderr(`Error: ${parsed.message}\n\n${latestBranchDeploymentHelp()}`);
		return 2;
	}

	const lookupOptions: LatestBranchDeploymentOptions = {
		cwd: deps.cwd ?? process.cwd(),
		env: deps.env ?? process.env,
		runner: deps.runner ?? runCommand,
		resolveCommand: deps.resolveCommand ?? defaultCommandResolver,
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

	const result = await latestBranchDeployment(lookupOptions);
	if (parsed.options.jsonOutput) {
		stdout(formatJson(result.payload));
		return result.exitCode;
	}

	if (result.payload.success) {
		stdout(formatHumanSuccess(result.payload));
	} else {
		stderr(formatHumanFailure(result.payload));
	}
	return result.exitCode;
}

function parseLatestBranchDeploymentArgs(args: readonly string[]): ParseResult {
	const options: ParsedLatestArgs = { jsonOutput: false };

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === undefined) continue;

		if (arg === "--help" || arg === "-h") {
			return { kind: "help" };
		}
		if (arg === "--json") {
			options.jsonOutput = true;
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

		return { kind: "error", message: `Unknown option: ${arg}` };
	}

	return { kind: "ok", options };
}

function inlineOptionValue(arg: string, optionName: string): string | undefined {
	const prefix = `${optionName}=`;
	if (!arg.startsWith(prefix)) {
		return undefined;
	}
	return arg.slice(prefix.length);
}

function topLevelHelp(): string {
	return `Usage: asdl-dev <command> [options]

Developer tools for asdl-tools.

Commands:
  latest-branch-deployment  Report the latest Vercel preview deployment for a branch.

Options:
  -h, --help                Show this help message.
`;
}

function latestBranchDeploymentHelp(): string {
	return `Usage: asdl-dev latest-branch-deployment [options]

Report the latest Ready Vercel preview deployment for the current branch.

Options:
  --branch TEXT   Branch to look up. Defaults to git branch --show-current.
  --project TEXT  Vercel project. Defaults to VERCEL_PROJECT, .vercel/project.json, then asdl-tools.
  --scope TEXT    Vercel scope/team. Defaults to VERCEL_SCOPE, then schrockns-projects.
  --json          Emit machine-readable JSON on stdout.
  -h, --help      Show this help message.
`;
}

if (import.meta.main) {
	process.exitCode = await runCli(process.argv.slice(2));
}
