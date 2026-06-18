import { parsePatchFiles, type Hunk } from "@pierre/diffs";

import type { InlineClassificationResult, PRChangedFile, ReviewFinding } from "./models.ts";

const INLINE_PATCH_FILE = "__roaster_inline__.patch";

export function commentableRightSideLines(patch: string | null): ReadonlySet<number> {
	const lines = new Set<number>();
	if (patch === null || patch.trim() === "") return lines;

	for (const hunk of parseInlinePatchHunks(patch)) {
		for (let line = hunk.additionStart; line < hunk.additionStart + hunk.additionCount; line += 1) {
			lines.add(line);
		}
	}
	return lines;
}

function parseInlinePatchHunks(patch: string): readonly Hunk[] {
	try {
		return parsePatchFiles(syntheticUnifiedPatch(patch), "roaster-inline").flatMap((parsedPatch) =>
			parsedPatch.files.flatMap((file) => file.hunks),
		);
	} catch {
		// Malformed GitHub patch snippets should only disable inline comments, not fail review classification.
		return [];
	}
}

function syntheticUnifiedPatch(patch: string): string {
	const patchBody = patch.endsWith("\n") ? patch : `${patch}\n`;
	return `diff --git a/${INLINE_PATCH_FILE} b/${INLINE_PATCH_FILE}\n--- a/${INLINE_PATCH_FILE}\n+++ b/${INLINE_PATCH_FILE}\n${patchBody}`;
}

export function classifyInlineFindings(
	findings: readonly ReviewFinding[],
	changedFiles: readonly PRChangedFile[],
): InlineClassificationResult {
	const changedByPath = new Map(changedFiles.map((file) => [file.path, file]));
	const linesByPath = new Map(
		changedFiles.map((file) => [file.path, commentableRightSideLines(file.patch)]),
	);
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
