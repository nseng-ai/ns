import { formatErrorMessage, isRecord } from "@asdl/core/primitives";

import type { AregPathState, AregTextFileState } from "../gateways.ts";

export interface PiSettingsData {
	text: string | undefined;
	data: Record<string, unknown> | undefined;
	exclusions: readonly string[];
}

export type ParsePiSettingsResult = { type: "ok"; value: PiSettingsData } | { type: "error"; message: string };

export function parsePiSettings(piDir: Pick<AregPathState, "type">, settings: AregTextFileState): ParsePiSettingsResult {
	if (piDir.type === "symlink") return { type: "error", message: ".pi is a symlink; refusing to inspect Pi settings." };
	if (settings.type === "missing") return { type: "ok", value: { text: undefined, data: undefined, exclusions: [] } };
	if (settings.type === "symlink") return { type: "error", message: ".pi/settings.json is a symlink; refusing to inspect Pi settings." };
	if (settings.type !== "file") return { type: "error", message: ".pi/settings.json exists but is not a file." };
	let data: unknown;
	try {
		data = JSON.parse(settings.text);
	} catch (error) {
		return { type: "error", message: `Invalid JSON in .pi/settings.json: ${formatErrorMessage(error)}.` };
	}
	if (!isRecord(data)) return { type: "error", message: ".pi/settings.json must contain a JSON object." };
	if (data.skills === undefined) return { type: "ok", value: { text: settings.text, data, exclusions: [] } };
	if (!isStringArray(data.skills)) return { type: "error", message: ".pi/settings.json field 'skills' must be an array of strings." };
	return { type: "ok", value: { text: settings.text, data, exclusions: data.skills } };
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
