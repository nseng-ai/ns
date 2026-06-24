import { join } from "node:path";

import cpFlowExtension from "../../../../../.sdl/extensions/flow/src/commands/cp.ts";
import submitFlowExtension from "../../../../../.sdl/extensions/flow/src/commands/submit.ts";
import {
	executeSdlCommand,
	validateSdlExtensionContribution,
	type SdlCommandPath,
} from "../../src/command-registry.ts";
import type { SdlCommand, SdlExtensionApi, SdlResult } from "../../src/sdk/index.ts";
import {
	ScriptedSdlTestContext,
	type RunWithFakesDefaults,
	type ScriptedExecResponse,
	type TestState,
} from "./sdl-cli-fakes.ts";

interface RunFlowCommandWithFakesOptions {
	request?: unknown;
	state?: TestState | undefined;
	cwd?: string | undefined;
	env?: Record<string, string | undefined> | undefined;
	homeDir?: string | undefined;
	defaults?: RunWithFakesDefaults | undefined;
}

interface FlowCommandFixture {
	command: SdlCommand;
	request: unknown;
	defaults: RunWithFakesDefaults;
	options: RunFlowCommandWithFakesOptions;
}

const cpCommand = loadFlowCommand(cpFlowExtension, { group: "flow", name: "cp" });
const submitCommand = loadFlowCommand(submitFlowExtension, { group: "flow", name: "submit" });

export function runFlowCpCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: cpCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: dirtyCpExecResponses,
			textGenerationResults: () => [{ ok: true, text: defaultCpMessage() }],
		},
	});
}

export function runFlowSubmitCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: submitCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	});
}

function runFlowCommandWithFakes(fixture: FlowCommandFixture) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const liveOutput: Array<{ stream: "stdout" | "stderr"; text: string }> = [];
	const cwd = fixture.options.cwd ?? "/work";
	const homeDir = fixture.options.homeDir ?? join(cwd, ".home");
	const context = new ScriptedSdlTestContext(fixture.options.state, {
		cwd,
		env: { HOME: homeDir, ...(fixture.options.env ?? {}) },
		execResponses: fixture.defaults.execResponses,
		textGenerationResults: fixture.defaults.textGenerationResults,
		missingTextGenerationResult: fixture.defaults.missingTextGenerationResult,
	});
	context.stdout = (text) => {
		stdout.push(text);
	};
	context.stderr = (text) => {
		stderr.push(text);
	};
	context.onOutput = (stream, text) => {
		liveOutput.push({ stream, text });
	};
	return {
		context,
		stdout,
		stderr,
		liveOutput,
		exit: runFlowCommand({
			context,
			command: fixture.command,
			request: fixture.request,
			stdout: context.stdout,
			stderr: context.stderr,
		}),
	};
}

async function runFlowCommand(input: {
	context: SdlExtensionApi;
	command: SdlCommand;
	request: unknown;
	stdout: (text: string) => void;
	stderr: (text: string) => void;
}): Promise<number> {
	const result = await executeSdlCommand(input.context, input.command, input.request);
	writeSdlResultOutput(result, input);
	return result.ok ? 0 : result.exitCode;
}

function writeSdlResultOutput(
	result: SdlResult,
	deps: { stdout: (text: string) => void; stderr: (text: string) => void },
): void {
	if (result.message === "") return;
	const output = `${result.message}\n`;
	if (result.ok) {
		deps.stdout(output);
		return;
	}
	deps.stderr(output);
}

function loadFlowCommand(contribution: unknown, path: SdlCommandPath): SdlCommand {
	const loaded = validateSdlExtensionContribution(contribution, path, `.sdl/extensions/flow/${path.name}`);
	if (!loaded.ok) {
		throw new Error(loaded.message);
	}
	return loaded.command;
}

function dirtyCpExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
		{ match: "git add -A", result: {} },
		{ match: /^git commit -F /, result: {} },
		{ match: "git log -1 --oneline", result: { stdout: "abc123 [cp] Update checkpoint\n" } },
	];
}

function defaultCpMessage(): string {
	return `[cp] Update checkpoint tests

- Add CLI coverage`;
}
