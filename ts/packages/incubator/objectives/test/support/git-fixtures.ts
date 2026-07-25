import type { GitErrorInfo } from "@nseng-ai/foundation/git";

export function stagedWhitespaceFailure(): GitErrorInfo {
	return {
		code: "git_staged_whitespace_failed",
		message: "git diff --cached --check failed: trailing whitespace",
	};
}
