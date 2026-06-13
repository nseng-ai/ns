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

export function createRealSdlCommandContext(options: RealSdlCommandContextOptions = {}): SdlContext {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const model = createTextGenerationGateway();
	return {
		cwd,
		env,
		model,
		exec: async (command, execOptions = {}) => {
			const result = await runCommand("bash", ["-lc", command], {
				cwd,
				env,
				...(execOptions.input === undefined ? {} : { input: execOptions.input }),
				...(execOptions.timeoutMs === undefined ? {} : { timeout: execOptions.timeoutMs }),
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

export function createRealSdlContext(options: RealSdlCommandContextOptions = {}): SdlContext {
	return createRealSdlCommandContext(options);
}

export type { SdlContext } from "./sdk.ts";
