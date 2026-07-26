import type { FlowBranchPublicationClient } from "@nseng-ai/flow/api";
import {
	commandFailureReason,
	formatCommand,
	type CommandExecApi,
	type ExecResult,
} from "@nseng-ai/foundation/exec";

import type { PublicationCommitFacts } from "./contracts.ts";
import type {
	ObjectiveRunnerPublicationFactsGateway,
	PublicationFactsError,
	PublicationFactsResult,
	PublicationTargetFactsResult,
} from "./facts-gateway.ts";

const READ_TIMEOUT_MS = 60_000;

export interface CreateRealObjectiveRunnerPublicationFactsGatewayOptions {
	cwd: string;
	trunkBranch: string;
	commands: CommandExecApi;
	flow: FlowBranchPublicationClient;
}

/** Real read-only publication facts over the command's one exec channel and cwd. */
export function createRealObjectiveRunnerPublicationFactsGateway(
	options: CreateRealObjectiveRunnerPublicationFactsGatewayOptions,
): ObjectiveRunnerPublicationFactsGateway {
	return new RealObjectiveRunnerPublicationFactsGateway(options);
}

class RealObjectiveRunnerPublicationFactsGateway implements ObjectiveRunnerPublicationFactsGateway {
	private readonly options: CreateRealObjectiveRunnerPublicationFactsGatewayOptions;

	constructor(options: CreateRealObjectiveRunnerPublicationFactsGatewayOptions) {
		this.options = options;
	}

	async readPublicationTarget(): Promise<PublicationTargetFactsResult> {
		const repository = await this.readRepositoryIdentity();
		if (!repository.ok) return { type: "error", error: repository.error };
		const resolved = await this.options.flow.resolveCurrentBranchTarget({
			trunkBranch: this.options.trunkBranch,
		});
		if (resolved.type === "refused") return { type: "error", error: resolved.error };
		const clean = await this.runGit(["status", "--porcelain=v1", "-z"]);
		if (!clean.ok) return { type: "error", error: clean.error };
		return {
			type: "found",
			value: {
				repository: repository.value,
				branch: resolved.target.branch,
				isTrunk: resolved.target.branch === this.options.trunkBranch,
				localHead: resolved.localHeadOid,
				isWorktreeClean: clean.value.stdout.length === 0,
				pullRequest: {
					number: resolved.target.pullRequest.number,
					url: resolved.target.pullRequest.url,
					headBranch: resolved.target.pullRequest.headRefName,
					headSha: resolved.target.pullRequest.headOid,
				},
			},
		};
	}

	async readPublicationCommits(input: {
		lastPublishedHead: string;
		intendedPublishedHead: string;
	}): Promise<PublicationFactsResult<PublicationCommitFacts>> {
		const ancestry = await this.runGit(
			["merge-base", "--is-ancestor", input.lastPublishedHead, input.intendedPublishedHead],
			{ isExitOneAllowed: true },
		);
		if (!ancestry.ok) return ancestry;
		const isAncestor = ancestry.value.code === 0;
		if (!isAncestor) {
			return {
				ok: true,
				value: {
					lastPublishedHead: input.lastPublishedHead,
					intendedPublishedHead: input.intendedPublishedHead,
					isLastPublishedHeadAncestor: false,
					commits: [],
				},
			};
		}
		const range = await this.runGit([
			"rev-list",
			"--reverse",
			`${input.lastPublishedHead}..${input.intendedPublishedHead}`,
		]);
		if (!range.ok) return range;
		const shas = range.value.stdout
			.split("\n")
			.map((value) => value.trim())
			.filter(Boolean);
		const commits: PublicationCommitFacts["commits"] = [];
		for (const sha of shas) {
			const trailers = await this.runGit([
				"show",
				"-s",
				"--format=%(trailers:key=Objective-Runner-Step,valueonly)",
				sha,
			]);
			if (!trailers.ok) return trailers;
			commits.push({
				sha,
				objectiveRunnerStepTrailers: trailers.value.stdout
					.split("\n")
					.map((value) => value.trim())
					.filter(Boolean),
			});
		}
		return {
			ok: true,
			value: {
				lastPublishedHead: input.lastPublishedHead,
				intendedPublishedHead: input.intendedPublishedHead,
				isLastPublishedHeadAncestor: true,
				commits,
			},
		};
	}

	private async readRepositoryIdentity(): Promise<PublicationFactsResult<string>> {
		const result = await this.runGit(["remote", "get-url", "origin"]);
		if (!result.ok) return result;
		const identity = repositoryIdentityFromOrigin(result.value.stdout.trim());
		if (identity === undefined) {
			return failure(
				"publication-repository-identity-invalid",
				"Origin URL does not identify a GitHub owner/repository.",
			);
		}
		return { ok: true, value: identity };
	}

	private async runGit(
		args: string[],
		options: { readonly isExitOneAllowed?: boolean } = {},
	): Promise<PublicationFactsResult<Extract<ExecResult, { type: "exited" }>>> {
		const isExitOneAllowed = options.isExitOneAllowed ?? false;
		const result = await this.options.commands.exec("git", args, {
			cwd: this.options.cwd,
			timeout: READ_TIMEOUT_MS,
		});
		if (
			result.type === "exited" &&
			(result.code === 0 || (isExitOneAllowed && result.code === 1))
		) {
			return { ok: true, value: result };
		}
		return failure(
			"publication-git-facts-failed",
			`Could not read publication Git facts: ${commandFailureReason(result)}`,
			formatCommand("git", args),
		);
	}
}

export function repositoryIdentityFromOrigin(origin: string): string | undefined {
	const withoutSuffix = origin.replace(/\.git$/u, "");
	const match = /^(?:(?:https?:\/\/|ssh:\/\/git@|git@)github\.com[/:])([^/\s]+\/[^/\s]+)$/u.exec(
		withoutSuffix,
	);
	return match?.[1];
}

function failure<T>(
	code: string,
	message: string,
	displayCommand?: string,
): PublicationFactsResult<T> {
	const error: PublicationFactsError = {
		code,
		message,
		...(displayCommand === undefined ? {} : { displayCommand }),
	};
	return { ok: false, error };
}
