import { resultErrOf, type Result } from "@nseng-ai/foundation/result";
import {
	getProjectConfigSetting,
	parseProjectConfigToml,
	projectConfigErrorFromDiagnostics,
	type ProjectConfigDiagnostic,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

import { vercelProjectIdSchema, vercelTeamIdSchema } from "../auth/contracts.ts";
import { isDispatchHarness, type DispatchHarness } from "../dispatch/harness-registry.ts";

/**
 * Local dispatch-client configuration. This intentionally supersets the
 * server's required Vercel identity fields with harness and deployment URL
 * settings needed only to validate and initiate a local dispatch.
 */
export interface DispatchProjectConfig {
	readonly harness: DispatchHarness;
	readonly vercelProjectId: string;
	readonly vercelTeamId: string;
	/**
	 * The dispatch deployable's stable HTTPS URL (the deployment recorded by
	 * the README's Setup section). The local CLI calls the authenticated
	 * trigger/observe routes on it. Optional in the schema so preflight can
	 * report its absence as an actionable named failure rather than a generic
	 * invalid-table parse error.
	 */
	readonly deploymentUrl?: string;
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

const deploymentUrlSchema = z
	.url()
	.refine(isCredentialFreeHttpsUrl, "must be an explicit HTTPS URL without embedded credentials");

function isCredentialFreeHttpsUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	return url.protocol === "https:" && url.username === "" && url.password === "";
}

const dispatchSettingsSchema = {
	path: ["dispatch"] as const,
	schema: z
		.strictObject({
			harness: z.custom<DispatchHarness>(isDispatchHarness),
			vercel_project_id: vercelProjectIdSchema,
			vercel_team_id: vercelTeamIdSchema,
			deployment_url: deploymentUrlSchema.optional(),
		})
		.transform(
			(settings): DispatchProjectConfig => ({
				harness: settings.harness,
				vercelProjectId: settings.vercel_project_id,
				vercelTeamId: settings.vercel_team_id,
				...(settings.deployment_url === undefined
					? {}
					: { deploymentUrl: settings.deployment_url }),
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
	if (result.ok === false) {
		return projectConfigParseErrorFromDiagnostics(result.diagnostics, pathLabel);
	}

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
