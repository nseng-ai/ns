import {
	formatCommand,
	formatCommandResultFailure,
	runCommand,
	type CommandRunner,
} from "@nseng-ai/core/exec";

import type {
	AregNpxSkillsAddRequest,
	AregNpxSkillsAddResult,
	AregNpxSkillsGateway,
} from "../gateways.ts";
import { COMMAND_TIMEOUT_MS } from "./command-constants.ts";
import { errorInfo } from "./errors.ts";

export class RealAregNpxSkillsGateway implements AregNpxSkillsGateway {
	private readonly runner: CommandRunner;

	constructor(options: { runner?: CommandRunner } = {}) {
		this.runner = options.runner ?? runCommand;
	}

	async addSkills(request: AregNpxSkillsAddRequest): Promise<AregNpxSkillsAddResult> {
		const args = buildNpxSkillsAddArgs(request);
		const displayCommand = formatCommand("npx", args);
		const result = await this.runner("npx", args, {
			cwd: request.cwd,
			env: request.env,
			timeout: COMMAND_TIMEOUT_MS,
		});
		if (result.code === 0) return { type: "ok" };
		return {
			type: "error",
			error: errorInfo(
				result.startupError === undefined ? "npx-failed" : "npx-startup-failed",
				formatCommandResultFailure("npx skills add failed", "npx", args, result),
				displayCommand,
			),
		};
	}
}

export function buildNpxSkillsAddArgs(request: AregNpxSkillsAddRequest): string[] {
	const args = ["skills", "add", request.sourceRepo];
	for (const skillName of request.skillNames) {
		args.push("--skill", skillName);
	}
	for (const agent of request.targetAgents) {
		args.push("--agent", agent);
	}
	args.push("-y");
	return args;
}
