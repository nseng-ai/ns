import {
	getProjectConfigSetting,
	loadEffectiveProjectConfig,
	parseProjectConfigToml,
	projectConfigErrorFromDiagnostics,
	type LoadedProjectConfig,
	type ProjectConfigDiagnostic,
	type ProjectConfigGateway,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { resultErrOf, type Result } from "@nseng-ai/foundation/result";
import { z } from "zod";

export interface SlotsProvisionConfig {
	readonly provision: readonly string[];
}

export interface SlotsProvisionConfigError {
	readonly code: SlotsProvisionConfigErrorCode;
	readonly message: string;
}

export type SlotsProvisionConfigErrorCode =
	| "invalid-toml"
	| "invalid-slots-table"
	| "invalid-provision"
	| "invalid-provision-path";

export type SlotsProvisionConfigParseResult = Result<
	SlotsProvisionConfig,
	SlotsProvisionConfigError
>;

const EMPTY_CONFIG: SlotsProvisionConfig = { provision: [] };

const GLOB_CHARACTERS = ["*", "?", "[", "]", "{", "}"] as const;

type SlotsSettingsRecord = Record<string, unknown>;

const recordSchema = z.record(z.string(), z.unknown());

const slotsSettingsSchema = {
	path: ["slots"] as const,
	schema: recordSchema,
	invalidMessage: ({ pathLabel }) => formatMessage("[slots] must be a TOML table.", pathLabel),
} satisfies SettingsSchema<SlotsSettingsRecord>;

const slotsSettingsKey = slotsSettingsSchema.path.join(".");

export function parseSlotsProvisionConfigToml(
	source: string,
	pathLabel?: string,
): SlotsProvisionConfigParseResult {
	const result = parseProjectConfigToml(source, {
		...(pathLabel === undefined ? {} : { pathLabel }),
		pointsTable: { mode: "skip" },
		settingsSchemas: [slotsSettingsSchema],
	});
	if (!result.ok) return parseErrorFromDiagnostics(result.diagnostics, pathLabel);
	return slotsProvisionConfigFromLoadedConfig(result.config, pathLabel);
}

export function loadSlotsProvisionConfig(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
}): SlotsProvisionConfigParseResult {
	const result = loadEffectiveProjectConfig({
		repoRoot: request.repoRoot,
		gateway: request.gateway,
		pointDefinitions: [],
		settingsSchemas: [slotsSettingsSchema],
	});
	if (!result.ok || result.config === undefined) {
		const sourcePath = result.diagnostics.find(
			(diagnostic) => diagnostic.severity === "error",
		)?.path;
		return parseErrorFromDiagnostics(result.diagnostics, sourcePath);
	}
	return slotsProvisionConfigFromLoadedConfig(result.config);
}

function slotsProvisionConfigFromLoadedConfig(
	config: LoadedProjectConfig,
	pathLabel?: string,
): SlotsProvisionConfigParseResult {
	const slotsSettings = getProjectConfigSetting(config, slotsSettingsSchema);
	if (slotsSettings === undefined) return { ok: true, value: EMPTY_CONFIG };
	const provision = slotsSettings.provision;
	if (provision === undefined) return { ok: true, value: EMPTY_CONFIG };
	return parseProvisionPaths(provision, pathLabel);
}

function parseProvisionPaths(
	value: unknown,
	pathLabel: string | undefined,
): SlotsProvisionConfigParseResult {
	if (!Array.isArray(value)) {
		return resultErrOf(
			"invalid-provision",
			formatMessage(
				"[slots].provision must be a TOML array of repo-relative file paths.",
				pathLabel,
			),
		);
	}
	const paths: string[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		if (typeof item !== "string") {
			return resultErrOf(
				"invalid-provision",
				formatMessage("[slots].provision must contain only strings.", pathLabel),
			);
		}
		const pathError = provisionPathError(item);
		if (pathError !== null) {
			return resultErrOf("invalid-provision-path", formatMessage(pathError, pathLabel));
		}
		if (seen.has(item)) {
			return resultErrOf(
				"invalid-provision-path",
				formatMessage(`[slots].provision contains duplicate entry '${item}'.`, pathLabel),
			);
		}
		seen.add(item);
		paths.push(item);
	}
	return { ok: true, value: { provision: paths } };
}

function provisionPathError(path: string): string | null {
	if (path === "") return "[slots].provision entries must be non-empty repo-relative file paths.";
	if (path.startsWith("/")) {
		return `[slots].provision entry '${path}' must be repo-relative, not absolute.`;
	}
	if (path.includes("\\")) {
		return `[slots].provision entry '${path}' must use forward slashes only.`;
	}
	if (path.endsWith("/")) {
		return `[slots].provision entry '${path}' must name a file, not a directory (no trailing slash).`;
	}
	const globCharacter = GLOB_CHARACTERS.find((character) => path.includes(character));
	if (globCharacter !== undefined) {
		return `[slots].provision entry '${path}' must be an exact file path (no glob character '${globCharacter}').`;
	}
	for (const segment of path.split("/")) {
		if (segment === "" || segment === "." || segment === "..") {
			return `[slots].provision entry '${path}' must not contain empty, '.', or '..' path segments.`;
		}
	}
	return null;
}

function parseErrorFromDiagnostics(
	diagnostics: readonly ProjectConfigDiagnostic[],
	pathLabel: string | undefined,
): SlotsProvisionConfigParseResult {
	const error = projectConfigErrorFromDiagnostics(diagnostics, {
		invalidToml: "invalid-toml",
		invalidSettingsByPath: { [slotsSettingsKey]: "invalid-slots-table" },
		defaultCode: "invalid-slots-table",
		defaultMessage: formatMessage("invalid ns.toml", pathLabel),
		...(pathLabel === undefined ? {} : { pathLabel }),
	});
	return resultErrOf(error.code, error.message);
}

function formatMessage(message: string, pathLabel: string | undefined): string {
	if (pathLabel === undefined) return message;
	return `${pathLabel}: ${message}`;
}
