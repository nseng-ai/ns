export interface ManagedRegionMarkers {
	beginPrefix: string;
	end: string;
}

export type ManagedRegionParseResult<TMetadata = undefined> =
	| { type: "found"; metadata: TMetadata; body: string; start: number; end: number; beginComment: string; rawBody: string }
	| { type: "missing" }
	| { type: "malformed"; reason: string };

export type ManagedRegionBoundsResult =
	| { type: "found"; start: number; end: number }
	| { type: "missing" }
	| { type: "malformed"; reason: string };

export function parseManagedRegion<TMetadata = undefined>(input: {
	text: string;
	markers: ManagedRegionMarkers;
	parseMetadata?: (beginComment: string) => TMetadata | undefined;
	extractBody?: (rawBody: string) => string;
}): ManagedRegionParseResult<TMetadata> {
	const beginCount = countOccurrences(input.text, input.markers.beginPrefix);
	const endCount = countOccurrences(input.text, input.markers.end);
	if (beginCount === 0 && endCount === 0) return { type: "missing" };
	if (beginCount === 0) return { type: "malformed", reason: "managed region begin marker is missing" };
	if (endCount === 0) return { type: "malformed", reason: "managed region end marker is missing" };
	if (beginCount > 1) return { type: "malformed", reason: "managed region begin marker is duplicated" };
	if (endCount > 1) return { type: "malformed", reason: "managed region end marker is duplicated" };

	const beginIndex = input.text.indexOf(input.markers.beginPrefix);
	const endIndex = input.text.indexOf(input.markers.end);
	if (endIndex < beginIndex) return { type: "malformed", reason: "managed region end marker appears before begin marker" };

	const beginEndIndex = input.text.indexOf("-->", beginIndex);
	if (beginEndIndex === -1) return { type: "malformed", reason: "managed region begin marker is unterminated" };
	if (endIndex < beginEndIndex + 3) return { type: "malformed", reason: "managed region end marker appears inside begin comment" };

	const beginComment = input.text.slice(beginIndex, beginEndIndex + 3);
	const metadata = input.parseMetadata === undefined ? (undefined as TMetadata) : input.parseMetadata(beginComment);
	if (metadata === undefined && input.parseMetadata !== undefined) return { type: "malformed", reason: "managed region metadata is invalid" };

	const rawBody = input.text.slice(beginEndIndex + 3, endIndex);
	return {
		type: "found",
		metadata: metadata as TMetadata,
		body: input.extractBody?.(rawBody) ?? rawBody,
		start: beginIndex,
		end: endIndex + input.markers.end.length,
		beginComment,
		rawBody,
	};
}

export function managedRegionBounds(input: { text: string; startMarker: string; endMarker: string }): ManagedRegionBoundsResult {
	const startCount = countOccurrences(input.text, input.startMarker);
	const endCount = countOccurrences(input.text, input.endMarker);
	if (startCount === 0 && endCount === 0) return { type: "missing" };
	if (startCount === 0) return { type: "malformed", reason: "managed region start marker is missing" };
	if (endCount === 0) return { type: "malformed", reason: "managed region end marker is missing" };
	if (startCount > 1) return { type: "malformed", reason: "managed region start marker is duplicated" };
	if (endCount > 1) return { type: "malformed", reason: "managed region end marker is duplicated" };

	const start = input.text.indexOf(input.startMarker);
	const endMarkerStart = input.text.indexOf(input.endMarker);
	if (endMarkerStart < start) return { type: "malformed", reason: "managed region end marker appears before start marker" };
	return { type: "found", start, end: endMarkerStart + input.endMarker.length };
}

export function replaceManagedRegion(input: { text: string; replacement: string; start: number; end: number }): string {
	return `${input.text.slice(0, input.start).trimEnd()}\n\n${input.replacement}\n\n${input.text.slice(input.end).trimStart()}`.trim();
}

export function replaceMalformedManagedRegionFromBegin(input: { text: string; beginPrefix: string; replacement: string }): string {
	const beginIndex = input.text.indexOf(input.beginPrefix);
	if (beginIndex === -1) return input.text.trim() === "" ? input.replacement : `${input.replacement}\n\n${input.text.trimStart()}`;
	return `${input.text.slice(0, beginIndex).trimEnd()}\n\n${input.replacement}`.trim();
}

function countOccurrences(content: string, needle: string): number {
	let count = 0;
	let start = 0;
	while (true) {
		const index = content.indexOf(needle, start);
		if (index === -1) return count;
		count += 1;
		start = index + needle.length;
	}
}
