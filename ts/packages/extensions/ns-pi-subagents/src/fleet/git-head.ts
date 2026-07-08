import { RealGitGateway } from "@nseng-ai/capability-kit/git";
import { piExecApiToCommandExecApi, type PiExecApiLike } from "@nseng-ai/foundation/exec";

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
		if (!result.ok) return { status: "unavailable", reason: conciseReason(result.error.message) };
		return { status: "available", oid: result.value };
	};
}

function conciseReason(reason: string): string {
	const compact = reason.replace(/\s+/gu, " ").trim();
	if (compact.length === 0) return "git command failed";
	return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
}
