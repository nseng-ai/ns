import { Buffer } from "node:buffer";

import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";

export type DiffChangeKind = "added" | "modified" | "deleted" | "renamed" | "copied";

export interface DiffFile {
	readonly path: string;
	readonly oldPath: string | null;
	readonly changeKind: DiffChangeKind;
	readonly rawText: string;
	readonly isBinary: boolean;
	readonly addedLines: number;
	readonly removedLines: number;
	readonly hunkCount: number;
	readonly byteSize: number;
	readonly estimatedTokens: number;
}

export function estimateTokens(text: string): number {
	if (text === "") return 0;
	return Math.ceil([...text].length / 4);
}

export function parseUnifiedDiff(diffText: string): readonly DiffFile[] {
	if (diffText.trim() === "") return [];

	return diffSegments(diffText).flatMap((rawSegment) =>
		parsePierreDiffFiles(rawSegment).map((metadata) => diffFileFromPierre(metadata, rawSegment)),
	);
}

function parsePierreDiffFiles(diffText: string): readonly FileDiffMetadata[] {
	try {
		return parsePatchFiles(diffText, "roaster-diff").flatMap((patch) => patch.files);
	} catch {
		// Preserve roaster's forgiving parser boundary: unsupported patch text becomes no parsed files.
		return [];
	}
}

function diffFileFromPierre(metadata: FileDiffMetadata, rawText: string): DiffFile {
	const changeKind = changeKindFromPierre(metadata, rawText);
	return {
		path: metadata.name,
		oldPath:
			changeKind === "renamed" || changeKind === "copied" ? (metadata.prevName ?? null) : null,
		changeKind,
		rawText,
		isBinary: isBinaryPatch(rawText),
		addedLines: metadata.hunks.reduce((total, hunk) => total + hunk.additionLines, 0),
		removedLines: metadata.hunks.reduce((total, hunk) => total + hunk.deletionLines, 0),
		hunkCount: metadata.hunks.length,
		byteSize: Buffer.byteLength(rawText, "utf8"),
		estimatedTokens: estimateTokens(rawText),
	};
}

function changeKindFromPierre(metadata: FileDiffMetadata, rawText: string): DiffChangeKind {
	switch (metadata.type) {
		case "new":
			return "added";
		case "deleted":
			return "deleted";
		case "rename-pure":
		case "rename-changed":
			return isCopiedPatch(rawText) ? "copied" : "renamed";
		case "change":
			return "modified";
	}
}

function isCopiedPatch(rawText: string): boolean {
	// @pierre/diffs 1.2.10 reports Git copy metadata as rename-*; preserve roaster's copied kind from raw headers.
	return /^copy from .+$/mu.test(rawText) && /^copy to .+$/mu.test(rawText);
}

function diffSegments(diffText: string): readonly string[] {
	return diffText.split(/(?=^diff --git )/mu).filter((segment) => segment !== "");
}

function isBinaryPatch(rawText: string): boolean {
	return /^(Binary files .+ differ|GIT binary patch)$/mu.test(rawText);
}
