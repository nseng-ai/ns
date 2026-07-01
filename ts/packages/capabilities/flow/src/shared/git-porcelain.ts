export interface GitPorcelainStatusLine {
	status: string;
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

	return { status: line.slice(0, 2), path };
}
