import { formatErrorMessage, isRecord } from "@asdl/core/primitives";

import type { AregPathState, AregTextFileState } from "../gateways.ts";
import { rejectTextState, validateOptionalDirectoryState } from "./file-state.ts";
import type { OperationResult } from "./operation-result.ts";

export interface PiSettingsData {
	text: string | undefined;
	data: Record<string, unknown> | undefined;
	exclusions: readonly string[];
}

export type ParsePiSettingsResult = OperationResult<PiSettingsData>;

export function parsePiSettings(piDir: AregPathState, settings: AregTextFileState): ParsePiSettingsResult {
	const piDirectory = validateOptionalDirectoryState({ pathLabel: ".pi", state: piDir, action: "inspect Pi settings" });
	if (piDirectory.type === "error") return piDirectory;
	if (settings.type === "missing") return { type: "ok", value: { text: undefined, data: undefined, exclusions: [] } };
	if (settings.type !== "file") return rejectTextState({ pathLabel: ".pi/settings.json", state: settings, action: "inspect Pi settings", unreadableMode: "not-file" });
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
