import { validatePlanSlug } from "./plan-persistence.ts";

const TIMESTAMP_PATTERN =
	/^(?<year>\d{2})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2})-(?<minute>\d{2})-(?<second>\d{2})$/;
const TIMESTAMPED_FILE_PATTERN =
	/^(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)--(?<timestamp>\d{2}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})--(?<sequence>[1-9]\d*)\.md$/;

export type SavedPlanFormat = "timestamped";

export interface TimestampedSavedPlanName {
	format: "timestamped";
	slug: string;
	fileName: string;
	timestamp: string;
	timestampNumber: number;
	sequence: number;
}

export type ParsedSavedPlanName = TimestampedSavedPlanName;

export function formatLocalSavedPlanTimestamp(nowMs: number): string {
	const date = new Date(nowMs);
	return [
		String(date.getFullYear()).slice(-2),
		"-",
		pad(date.getMonth() + 1),
		"-",
		pad(date.getDate()),
		"T",
		pad(date.getHours()),
		"-",
		pad(date.getMinutes()),
		"-",
		pad(date.getSeconds()),
	].join("");
}

export function buildTimestampedSavedPlanFileName(
	slug: string,
	timestamp: string,
	sequence: number,
): string {
	if (validatePlanSlug(slug) !== undefined) throw new Error(`Invalid Saved Plan slug: ${slug}`);
	if (parseLocalSavedPlanTimestamp(timestamp) === undefined) {
		throw new Error(`Invalid local Saved Plan timestamp: ${timestamp}`);
	}
	if (!Number.isSafeInteger(sequence) || sequence < 1) {
		throw new Error("Saved Plan sequence must be a positive safe integer.");
	}
	return `${slug}--${timestamp}--${sequence}.md`;
}

export function parseSavedPlanFileName(fileName: string): ParsedSavedPlanName | undefined {
	const match = TIMESTAMPED_FILE_PATTERN.exec(fileName);
	if (match?.groups !== undefined) {
		const slug = match.groups.slug;
		const timestamp = match.groups.timestamp;
		const sequenceText = match.groups.sequence;
		if (slug === undefined || timestamp === undefined || sequenceText === undefined)
			return undefined;
		const timestampNumber = parseLocalSavedPlanTimestamp(timestamp);
		const sequence = Number(sequenceText);
		if (
			validatePlanSlug(slug) !== undefined ||
			timestampNumber === undefined ||
			!Number.isSafeInteger(sequence)
		) {
			return undefined;
		}
		return { format: "timestamped", slug, fileName, timestamp, timestampNumber, sequence };
	}
	return undefined;
}

export function parseLocalSavedPlanTimestamp(timestamp: string): number | undefined {
	const match = TIMESTAMP_PATTERN.exec(timestamp);
	if (match?.groups === undefined) return undefined;
	const { year, month, day, hour, minute, second } = match.groups;
	if (
		year === undefined ||
		month === undefined ||
		day === undefined ||
		hour === undefined ||
		minute === undefined ||
		second === undefined
	) {
		return undefined;
	}
	const values = [year, month, day, hour, minute, second].map(Number);
	const [yearNumber, monthNumber, dayNumber, hourNumber, minuteNumber, secondNumber] = values;
	if (
		yearNumber === undefined ||
		monthNumber === undefined ||
		dayNumber === undefined ||
		hourNumber === undefined ||
		minuteNumber === undefined ||
		secondNumber === undefined
	) {
		return undefined;
	}
	const candidate = new Date(
		Date.UTC(2000 + yearNumber, monthNumber - 1, dayNumber, hourNumber, minuteNumber, secondNumber),
	);
	if (
		candidate.getUTCFullYear() !== 2000 + yearNumber ||
		candidate.getUTCMonth() !== monthNumber - 1 ||
		candidate.getUTCDate() !== dayNumber ||
		candidate.getUTCHours() !== hourNumber ||
		candidate.getUTCMinutes() !== minuteNumber ||
		candidate.getUTCSeconds() !== secondNumber
	) {
		return undefined;
	}
	return Number(`${year}${month}${day}${hour}${minute}${second}`);
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}
