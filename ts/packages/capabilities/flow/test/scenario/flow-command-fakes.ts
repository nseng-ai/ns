import { join } from "node:path";

import { flowChangesCommand } from "../../src/commands/changes.ts";
import { flowCpCommand } from "../../src/commands/cp.ts";
import { flowRegeneratePrCommand } from "../../src/commands/regenerate-pr.ts";
import { flowSubmitCommand } from "../../src/commands/submit.ts";
import type { SdlCommand, SdlExtensionApi, SdlResult } from "sdl-sdk";
import { failed } from "sdl-sdk";

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

export function runFlowCpCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowCpCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: dirtyCpExecResponses,
			textGenerationResults: () => [{ ok: true, text: defaultCpMessage() }],
		},
	});
}

export function runFlowChangesCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowChangesCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: dirtyChangesExecResponses,
			textGenerationResults: () => [
				{ ok: true, text: "- Update app behavior\n- Add notes for reviewers" },
			],
		},
	});
}

export function runFlowRegeneratePrCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowRegeneratePrCommand,
		request: options.request ?? {},
		options,
		defaults: options.defaults ?? {
			execResponses: () => [],
			textGenerationResults: () => [],
		},
	});
}

export function runFlowSubmitCommandWithFakes(options: RunFlowCommandWithFakesOptions = {}) {
	return runFlowCommandWithFakes({
		command: flowSubmitCommand,
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
	const parsedRequest = input.command.schema?.safeParse(input.request) ?? {
		success: true,
		data: {},
	};
	if (!parsedRequest.success) {
		const issue = parsedRequest.error.issues[0]?.message ?? "request did not match command schema";
		const result = failed(`Invalid request for command ${input.command.name}: ${issue}`, 2);
		writeSdlResultOutput(result, input);
		return 2;
	}
	const result = await input.command.run(input.context, parsedRequest.data);
	if (!isSdlResult(result)) {
		throw new Error(`Flow test command ${input.command.name} returned a rendered result.`);
	}
	writeSdlResultOutput(result, input);
	return result.ok ? 0 : result.exitCode;
}

function isSdlResult(result: unknown): result is SdlResult {
	return typeof result === "object" && result !== null && "ok" in result;
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

function dirtyChangesExecResponses(): ScriptedExecResponse[] {
	return [
		{ match: "git rev-parse --show-toplevel", result: { stdout: "/work\n" } },
		{ match: "git symbolic-ref --short HEAD", result: { stdout: "feature/demo\n" } },
		{ match: "git status --porcelain=v1", result: { stdout: " M src/app.ts\n?? notes.md\n" } },
		{
			match: "git diff HEAD --no-ext-diff",
			result: { stdout: "diff --git a/src/app.ts b/src/app.ts\n" },
		},
	];
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
