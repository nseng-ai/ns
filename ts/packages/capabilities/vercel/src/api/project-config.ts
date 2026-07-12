import { resultErrOf, type Result } from "@nseng-ai/foundation/result";
import {
	getProjectConfigSetting,
	parseProjectConfigToml,
	projectConfigErrorFromDiagnostics,
	type ProjectConfigDiagnostic,
	type SettingsSchema,
} from "@nseng-ai/kernel/project-config/points";
import { z } from "zod";

export const dispatchHarnessValues = ["pi", "claude-code"] as const;

export type DispatchHarness = (typeof dispatchHarnessValues)[number];

export interface DispatchProjectConfig {
	readonly harness: DispatchHarness;
	readonly vercelProjectId: string;
	readonly vercelTeamId: string;
}

export interface DispatchProjectConfigError {
	readonly code: DispatchProjectConfigErrorCode;
	readonly message: string;
}

export type DispatchProjectConfigErrorCode =
	| "invalid-dispatch"
	| "invalid-toml"
	| "missing-dispatch";

export type DispatchProjectConfigParseResult = Result<
	DispatchProjectConfig,
	DispatchProjectConfigError
>;

const vercelProjectIdSchema = z
	.string()
	.regex(/^prj_[A-Za-z0-9]+$/, "must be a Vercel project ID beginning with 'prj_'");
const vercelTeamIdSchema = z
	.string()
	.regex(/^team_[A-Za-z0-9]+$/, "must be a Vercel team ID beginning with 'team_'");

const dispatchSettingsSchema = {
	path: ["dispatch"] as const,
	schema: z
		.strictObject({
			harness: z.enum(dispatchHarnessValues),
			vercel_project_id: vercelProjectIdSchema,
			vercel_team_id: vercelTeamIdSchema,
		})
		.transform(
			(settings): DispatchProjectConfig => ({
				harness: settings.harness,
				vercelProjectId: settings.vercel_project_id,
				vercelTeamId: settings.vercel_team_id,
			}),
		),
	invalidMessage: ({ pathLabel }) => `${pathLabel}: [dispatch] is invalid.`,
} satisfies SettingsSchema<DispatchProjectConfig>;

const SETTINGS_TABLE_ERROR_CODES = {
	dispatch: "invalid-dispatch",
} as const;

export function parseDispatchProjectConfigToml(
	source: string,
	pathLabel?: string,
): DispatchProjectConfigParseResult {
	const result = parseProjectConfigToml(source, {
		...(pathLabel === undefined ? {} : { pathLabel }),
		pointsTable: { mode: "skip" },
		settingsSchemas: [dispatchSettingsSchema],
	});
	if (!result.ok) return projectConfigParseErrorFromDiagnostics(result.diagnostics, pathLabel);

	const dispatchSettings = getProjectConfigSetting(result.config, dispatchSettingsSchema);
	if (dispatchSettings === undefined) {
		return resultErrOf("missing-dispatch", formatMessage("missing [dispatch] table", pathLabel));
	}
	return { ok: true, value: dispatchSettings };
}

function projectConfigParseErrorFromDiagnostics(
	diagnostics: readonly ProjectConfigDiagnostic[],
	pathLabel: string | undefined,
): DispatchProjectConfigParseResult {
	const error = projectConfigErrorFromDiagnostics(diagnostics, {
		invalidToml: "invalid-toml",
		invalidSettingsByPath: SETTINGS_TABLE_ERROR_CODES,
		defaultCode: "invalid-dispatch",
		defaultMessage: formatMessage("invalid ns.toml dispatch configuration", pathLabel),
		...(pathLabel === undefined ? {} : { pathLabel }),
	});
	return resultErrOf(error.code, error.message);
}

function formatMessage(message: string, pathLabel: string | undefined): string {
	if (pathLabel === undefined) return message;
	return `${pathLabel}: ${message}`;
}
