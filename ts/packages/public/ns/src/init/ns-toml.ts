import {
	getProjectConfigSetting,
	nsTomlExtensionsSettingsSchema,
	parseProjectConfigToml,
	projectConfigErrorFromDiagnostics,
	type ProjectConfigDiagnostic,
} from "@nseng-ai/sdk/project-config/points";

export type NsTomlExtensionsParseResult =
	| { type: "ok"; extensions: readonly string[] }
	| { type: "missing" }
	| { type: "error"; error: NsTomlErrorInfo };

export type NsTomlChange = "created" | "appended" | "replaced" | "unchanged";

export interface NsTomlErrorInfo {
	code: NsTomlErrorCode;
	message: string;
}

export type NsTomlErrorCode = "invalid-toml" | "invalid-extensions";

const nsInitExtensionsSettingsKey = nsTomlExtensionsSettingsSchema.path.join(".");

export function parseNsTomlExtensions(
	content: string,
	pathLabel = "ns.toml",
): NsTomlExtensionsParseResult {
	const result = parseProjectConfigToml(content, {
		pathLabel,
		pointsTable: { mode: "skip" },
		settingsSchemas: [nsTomlExtensionsSettingsSchema],
	});
	if (!result.ok) return nsTomlErrorFromDiagnostics(result.diagnostics, pathLabel);
	const extensions = getProjectConfigSetting(result.config, nsTomlExtensionsSettingsSchema);
	if (extensions === undefined) return { type: "missing" };
	return { type: "ok", extensions: [...extensions] };
}

function nsTomlErrorFromDiagnostics(
	diagnostics: readonly ProjectConfigDiagnostic[],
	pathLabel: string,
): { type: "error"; error: NsTomlErrorInfo } {
	const error = projectConfigErrorFromDiagnostics(diagnostics, {
		invalidToml: "invalid-toml",
		invalidSettingsByPath: {
			[nsInitExtensionsSettingsKey]: "invalid-extensions",
		},
		defaultCode: "invalid-toml",
		defaultMessage: `${pathLabel}: invalid ns.toml`,
		pathLabel,
	});
	return { type: "error", error: { code: error.code, message: error.message } };
}
