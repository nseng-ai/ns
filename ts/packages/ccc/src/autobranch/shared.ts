export { formatPendingWorktreeCommandDetails as formatCommandDetails } from "@sdl/sdl/pending-worktree";

export function truncateText(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}\n...[truncated]`;
}
