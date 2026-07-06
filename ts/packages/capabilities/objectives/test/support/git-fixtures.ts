import type { GitErrorInfo } from "@nseng-ai/capability-kit/git";

export function stagedWhitespaceFailure(): GitErrorInfo {
	return {
		code: "git_staged_whitespace_failed",
		message: "git diff --cached --check failed: trailing whitespace",
	};
}
