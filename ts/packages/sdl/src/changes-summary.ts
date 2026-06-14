import type { PendingWorktreeSnapshot } from "./pending-worktree.ts";

const MAX_DISPLAY_FILE_LINES = 50;

export interface StatusSummary {
	modified: number;
	added: number;
	deleted: number;
	renamed: number;
	copied: number;
	untracked: number;
	conflicted: number;
	other: number;
	fileLines: string[];
}

export function summarizePorcelainStatus(status: string): StatusSummary {
	const summary: StatusSummary = {
		modified: 0,
		added: 0,
		deleted: 0,
		renamed: 0,
		copied: 0,
		untracked: 0,
		conflicted: 0,
		other: 0,
		fileLines: [],
	};

	for (const line of status.replace(/\r/g, "").split("\n")) {
		if (line.length === 0) continue;

		summary.fileLines.push(line);
		const indexStatus = line[0] ?? "";
		const worktreeStatus = line[1] ?? "";
		const pair = `${indexStatus}${worktreeStatus}`;

		if (pair === "??") {
			summary.untracked += 1;
			continue;
		}

		if (isConflictedStatus(indexStatus, worktreeStatus)) {
			summary.conflicted += 1;
			continue;
		}

		let matched = false;
		if (indexStatus === "M" || worktreeStatus === "M") {
			summary.modified += 1;
			matched = true;
		}
		if (indexStatus === "A" || worktreeStatus === "A") {
			summary.added += 1;
			matched = true;
		}
		if (indexStatus === "D" || worktreeStatus === "D") {
			summary.deleted += 1;
			matched = true;
		}
		if (indexStatus === "R" || worktreeStatus === "R") {
			summary.renamed += 1;
			matched = true;
		}
		if (indexStatus === "C" || worktreeStatus === "C") {
			summary.copied += 1;
			matched = true;
		}

		if (!matched) {
			summary.other += 1;
		}
	}

	return summary;
}

export function formatOutstandingChangesMessage(input: {
	snapshot: PendingWorktreeSnapshot;
	summaryText: string;
}): string {
	const summaryText = input.summaryText.trim();
	const statusSummary = summarizePorcelainStatus(input.snapshot.status);
	const lines = [`Outstanding changes on ${input.snapshot.branch}`, ""];
	lines.push(...summaryText.split(/\r?\n/).filter((line) => line.trim().length > 0));
	lines.push("", "Files:");
	lines.push(...displayFileLines(statusSummary.fileLines));
	return lines.join("\n");
}

function isConflictedStatus(indexStatus: string, worktreeStatus: string): boolean {
	const pair = `${indexStatus}${worktreeStatus}`;
	return indexStatus === "U" || worktreeStatus === "U" || pair === "AA" || pair === "DD";
}

function displayFileLines(fileLines: string[]): string[] {
	if (fileLines.length === 0) {
		return ["(no status lines)"];
	}

	const displayed = fileLines.slice(0, MAX_DISPLAY_FILE_LINES);
	const omitted = fileLines.length - displayed.length;
	if (omitted > 0) {
		displayed.push(`... ${omitted} more file(s)`);
	}
	return displayed;
}
