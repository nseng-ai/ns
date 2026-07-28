export interface HeadTailTextTruncationOptions {
	value: string;
	maxChars: number;
	headRatio: number;
	buildMarker: (omittedChars: number) => string;
	headRounding?: "floor" | "ceil";
	markerOmittedChars?: number;
	shouldTrimHead?: boolean;
	shouldTrimTail?: boolean;
}

export interface HeadTextTruncationOptions {
	value: string;
	maxChars: number;
	buildMarker: (omittedChars: number) => string;
	shouldTrimInput?: boolean;
	shouldTrimHead?: boolean;
}

interface HeadMarkerState {
	marker: string;
	preservedChars: number;
}

export function truncateTextHeadTail(input: HeadTailTextTruncationOptions): string {
	if (input.value.length <= input.maxChars) return input.value;

	const marker = input.buildMarker(input.markerOmittedChars ?? input.value.length - input.maxChars);
	const remainingChars = Math.max(0, input.maxChars - marker.length);
	const headChars = splitHeadChars(remainingChars, input.headRatio, input.headRounding ?? "floor");
	const tailChars = remainingChars - headChars;
	const head = maybeTrimEnd(input.value.slice(0, headChars), input.shouldTrimHead === true);
	const tail = maybeTrimStart(
		tailChars === 0 ? "" : input.value.slice(input.value.length - tailChars),
		input.shouldTrimTail === true,
	);
	return `${head}${marker}${tail}`;
}

export function truncateTextHead(input: HeadTextTruncationOptions): string {
	const value = input.shouldTrimInput === true ? input.value.trim() : input.value;
	if (value.length <= input.maxChars) return value;

	let markerState = headMarkerState(input, 0);
	markerState = refineHeadMarkerState(input, value.length, markerState);
	markerState = refineHeadMarkerState(input, value.length, markerState);
	const head = maybeTrimEnd(
		value.slice(0, markerState.preservedChars),
		input.shouldTrimHead !== false,
	);
	return `${head}${markerState.marker}`;
}

function headMarkerState(
	input: Pick<HeadTextTruncationOptions, "maxChars" | "buildMarker">,
	omittedChars: number,
): HeadMarkerState {
	const marker = input.buildMarker(omittedChars);
	return { marker, preservedChars: Math.max(0, input.maxChars - marker.length) };
}

function refineHeadMarkerState(
	input: Pick<HeadTextTruncationOptions, "maxChars" | "buildMarker">,
	valueLength: number,
	state: HeadMarkerState,
): HeadMarkerState {
	return headMarkerState(input, valueLength - state.preservedChars);
}

function splitHeadChars(
	remainingChars: number,
	headRatio: number,
	headRounding: "floor" | "ceil",
): number {
	const rawHeadChars = remainingChars * headRatio;
	const roundedHeadChars =
		headRounding === "ceil" ? Math.ceil(rawHeadChars) : Math.floor(rawHeadChars);
	return Math.max(0, Math.min(remainingChars, roundedHeadChars));
}

function maybeTrimEnd(value: string, shouldTrim: boolean): string {
	return shouldTrim ? value.trimEnd() : value;
}

function maybeTrimStart(value: string, shouldTrim: boolean): string {
	return shouldTrim ? value.trimStart() : value;
}
