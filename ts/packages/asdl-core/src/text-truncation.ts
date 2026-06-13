export interface HeadTailTextTruncationOptions {
	value: string;
	maxChars: number;
	headRatio: number;
	buildMarker: (omittedChars: number) => string;
	headRounding?: "floor" | "ceil";
	markerOmittedChars?: number;
	trimHead?: boolean;
	trimTail?: boolean;
}

export interface HeadTextTruncationOptions {
	value: string;
	maxChars: number;
	buildMarker: (omittedChars: number) => string;
	trimInput?: boolean;
	trimHead?: boolean;
}

export function truncateTextHeadTail(input: HeadTailTextTruncationOptions): string {
	if (input.value.length <= input.maxChars) return input.value;

	const marker = input.buildMarker(input.markerOmittedChars ?? input.value.length - input.maxChars);
	const remainingChars = Math.max(0, input.maxChars - marker.length);
	const headChars = splitHeadChars(remainingChars, input.headRatio, input.headRounding ?? "floor");
	const tailChars = remainingChars - headChars;
	const head = maybeTrimEnd(input.value.slice(0, headChars), input.trimHead === true);
	const tail = maybeTrimStart(tailChars === 0 ? "" : input.value.slice(input.value.length - tailChars), input.trimTail === true);
	return `${head}${marker}${tail}`;
}

export function truncateTextHead(input: HeadTextTruncationOptions): string {
	const value = input.trimInput === true ? input.value.trim() : input.value;
	if (value.length <= input.maxChars) return value;

	let marker = input.buildMarker(0);
	let preservedChars = Math.max(0, input.maxChars - marker.length);
	marker = input.buildMarker(value.length - preservedChars);
	preservedChars = Math.max(0, input.maxChars - marker.length);
	marker = input.buildMarker(value.length - preservedChars);
	const head = maybeTrimEnd(value.slice(0, preservedChars), input.trimHead !== false);
	return `${head}${marker}`;
}

function splitHeadChars(remainingChars: number, headRatio: number, headRounding: "floor" | "ceil"): number {
	const rawHeadChars = remainingChars * headRatio;
	const roundedHeadChars = headRounding === "ceil" ? Math.ceil(rawHeadChars) : Math.floor(rawHeadChars);
	return Math.max(0, Math.min(remainingChars, roundedHeadChars));
}

function maybeTrimEnd(value: string, shouldTrim: boolean): string {
	return shouldTrim ? value.trimEnd() : value;
}

function maybeTrimStart(value: string, shouldTrim: boolean): string {
	return shouldTrim ? value.trimStart() : value;
}
