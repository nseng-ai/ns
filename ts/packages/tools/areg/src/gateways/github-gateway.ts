import {
	formatCommand,
	formatCommandResultFailure,
	runCommand,
	stripTerminalEscapes,
	type CommandRunner,
} from "@nseng-ai/foundation/exec";

import type {
	AregGithubGateway,
	AregGithubSkillFileResult,
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
		const resource = githubContentsResource(options.repo, "skills", options.ref);
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
		return classifyGithubFailure({
			result,
			args,
			displayCommand,
			missingMessage: `No skills directory found in ${options.repo}`,
			authMessage: `Authentication error accessing ${options.repo}`,
		});
	}

	async checkSkillFile(options: {
		repo: string;
		path: string;
		ref?: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregGithubSkillFileResult> {
		const resource = githubContentsResource(options.repo, options.path, options.ref);
		const args = ["api", resource, "--jq", ".type"];
		const displayCommand = formatCommand("gh", args);
		const result = await this.runner("gh", args, { env: options.env, timeout: COMMAND_TIMEOUT_MS });
		if (result.code === 0) return { type: "found" };
		return classifyGithubFailure({
			result,
			args,
			displayCommand,
			missingMessage: `Skill file not found in ${options.repo}: ${options.path}`,
			authMessage: `Authentication error accessing ${options.repo}`,
		});
	}
}

interface GithubFailureInput {
	result: Awaited<ReturnType<CommandRunner>>;
	args: readonly string[];
	displayCommand: string;
	missingMessage: string;
	authMessage: string;
}

function githubContentsResource(repo: string, path: string, ref: string | undefined): string {
	const normalizedPath = path
		.split("/")
		.filter((part) => part.length > 0)
		.map(encodeURIComponent)
		.join("/");
	const resource = `repos/${repo}/contents/${normalizedPath}`;
	if (ref === undefined) return resource;
	return `${resource}?ref=${encodeURIComponent(ref)}`;
}

function classifyGithubFailure(
	input: GithubFailureInput,
):
	| { type: "missing"; message: string }
	| { type: "auth-error"; message: string }
	| { type: "error"; error: ReturnType<typeof errorInfo> } {
	const combined = stripTerminalEscapes(
		`${input.result.stdout}\n${input.result.stderr}`,
	).toLowerCase();
	if (combined.includes("404")) return { type: "missing", message: input.missingMessage };
	if (combined.includes("401") || combined.includes("403"))
		return { type: "auth-error", message: input.authMessage };
	return {
		type: "error",
		error: errorInfo(
			input.result.startupError === undefined ? "gh-failed" : "gh-startup-failed",
			formatCommandResultFailure("gh api failed", "gh", input.args, input.result),
			input.displayCommand,
		),
	};
}
