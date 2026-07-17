import { homedir } from "node:os";
import { isAbsolute, normalize, resolve } from "node:path";

export const SCREENSHOT_MARKER_PATTERN = /\[screenshot #(\d+)\]/g;

export interface ImageCandidate {
	start: number;
	end: number;
	value: string;
}

export interface ImageReference extends ImageCandidate {
	path: string;
}

export interface CandidateValidation {
	isSupportedImage(path: string): boolean;
}

const IMAGE_SUFFIX_PATTERN = /\.(?:png|jpe?g|webp|gif)$/i;
const TOKEN_PATTERN =
	/file:\/\/(?:"(?:[^"\\]|\\.)*"|'[^']*'|(?:\\.|[^\s<>|;,(){}[\]])+)|"(?:[^"\\]|\\.)*"|'[^']*'|(?:~\/|\/)(?:\\.|[^\s<>|;,(){}[\]])+/g;

/** Lexically extracts path-shaped image candidates without touching the filesystem. */
export function parseImageCandidates(text: string): ImageCandidate[] {
	const candidates: ImageCandidate[] = [];
	for (const match of text.matchAll(TOKEN_PATTERN)) {
		const token = match[0];
		const index = match.index;
		if (index === undefined) continue;
		const previous = index === 0 ? "" : (text[index - 1] ?? "");
		if (isUnsafePrefix(previous, text.slice(0, index))) continue;
		const value = decodeToken(token);
		if (value === undefined || !IMAGE_SUFFIX_PATTERN.test(value)) continue;
		candidates.push({ start: index, end: index + token.length, value });
	}
	return candidates;
}

export function normalizeLocalPath(
	candidate: string,
	options: { home?: string } = {},
): string | undefined {
	let path = candidate;
	if (path.startsWith("file://")) {
		try {
			const url = new URL(path);
			if (url.protocol !== "file:" || (url.hostname !== "" && url.hostname !== "localhost")) {
				return undefined;
			}
			path = decodeURIComponent(url.pathname);
		} catch {
			return undefined;
		}
	}
	if (path === "~" || path.startsWith("~/")) {
		path = resolve(options.home ?? homedir(), path.slice(2));
	}
	if (!isAbsolute(path)) return undefined;
	return normalize(path);
}

/** Normalizes path-shaped candidates without touching the filesystem. */
export function resolveImageReferences(
	text: string,
	options: { home?: string } = {},
): ImageReference[] {
	const references: ImageReference[] = [];
	for (const candidate of parseImageCandidates(text)) {
		const path = normalizeLocalPath(candidate.value, options);
		if (path === undefined) continue;
		references.push({ ...candidate, path });
	}
	return selectNonOverlapping(references);
}

/** Replaces longest candidates first, then emits replacements in source order. */
export function replaceImageReferences(
	text: string,
	references: readonly ImageReference[],
	replacement: (reference: ImageReference) => string,
): string {
	const selected = selectNonOverlapping(references);
	let result = "";
	let cursor = 0;
	for (const reference of selected) {
		result += text.slice(cursor, reference.start);
		result += replacement(reference);
		cursor = reference.end;
	}
	return result + text.slice(cursor);
}

function selectNonOverlapping(references: readonly ImageReference[]): ImageReference[] {
	const byPriority = [...references].sort(
		(left, right) => right.end - right.start - (left.end - left.start) || left.start - right.start,
	);
	const selected: ImageReference[] = [];
	for (const candidate of byPriority) {
		if (
			selected.some((current) => candidate.start < current.end && current.start < candidate.end)
		) {
			continue;
		}
		selected.push(candidate);
	}
	return selected.sort((left, right) => left.start - right.start);
}

function isUnsafePrefix(previous: string, prefix: string): boolean {
	if (/[A-Za-z0-9_@.:/]/.test(previous)) return true;
	return /https?:$/.test(prefix);
}

function decodeToken(token: string): string | undefined {
	const filePrefix = token.startsWith("file://") ? "file://" : "";
	const body = filePrefix === "" ? token : token.slice(filePrefix.length);
	let decoded: string;
	if (body.startsWith("'") && body.endsWith("'")) {
		decoded = body.slice(1, -1);
	} else if (body.startsWith('"') && body.endsWith('"')) {
		decoded = body.slice(1, -1).replace(/\\([\\" $`])/g, "$1");
	} else {
		decoded = body.replace(/\\(.)/g, "$1");
	}
	return filePrefix + decoded;
}
