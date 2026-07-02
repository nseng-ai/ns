import type { GitResult, GitStatusPathFacts } from "./contract.ts";

export function parseGitStatusPaths(rawStatus: string): GitResult<GitStatusPathFacts> {
	const changedPaths: string[] = [];
	const stagedPaths: string[] = [];
	const changedSeen = new Set<string>();
	const stagedSeen = new Set<string>();
	for (const line of rawStatus.split(/\r?\n/u)) {
		if (line === "") continue;
		if (line.length < 4 || line[2] !== " ") return malformedLine(line);
		const status = line.slice(0, 2);
		const payload = line.slice(3);
		if (payload === "") return malformedLine(line);
		const isRenameOrCopy = status.includes("R") || status.includes("C");
		const pathspec =
			isRenameOrCopy && payload.includes(" -> ")
				? payload.slice(payload.lastIndexOf(" -> ") + " -> ".length)
				: payload;
		if (!changedSeen.has(pathspec)) {
			changedSeen.add(pathspec);
			changedPaths.push(pathspec);
		}
		const indexStatus = status[0];
		if (indexStatus !== " " && indexStatus !== "?" && !stagedSeen.has(pathspec)) {
			stagedSeen.add(pathspec);
			stagedPaths.push(pathspec);
		}
	}
	return { ok: true, value: { changedPaths, stagedPaths } };
}

function malformedLine(line: string): GitResult<GitStatusPathFacts> {
	return {
		ok: false,
		error: {
			code: "git_status_parse_failed",
			message: `Malformed git porcelain status line: ${JSON.stringify(line)}`,
		},
	};
}
