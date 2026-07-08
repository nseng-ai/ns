import { formatErrorMessage } from "@nseng-ai/foundation/primitives";
import type { ExecOptions, PiExecApiLike } from "@nseng-ai/foundation/exec";

const GIT_HEAD_TIMEOUT_MS = 2_000;

export type GitHeadSnapshot =
	| { status: "available"; oid: string }
	| { status: "unavailable"; reason: string };

export type ReadGitHead = (input: { cwd: string }) => Promise<GitHeadSnapshot>;

export function createGitReadHead(input: { exec: PiExecApiLike }): ReadGitHead {
	return async ({ cwd }) => {
		try {
			const result = await input.exec.exec(
				"git",
				["rev-parse", "--verify", "HEAD"],
				gitHeadExecOptions(cwd),
			);
			if (result.code !== 0) {
				const output =
					result.stderr ?? result.stdout ?? result.startupError ?? `git exited ${result.code}`;
				return { status: "unavailable", reason: conciseReason(output) };
			}
			const oid = (result.stdout ?? "").trim();
			if (oid.length === 0) return { status: "unavailable", reason: "git returned empty HEAD" };
			return { status: "available", oid };
		} catch (error) {
			return { status: "unavailable", reason: conciseReason(formatErrorMessage(error)) };
		}
	};
}

function gitHeadExecOptions(cwd: string): ExecOptions {
	return { cwd, timeout: GIT_HEAD_TIMEOUT_MS };
}

function conciseReason(reason: string): string {
	const compact = reason.replace(/\s+/gu, " ").trim();
	if (compact.length === 0) return "git command failed";
	return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
}
