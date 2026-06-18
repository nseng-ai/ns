import process from "node:process";

import { runCommand } from "@asdl/core/exec";

import { PiTextGenerationGateway } from "./pi-text-generation.ts";
import type { SdlContext } from "./sdk.ts";
import type { TextGenerationGateway } from "./text-generation.ts";

export interface RealSdlCommandContextOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
}

export function createTextGenerationGateway(): TextGenerationGateway {
	return new PiTextGenerationGateway();
}

export function createRealSdlCommandContext(
	options: RealSdlCommandContextOptions = {},
): SdlContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const model = createTextGenerationGateway();
	return {
		cwd,
		env,
		model,
		exec: async (command, args, execOptions = {}) => {
			const result = await runCommand(command, args, {
				cwd,
				env,
				...(execOptions.timeoutMs === undefined ? {} : { timeout: execOptions.timeoutMs }),
				...(execOptions.stdin === undefined ? {} : { stdin: execOptions.stdin }),
				...(execOptions.onStdout === undefined ? {} : { onStdout: execOptions.onStdout }),
				...(execOptions.onStderr === undefined ? {} : { onStderr: execOptions.onStderr }),
			});
			return {
				code: result.code,
				stdout: result.stdout,
				stderr: result.stderr,
				killed: result.killed,
			};
		},
	};
}

export type { SdlContext } from "./sdk.ts";
