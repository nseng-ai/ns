import { readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

import { z } from "zod";

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
	ALL_HARNESS_IDS,
	NS_HARNESS_ENV_VAR,
	resolveActiveHarness,
	validateSupportedHarnesses,
	type HarnessId,
} from "../project-config/harness-identity.ts";
import {
	managedNpmPackagePaths,
	userManagedNpmStorage,
} from "../project-config/managed-extension-paths.ts";
import {
	getProjectConfigSetting,
	nsTomlExtensionsSettingsSchema,
	parseProjectConfigToml,
	type SettingsSchema,
} from "../project-config/points.ts";

/**
 * One effective User extension layer selection (ADR 0055).
 *
 * This module owns the Active-harness gate, user `ns.toml` parsing, and
 * ADR 0053 source-identity suppression for user descriptor contributions.
 * Command and point catalogs both consume this result; neither re-derives
 * the gate, config parsing, or suppression independently.
 */

export type UserExtensionLayerDecision =
	| {
			enabled: true;
			activeHarness: HarnessId;
			supportedHarnesses: readonly HarnessId[];
	  }
	| { enabled: false; reason: UserExtensionLayerDisabledReason };

export type UserExtensionLayerDisabledReason =
	| { type: "active-harness-unset" }
	| { type: "active-harness-unknown"; value: string }
	| { type: "user-config-unavailable" }
	| { type: "supported-harnesses-missing"; activeHarness: HarnessId }
	| { type: "supported-harnesses-invalid"; activeHarness: HarnessId }
	| {
			type: "active-harness-unsupported";
			activeHarness: HarnessId;
			supportedHarnesses: readonly HarnessId[];
	  };

export interface UserExtensionLayerDiagnostic {
	code: string;
	message: string;
	path?: string;
}

export interface EffectiveUserExtensionLayer {
	decision: UserExtensionLayerDecision;
	userConfigPath?: string;
	/** Loaded user descriptors; empty whenever the layer is disabled. */
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

const userSupportedHarnessesSettingsSchema = {
	path: ["supported_harnesses"] as const,
	schema: z.array(z.string()),
	invalidMessage: ({ pathLabel }) =>
		`${pathLabel} top-level supported_harnesses must be a string array of canonical harness ids (${ALL_HARNESS_IDS.join(", ")}).`,
} satisfies SettingsSchema<readonly string[]>;

const nsTomlExtensionsSettingsKey = nsTomlExtensionsSettingsSchema.path.join(".");
const userSupportedHarnessesSettingsKey = userSupportedHarnessesSettingsSchema.path.join(".");

/**
 * Resolve the effective User extension layer for one invocation.
 *
 * The Active-harness gate is evaluated before any filesystem access: a
 * missing or blank `NS_HARNESS` short-circuits silently, and an unknown
 * value short-circuits with one actionable diagnostic. User descriptors are
 * loaded only when the gate enables the layer.
 */
export async function loadEffectiveUserExtensionLayer(
	options: LoadUserExtensionLayerOptions,
): Promise<EffectiveUserExtensionLayer> {
	const activeHarness = resolveActiveHarness(options.env);
	if (activeHarness.type === "unset") {
		return disabledLayer({ type: "active-harness-unset" });
	}
	if (activeHarness.type === "unknown") {
		return disabledLayer({ type: "active-harness-unknown", value: activeHarness.value }, [
			{
				code: "user_extension_layer_unknown_harness",
				message: `User extension configuration: ${NS_HARNESS_ENV_VAR}=${JSON.stringify(activeHarness.value)} is not a known harness. Known harness ids: ${ALL_HARNESS_IDS.join(", ")}.`,
			},
		]);
	}

	const env = mergeXdgHomeEnv({
		baseEnv: {},
		...optionalEntries({ env: options.env, xdgHomeDir: options.homeDir }),
	});
	const resolvedPath = resolveNsXdgPath({ kind: "config", env, segments: ["ns.toml"] });
	if (!resolvedPath.ok) {
		return disabledLayer({ type: "user-config-unavailable" }, [
			{
				code: "user_ns_toml_path_invalid",
				message: `User extension configuration: Could not resolve user ns.toml path.\n${resolvedPath.error.message}`,
			},
		]);
	}
	const userConfigPath = resolvedPath.value;

	const read = readUserConfigSource(userConfigPath);
	if (read.type === "missing") {
		return {
			...disabledLayer({
				type: "supported-harnesses-missing",
				activeHarness: activeHarness.harness,
			}),
			userConfigPath,
		};
	}
	if (read.type === "error") {
		return {
			...disabledLayer({ type: "user-config-unavailable" }, [read.diagnostic]),
			userConfigPath,
		};
	}

	const parsed = parseProjectConfigToml(read.source, {
		pathLabel: userConfigPath,
		pointsTable: { mode: "skip" },
		settingsSchemas: [nsTomlExtensionsSettingsSchema, userSupportedHarnessesSettingsSchema],
	});
	const configDiagnostics = parsed.diagnostics
		.filter((diagnostic) => diagnostic.severity === "error")
		.map((diagnostic) =>
			userConfigDiagnostic(diagnostic.code, diagnostic.message, diagnostic.path, userConfigPath),
		);
	if (parsed.config === undefined) {
		return {
			...disabledLayer({ type: "user-config-unavailable" }, configDiagnostics),
			userConfigPath,
		};
	}

	const declaredHarnesses = getProjectConfigSetting(
		parsed.config,
		userSupportedHarnessesSettingsSchema,
	);
	const settingsInvalid = parsed.diagnostics.some(
		(diagnostic) =>
			diagnostic.code === "settings_table_invalid" &&
			diagnostic.path === userSupportedHarnessesSettingsKey,
	);
	if (settingsInvalid) {
		return {
			...disabledLayer(
				{ type: "supported-harnesses-invalid", activeHarness: activeHarness.harness },
				configDiagnostics,
			),
			userConfigPath,
		};
	}
	if (declaredHarnesses === undefined) {
		return {
			...disabledLayer(
				{ type: "supported-harnesses-missing", activeHarness: activeHarness.harness },
				configDiagnostics,
			),
			userConfigPath,
		};
	}
	const supportedHarnesses = validateSupportedHarnesses(declaredHarnesses);
	if (supportedHarnesses.type === "invalid") {
		return {
			...disabledLayer(
				{ type: "supported-harnesses-invalid", activeHarness: activeHarness.harness },
				[
					...configDiagnostics,
					userConfigDiagnostic(
						"user_supported_harnesses_invalid",
						`${userConfigPath}: ${supportedHarnesses.message}`,
						undefined,
						userConfigPath,
					),
				],
			),
			userConfigPath,
		};
	}
	if (!supportedHarnesses.harnesses.includes(activeHarness.harness)) {
		return {
			...disabledLayer(
				{
					type: "active-harness-unsupported",
					activeHarness: activeHarness.harness,
					supportedHarnesses: supportedHarnesses.harnesses,
				},
				configDiagnostics,
			),
			userConfigPath,
		};
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
		decision: {
			enabled: true,
			activeHarness: activeHarness.harness,
			supportedHarnesses: supportedHarnesses.harnesses,
		},
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

function disabledLayer(
	reason: UserExtensionLayerDisabledReason,
	diagnostics: readonly UserExtensionLayerDiagnostic[] = [],
): EffectiveUserExtensionLayer {
	return {
		decision: { enabled: false, reason },
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
				: code === "settings_table_invalid" && path === userSupportedHarnessesSettingsKey
					? "user_supported_harnesses_invalid"
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
