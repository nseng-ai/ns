import {
	formatCommand,
	formatCommandResultFailure,
	runCommand,
	stripTerminalEscapes,
	type CommandRunner,
} from "@ji/core/exec";

import type {
	AregGithubGateway,
	AregGithubSkillAvailabilityResult,
	AregGithubSkillListResult,
} from "../gateways.ts";
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
		return classifyGhApiFailure({
			args,
			displayCommand,
			result,
			missingMessage: `No skills directory found in ${options.repo}`,
			authMessage: `Authentication error accessing ${options.repo}`,
		});
	}

	async checkSkillPath(options: {
		repo: string;
		skillName: string;
		skillPath?: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregGithubSkillAvailabilityResult> {
		const skillPath = options.skillPath ?? `skills/${options.skillName}/SKILL.md`;
		const resource = `repos/${options.repo}/contents/${encodeGithubPath(skillPath)}`;
		const args = ["api", resource];
		const displayCommand = formatCommand("gh", args);
		const result = await this.runner("gh", args, { env: options.env, timeout: COMMAND_TIMEOUT_MS });
		if (result.code === 0) return { type: "available" };
		return classifyGhApiFailure({
			args,
			displayCommand,
			result,
			missingMessage: `Skill source path not found in ${options.repo}: ${skillPath}`,
			authMessage: `Authentication error accessing ${options.repo}`,
		});
	}
}

function encodeGithubPath(path: string): string {
	return path
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

function classifyGhApiFailure(options: {
	args: readonly string[];
	displayCommand: string;
	result: Awaited<ReturnType<CommandRunner>>;
	missingMessage: string;
	authMessage: string;
}): Exclude<
	AregGithubSkillListResult | AregGithubSkillAvailabilityResult,
	{ type: "ok" | "available" }
> {
	const combined = stripTerminalEscapes(
		`${options.result.stdout}\n${options.result.stderr}`,
	).toLowerCase();
	if (combined.includes("404")) return { type: "missing", message: options.missingMessage };
	if (combined.includes("401") || combined.includes("403"))
		return { type: "auth-error", message: options.authMessage };
	return {
		type: "error",
		error: errorInfo(
			options.result.startupError === undefined ? "gh-failed" : "gh-startup-failed",
			formatCommandResultFailure("gh api failed", "gh", [...options.args], options.result),
			options.displayCommand,
		),
	};
}
