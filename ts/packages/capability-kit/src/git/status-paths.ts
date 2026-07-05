import type { GitResult, GitStatusPathFacts } from "./contract.ts";

export function parseGitStatusPaths(rawStatus: string): GitResult<GitStatusPathFacts> {
	const records = rawStatus.split("\0");
	return collectGitStatusPaths(records, (record, index) => {
		const parsed = parsePrimaryRecord(record);
		if (!parsed.ok) return { ok: false };
		if (!parsed.isRenameOrCopy) return { ok: true, paths: [parsed.path] };
		const sourcePath = records[index + 1];
		if (sourcePath === undefined || sourcePath === "") return { ok: false };
		return { ok: true, paths: [parsed.path], consumedRecords: 1 };
	});
}

export function parseGitNameStatusPaths(rawStatus: string): GitResult<GitStatusPathFacts> {
	const records = rawStatus.split(/\r?\n/).map((line) => line.trimEnd());
	return collectGitStatusPaths(records, (record) => {
		const fields = record.split("\t");
		const status = fields[0] ?? "";
		if (status === "") return { ok: false };
		if (status.startsWith("R") || status.startsWith("C")) {
			const paths = fields.slice(1).filter(Boolean);
			if (paths.length < 2) return { ok: false };
			return { ok: true, paths };
		}
		const path = fields[1];
		if (path === undefined || path === "") return { ok: false };
		return { ok: true, paths: [path] };
	});
}

type GitStatusRecordExtraction =
	| { ok: true; paths: readonly string[]; consumedRecords?: number }
	| { ok: false };

function collectGitStatusPaths(
	records: readonly string[],
	extractRecord: (record: string, index: number) => GitStatusRecordExtraction,
): GitResult<GitStatusPathFacts> {
	const changedPaths: string[] = [];
	const changedSeen = new Set<string>();
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index] ?? "";
		if (record === "") continue;
		const extracted = extractRecord(record, index);
		if (!extracted.ok) return malformedRecord(record);
		for (const path of extracted.paths) {
			pushUnique(changedPaths, changedSeen, path);
		}
		index += extracted.consumedRecords ?? 0;
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
