import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import { piExecApiToCommandExecApi, type PiExecApiLike } from "@nseng-ai/foundation/exec";

import { conciseGitFailureReason } from "./git-output.ts";

const GIT_HEAD_TIMEOUT_MS = 2_000;

export type GitHeadSnapshot =
	| { status: "available"; oid: string }
	| { status: "unavailable"; reason: string };

export type ReadGitHead = (input: { cwd: string }) => Promise<GitHeadSnapshot>;

export function createGitReadHead(input: { exec: PiExecApiLike }): ReadGitHead {
	const git = new RealGitGateway(piExecApiToCommandExecApi(input.exec), {
		timeoutMs: GIT_HEAD_TIMEOUT_MS,
	});
	return async ({ cwd }) => {
		const result = await git.headCommit({ cwd });
		if (!result.ok)
			return { status: "unavailable", reason: conciseGitFailureReason(result.error.message) };
		return { status: "available", oid: result.value };
	};
}
