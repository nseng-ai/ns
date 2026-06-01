#!/usr/bin/env bun

import process from "node:process";

import { createRealAsdlDevContext, type AsdlDevContext } from "./context.ts";
import { lookupPreviewUrl, type PreviewUrlOptions } from "./preview-url.ts";
import { formatHumanFailure, formatJson } from "./output.ts";

export type CliDeps = {
	context?: AsdlDevContext | undefined;
	cwd?: string | undefined;
	stdout?: ((text: string) => void) | undefined;
	stderr?: ((text: string) => void) | undefined;
	env?: Record<string, string | undefined> | undefined;
};

export type AsdlDevCommandInfo = {
	name: string;
	description: string;
};

type ParsedPreviewUrlArgs = {
	jsonOutput: boolean;
	branch?: string;
	project?: string;
	scope?: string;
};

type ParseResult =
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

type CommandSpec = {
	name: string;
	description: string;
	help: () => string;
	run: (args: readonly string[], deps: RequiredCliDeps) => Promise<number>;
};

type RequiredCliDeps = {
	context: AsdlDevContext;
	cwd: string;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
	env: Record<string, string | undefined>;
};

const COMMANDS: CommandSpec[] = [
	{
		name: "preview-url",
		description: "Print the Vercel preview URL for a branch.",
		help: previewUrlHelp,
		run: runPreviewUrlCommand,
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

	const command = COMMANDS.find((candidate) => candidate.name === commandName);
	if (command === undefined) {
		stderr(`Unknown command: ${commandName}\n\n${topLevelHelp()}`);
		return 2;
	}

	return command.run(args.slice(1), {
		context: deps.context ?? createRealAsdlDevContext(),
		cwd: deps.cwd ?? process.cwd(),
		stdout,
		stderr,
		env: deps.env ?? process.env,
	});
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
	if (parsed.options.jsonOutput) {
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

function parsePreviewUrlArgs(args: readonly string[]): ParseResult {
	const options: ParsedPreviewUrlArgs = { jsonOutput: false };

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

		return { kind: "error", message: arg.startsWith("-") ? `Unknown option: ${arg}` : `Unexpected argument: ${arg}` };
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
	const commandLines = COMMANDS.map((command) => `  ${command.name.padEnd(12)}  ${command.description}`).join("\n");
	return `Usage: asdl-dev <command> [options]

Developer tools for asdl-tools.

*-dev CLIs use a flat list of task commands; avoid nested command groups.

Commands:
${commandLines}

Options:
  -h, --help    Show this help message.
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

if (import.meta.main) {
	process.exitCode = await runCli(process.argv.slice(2));
}
