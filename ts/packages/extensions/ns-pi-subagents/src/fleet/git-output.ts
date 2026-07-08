export function conciseGitFailureReason(reason: string): string {
	const compact = reason.replace(/\s+/gu, " ").trim();
	if (compact.length === 0) return "git command failed";
	return compact.length > 120 ? `${compact.slice(0, 117)}…` : compact;
}
