const GIT_PORCELAIN_UNMERGED_STATUS_CODES = ["DD", "AU", "UD", "UA", "DU", "AA", "UU"];

export interface GitPorcelainStatus {
	raw: string;
	index: string;
	worktree: string;
}

export interface GitPorcelainStatusLine {
	status: GitPorcelainStatus;
	path: string;
}

export function parseGitPorcelainStatusOutput(output: string): GitPorcelainStatusLine[] {
	const parsedLines: GitPorcelainStatusLine[] = [];
	for (const line of output.replace(/\r/g, "\n").split("\n")) {
		const parsed = parseGitPorcelainStatusLine(line);
		if (parsed !== undefined) parsedLines.push(parsed);
	}
	return parsedLines;
}

export function parseGitPorcelainStatusLine(line: string): GitPorcelainStatusLine | undefined {
	if (line.length < 4) return undefined;

	const path = line.slice(3).trim();
	if (path.length === 0) return undefined;

	const raw = line.slice(0, 2);
	return { status: { raw, index: raw[0] ?? "", worktree: raw[1] ?? "" }, path };
}

export function isGitPorcelainUnmergedStatus(status: GitPorcelainStatus): boolean {
	return GIT_PORCELAIN_UNMERGED_STATUS_CODES.some((code) => code === status.raw);
}
