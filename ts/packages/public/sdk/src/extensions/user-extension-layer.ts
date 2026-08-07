import { readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

import {
	formatErrorMessage,
	isNodeErrorCode,
	optionalEntries,
	type ExplicitUndefined,
} from "@nseng-ai/foundation/primitives";
import { mergeXdgHomeEnv, resolveNsXdgPath } from "@nseng-ai/foundation/xdg-path";

import {
	declaredExtensionSourceIdentity,
	loadDeclaredExtensionDescriptors,
	type DeclaredExtensionDescriptor,
} from "./declared-descriptors.ts";
import {
	managedNpmPackagePaths,
	userManagedNpmStorage,
} from "../project-config/managed-extension-paths.ts";
import {
	getProjectConfigSetting,
	nsTomlExtensionsSettingsSchema,
	parseProjectConfigToml,
} from "../project-config/points.ts";

/**
 * One User extension layer (ADR 0055).
 *
 * This module owns user `ns.toml` parsing and ADR 0053 source-identity
 * suppression for user descriptor contributions. Command and point catalogs
 * both consume this result; neither re-derives config parsing or suppression.
 */

export interface UserExtensionLayerDiagnostic {
	code: string;
	message: string;
	path?: string;
}

export interface UserExtensionLayer {
	userConfigPath?: string;
	descriptors: readonly DeclaredExtensionDescriptor[];
	declaredSourceIdentities: readonly string[];
	diagnostics: readonly UserExtensionLayerDiagnostic[];
}

export interface LoadUserExtensionLayerOptions {
	homeDir?: string;
	env?: ExplicitUndefined<"env-map", Record<string, string | undefined>>;
	/** Normalized project declaration identities that suppress matching user declarations (ADR 0053). */
	projectSourceIdentities: ReadonlySet<string>;
}

const nsTomlExtensionsSettingsKey = nsTomlExtensionsSettingsSchema.path.join(".");

/** Load User extension declarations for one invocation. */
export async function loadUserExtensionLayer(
	options: LoadUserExtensionLayerOptions,
): Promise<UserExtensionLayer> {
	const env = mergeXdgHomeEnv({
		baseEnv: {},
		...optionalEntries({ env: options.env, xdgHomeDir: options.homeDir }),
	});
	const resolvedPath = resolveNsXdgPath({ kind: "config", env, segments: ["ns.toml"] });
	if (!resolvedPath.ok) {
		return emptyLayer([
			{
				code: "user_ns_toml_path_invalid",
				message: `User extension configuration: Could not resolve user ns.toml path.\n${resolvedPath.error.message}`,
			},
		]);
	}
	const userConfigPath = resolvedPath.value;

	const read = readUserConfigSource(userConfigPath);
	if (read.type === "missing") {
		return { ...emptyLayer(), userConfigPath };
	}
	if (read.type === "error") {
		return { ...emptyLayer([read.diagnostic]), userConfigPath };
	}

	const parsed = parseProjectConfigToml(read.source, {
		pathLabel: userConfigPath,
		pointsTable: { mode: "skip" },
		settingsSchemas: [nsTomlExtensionsSettingsSchema],
	});
	const configDiagnostics = parsed.diagnostics
		.filter((diagnostic) => diagnostic.severity === "error")
		.map((diagnostic) =>
			userConfigDiagnostic(diagnostic.code, diagnostic.message, diagnostic.path, userConfigPath),
		);
	if (parsed.config === undefined) {
		return { ...emptyLayer(configDiagnostics), userConfigPath };
	}

	const declaredSpecs =
		getProjectConfigSetting(parsed.config, nsTomlExtensionsSettingsSchema) ?? [];
	const userConfigDir = dirname(userConfigPath);
	const activeSpecs = declaredSpecs.filter((spec) => {
		const identity = declaredExtensionSourceIdentity(userConfigDir, spec);
		return identity === undefined || !options.projectSourceIdentities.has(identity);
	});

	const extensionsDataRoot = resolveNsXdgPath({ kind: "data", env, segments: ["extensions"] });
	const dataPathDiagnostics: UserExtensionLayerDiagnostic[] = extensionsDataRoot.ok
		? []
		: [
				{
					code: "user_extensions_data_path_invalid",
					message: `User extension configuration: Could not resolve user extensions data path.\n${extensionsDataRoot.error.message}`,
				},
			];
	const resolveNpmPackageRoot = extensionsDataRoot.ok
		? (packageName: string) =>
				managedNpmPackagePaths(userManagedNpmStorage(extensionsDataRoot.value), packageName)
					.packageRoot
		: () => undefined;
	const loaded = await loadDeclaredExtensionDescriptors({
		repoRoot: userConfigDir,
		specs: activeSpecs,
		localPathPolicy: "absolute-only",
		resolveNpmPackageRoot,
	});
	return {
		userConfigPath,
		descriptors: loaded.descriptors,
		declaredSourceIdentities: activeSpecs.flatMap((spec) => {
			const identity = declaredExtensionSourceIdentity(userConfigDir, spec);
			return identity === undefined ? [] : [identity];
		}),
		diagnostics: [
			...configDiagnostics,
			...dataPathDiagnostics,
			...loaded.diagnostics.map((diagnostic) => ({
				code: diagnostic.code,
				message: `User extension configuration: ${diagnostic.message}`,
				path: diagnostic.path ?? userConfigPath,
			})),
		],
	};
}

function emptyLayer(diagnostics: readonly UserExtensionLayerDiagnostic[] = []): UserExtensionLayer {
	return {
		descriptors: [],
		declaredSourceIdentities: [],
		diagnostics,
	};
}

function userConfigDiagnostic(
	code: string,
	message: string,
	path: string | undefined,
	userConfigPath: string,
): UserExtensionLayerDiagnostic {
	return {
		code:
			code === "settings_table_invalid" && path === nsTomlExtensionsSettingsKey
				? "ns_toml_extensions_invalid"
				: code,
		message: `User extension configuration: ${message}`,
		path: userConfigPath,
	};
}

type UserConfigSourceRead =
	| { type: "found"; source: string }
	| { type: "missing" }
	| { type: "error"; diagnostic: UserExtensionLayerDiagnostic };

function readUserConfigSource(path: string): UserConfigSourceRead {
	let file;
	try {
		file = statSync(path);
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return { type: "missing" };
		return {
			type: "error",
			diagnostic: {
				code: "user_ns_toml_inspect_failed",
				message: `User extension configuration: Could not inspect ${path}.\n${formatErrorMessage(error)}`,
				path,
			},
		};
	}
	if (!file.isFile()) {
		return {
			type: "error",
			diagnostic: {
				code: "user_ns_toml_not_file",
				message: `User extension configuration: User ns.toml path is not a file: ${path}.`,
				path,
			},
		};
	}
	try {
		return { type: "found", source: readFileSync(path, "utf8") };
	} catch (error) {
		return {
			type: "error",
			diagnostic: {
				code: "user_ns_toml_read_failed",
				message: `User extension configuration: Could not read ${path}.\n${formatErrorMessage(error)}`,
				path,
			},
		};
	}
}
