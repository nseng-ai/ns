import {
	formatCommand,
	formatCommandResultFailure,
	runCommand,
	stripTerminalEscapes,
	type CommandRunner,
} from "@sdl/core/exec";

import type { AregGithubGateway, AregGithubSkillListResult } from "../gateways.ts";
import { COMMAND_TIMEOUT_MS } from "./command-constants.ts";
import { errorInfo } from "./errors.ts";

export class RealAregGithubGateway implements AregGithubGateway {
	private readonly runner: CommandRunner;

	constructor(options: { runner?: CommandRunner } = {}) {
		this.runner = options.runner ?? runCommand;
	}

	async listSkillDirectoryNames(options: {
		repo: string;
		ref?: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregGithubSkillListResult> {
		const resource =
			options.ref === undefined
				? `repos/${options.repo}/contents/skills`
				: `repos/${options.repo}/contents/skills?ref=${encodeURIComponent(options.ref)}`;
		const args = ["api", resource, "--jq", ".[].name"];
		const displayCommand = formatCommand("gh", args);
		const result = await this.runner("gh", args, { env: options.env, timeout: COMMAND_TIMEOUT_MS });
		if (result.code === 0) {
			return {
				type: "ok",
				skillNames: result.stdout
					.split("\n")
					.map((line) => line.trim())
					.filter((line) => line.length > 0),
			};
		}
		const combined = stripTerminalEscapes(`${result.stdout}\n${result.stderr}`).toLowerCase();
		if (combined.includes("404"))
			return { type: "missing", message: `No skills directory found in ${options.repo}` };
		if (combined.includes("401") || combined.includes("403"))
			return { type: "auth-error", message: `Authentication error accessing ${options.repo}` };
		return {
			type: "error",
			error: errorInfo(
				result.startupError === undefined ? "gh-failed" : "gh-startup-failed",
				formatCommandResultFailure("gh api failed", "gh", args, result),
				displayCommand,
			),
		};
	}
}
