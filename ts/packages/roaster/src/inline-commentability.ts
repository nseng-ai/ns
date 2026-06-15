import type { InlineClassificationResult, PRChangedFile, ReviewFinding } from "./models.ts";

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,\d+)? @@/;

export function commentableRightSideLines(patch: string | null): ReadonlySet<number> {
	const lines = new Set<number>();
	if (patch === null) return lines;

	let rightLine: number | null = null;
	for (const patchLine of patch.split(/\r?\n/u)) {
		const hunkMatch = HUNK_HEADER_RE.exec(patchLine);
		if (hunkMatch !== null) {
			const start = hunkMatch.groups?.start;
			if (start !== undefined) rightLine = Number.parseInt(start, 10);
			continue;
		}

		if (rightLine === null) continue;
		if (patchLine.startsWith("\\")) continue;
		if (patchLine.startsWith("-")) continue;
		if (patchLine.startsWith("+") || patchLine.startsWith(" ")) {
			lines.add(rightLine);
			rightLine += 1;
		}
	}
	return lines;
}

export function classifyInlineFindings(findings: readonly ReviewFinding[], changedFiles: readonly PRChangedFile[]): InlineClassificationResult {
	const changedByPath = new Map(changedFiles.map((file) => [file.path, file]));
	const linesByPath = new Map(changedFiles.map((file) => [file.path, commentableRightSideLines(file.patch)]));
	const inlineable: InlineClassificationResult["inlineable"] = [];
	const fallbackOnly: InlineClassificationResult["fallbackOnly"] = [];

	for (const finding of findings) {
		if (finding.path === null) {
			fallbackOnly.push({ finding, reason: "missing_path" });
			continue;
		}
		if (finding.line === null) {
			fallbackOnly.push({ finding, reason: "missing_line" });
			continue;
		}
		const changedFile = changedByPath.get(finding.path);
		if (changedFile === undefined) {
			fallbackOnly.push({ finding, reason: "file_not_changed" });
			continue;
		}
		if (changedFile.patch === null) {
			fallbackOnly.push({ finding, reason: "patch_unavailable" });
			continue;
		}
		const lines = linesByPath.get(finding.path);
		if (lines === undefined || !lines.has(finding.line)) {
			fallbackOnly.push({ finding, reason: "line_not_in_diff" });
			continue;
		}
		inlineable.push({ finding, target: { path: finding.path, line: finding.line } });
	}

	return { inlineable, fallbackOnly };
}
