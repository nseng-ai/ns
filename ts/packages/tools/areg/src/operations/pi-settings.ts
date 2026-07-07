import { formatErrorMessage, isRecord } from "@nseng-ai/foundation/primitives";
import { err, type Result } from "@nseng-ai/foundation/result";

import type { PathState, TextFileState } from "@nseng-ai/harness-artifacts/api";
import { rejectTextState, validateOptionalDirectoryState } from "./file-state.ts";

export interface PiSettingsData {
	text: string | undefined;
	data: Record<string, unknown> | undefined;
	exclusions: readonly string[];
}

export type ParsePiSettingsResult = Result<PiSettingsData>;

export function parsePiSettings(piDir: PathState, settings: TextFileState): ParsePiSettingsResult {
	const piDirectory = validateOptionalDirectoryState({
		pathLabel: ".pi",
		state: piDir,
		action: "inspect Pi settings",
	});
	if (!piDirectory.ok) return piDirectory;
	if (settings.type === "missing")
		return { ok: true, value: { text: undefined, data: undefined, exclusions: [] } };
	if (settings.type !== "file")
		return rejectTextState({
			pathLabel: ".pi/settings.json",
			state: settings,
			action: "inspect Pi settings",
			unreadableMode: "not-file",
		});
	let data: unknown;
	try {
		data = JSON.parse(settings.text);
	} catch (error) {
		return err({
			code: "pi_settings_invalid_json",
			message: `Invalid JSON in .pi/settings.json: ${formatErrorMessage(error)}.`,
		});
	}
	if (!isRecord(data))
		return err({
			code: "pi_settings_not_object",
			message: ".pi/settings.json must contain a JSON object.",
		});
	if (data.skills === undefined)
		return { ok: true, value: { text: settings.text, data, exclusions: [] } };
	if (!isStringArray(data.skills))
		return err({
			code: "pi_settings_skills_not_string_array",
			message: ".pi/settings.json field 'skills' must be an array of strings.",
		});
	return { ok: true, value: { text: settings.text, data, exclusions: data.skills } };
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
