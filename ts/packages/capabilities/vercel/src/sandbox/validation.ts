/** Exact commit-SHA length shared by workflow and HTTP boundaries. */
export const COMMIT_SHA_CHARS = 40;

export const COMMIT_SHA_PATTERN = /^[0-9a-fA-F]{40}$/;

export function isCommitSha(value: string): boolean {
	return COMMIT_SHA_PATTERN.test(value);
}
