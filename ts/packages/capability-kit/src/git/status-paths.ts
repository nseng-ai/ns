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
		pushUnique(changedPaths, changedSeen, parsed.path);
	}
	return { ok: true, value: { changedPaths } };
}

export function parseGitNameStatusPaths(rawStatus: string): GitResult<GitStatusPathFacts> {
	const changedPaths: string[] = [];
	const changedSeen = new Set<string>();
	for (const line of rawStatus.split(/\r?\n/)) {
		const trimmedLine = line.trimEnd();
		if (trimmedLine === "") continue;
		const fields = trimmedLine.split("\t");
		const status = fields[0] ?? "";
		if (status === "") return malformedRecord(trimmedLine);
		if (status.startsWith("R") || status.startsWith("C")) {
			const paths = fields.slice(1).filter(Boolean);
			if (paths.length < 2) return malformedRecord(trimmedLine);
			for (const path of paths) {
				pushUnique(changedPaths, changedSeen, path);
			}
			continue;
		}
		const path = fields[1];
		if (path === undefined || path === "") return malformedRecord(trimmedLine);
		pushUnique(changedPaths, changedSeen, path);
	}
	return { ok: true, value: { changedPaths } };
}

function pushUnique(paths: string[], seen: Set<string>, path: string): void {
	if (seen.has(path)) return;
	seen.add(path);
	paths.push(path);
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
