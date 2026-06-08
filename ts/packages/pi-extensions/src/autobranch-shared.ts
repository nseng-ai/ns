export { formatPendingWorktreeCommandDetails as formatCommandDetails } from "asdl-dev/src/pending-worktree.ts";

export interface StatusInput {
	setStatus: (message: string | undefined) => void;
}

export async function withStatus<T>(input: StatusInput, message: string, action: () => Promise<T>): Promise<T> {
	input.setStatus(message);
	try {
		return await action();
	} finally {
		input.setStatus(undefined);
	}
}

export function truncateText(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}\n...[truncated]`;
}
