import type { GitResult, GitStatusPathFacts } from "./contract.ts";

export function parseGitStatusPaths(rawStatus: string): GitResult<GitStatusPathFacts> {
	const changedPaths: string[] = [];
	const changedSeen = new Set<string>();
	const records = rawStatus.split("\0");
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index] ?? "";
		if (record === "") continue;
		const parsed = parsePrimaryRecord(record);
		if (!parsed.ok) return malformedRecord(record);
		if (parsed.isRenameOrCopy) {
			index += 1;
			const sourcePath = records[index];
			if (sourcePath === undefined || sourcePath === "") return malformedRecord(record);
		}
		if (!changedSeen.has(parsed.path)) {
			changedSeen.add(parsed.path);
			changedPaths.push(parsed.path);
		}
	}
	return { ok: true, value: { changedPaths } };
}

function parsePrimaryRecord(
	record: string,
): { ok: true; path: string; isRenameOrCopy: boolean } | { ok: false } {
	if (record.length < 4 || record[2] !== " ") return { ok: false };
	const status = record.slice(0, 2);
	const path = record.slice(3);
	if (path === "") return { ok: false };
	return { ok: true, path, isRenameOrCopy: status.includes("R") || status.includes("C") };
}

function malformedRecord(record: string): GitResult<GitStatusPathFacts> {
	return {
		ok: false,
		error: {
			code: "git_status_parse_failed",
			message: `Malformed git porcelain status record: ${JSON.stringify(record)}`,
		},
	};
}
