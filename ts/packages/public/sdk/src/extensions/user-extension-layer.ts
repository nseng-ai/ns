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

export type UserSupportedHarnessesFacts =
	| { readonly type: "configured"; readonly harnesses: readonly HarnessId[] }
	| { readonly type: "missing"; readonly harnesses: readonly [] }
	| {
			readonly type: "invalid";
			readonly harnesses: readonly [];
			readonly error: {
				readonly code: "user-supported-harnesses-invalid";
				readonly message: string;
				readonly path: string;
			};
	  };

/** External shape of the top-level User `supported_harnesses` setting. */
export const userSupportedHarnessesSchema = z.array(z.string());

/** Convert one decoded setting into canonical, validated User-layer facts. */
export function userSupportedHarnessesFactsFromSetting(
	values: readonly string[] | undefined,
	configPath: string,
): UserSupportedHarnessesFacts {
	if (values === undefined) return { type: "missing", harnesses: [] };
	const validated = validateSupportedHarnesses(values);
	if (validated.type === "invalid") {
		return invalidUserSupportedHarnessesFacts(configPath, `${configPath}: ${validated.message}`);
	}
	return { type: "configured", harnesses: validated.harnesses };
}

type UserSupportedHarnessesDecisionInput =
	| UserSupportedHarnessesFacts
	| { readonly type: "missing" | "invalid" };

/** Decide contribution visibility from already parsed facts; performs no I/O. */
export function decideUserExtensionLayer(options: {
	readonly env: Record<string, string | undefined> | undefined;
	readonly supportedHarnesses: UserSupportedHarnessesDecisionInput;
}): UserExtensionLayerDecision {
	const activeHarness = resolveActiveHarness(options.env);
	if (activeHarness.type === "unset") {
		return { enabled: false, reason: { type: "active-harness-unset" } };
	}
	if (activeHarness.type === "unknown") {
		return {
			enabled: false,
			reason: { type: "active-harness-unknown", value: activeHarness.value },
		};
	}
	if (options.supportedHarnesses.type !== "configured") {
		return {
			enabled: false,
			reason: {
				type:
					options.supportedHarnesses.type === "missing"
						? "supported-harnesses-missing"
						: "supported-harnesses-invalid",
				activeHarness: activeHarness.harness,
			},
		};
	}
	if (!options.supportedHarnesses.harnesses.includes(activeHarness.harness)) {
		return {
			enabled: false,
			reason: {
				type: "active-harness-unsupported",
				activeHarness: activeHarness.harness,
				supportedHarnesses: options.supportedHarnesses.harnesses,
			},
		};
	}
	return {
		enabled: true,
		activeHarness: activeHarness.harness,
		supportedHarnesses: options.supportedHarnesses.harnesses,
	};
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

export const userSupportedHarnessesSettingsSchema = {
	path: ["supported_harnesses"] as const,
	schema: userSupportedHarnessesSchema,
	invalidMessage: ({ pathLabel }) =>
		`${pathLabel} top-level supported_harnesses must be a string array of canonical harness ids (${ALL_HARNESS_IDS.join(", ")}).`,
} satisfies SettingsSchema<readonly string[]>;

const nsTomlExtensionsSettingsKey = nsTomlExtensionsSettingsSchema.path.join(".");
const userSupportedHarnessesSettingsKey = userSupportedHarnessesSettingsSchema.path.join(".");

/** Parse User `supported_harnesses` facts from an `ns.toml` source. */
export function parseUserSupportedHarnessesFacts(
	source: string,
	configPath: string,
): UserSupportedHarnessesFacts {
	const parsed = parseProjectConfigToml(source, {
		pathLabel: configPath,
		pointsTable: { mode: "skip" },
		settingsSchemas: [userSupportedHarnessesSettingsSchema],
	});
	const diagnostic = parsed.diagnostics.find((item) => item.severity === "error");
	if (parsed.config === undefined || diagnostic !== undefined) {
		return invalidUserSupportedHarnessesFacts(
			configPath,
			diagnostic?.message ?? `${configPath}: invalid user extension configuration.`,
		);
	}
	return userSupportedHarnessesFactsFromSetting(
		getProjectConfigSetting(parsed.config, userSupportedHarnessesSettingsSchema),
		configPath,
	);
}

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
		const decision = decideUserExtensionLayer({
			env: options.env,
			supportedHarnesses: { type: "missing", harnesses: [] },
		});
		if (decision.enabled)
			throw new Error("Missing Supported harness facts enabled the User layer.");
		return { ...disabledLayer(decision.reason), userConfigPath };
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
		const invalidFacts = invalidUserSupportedHarnessesFacts(
			userConfigPath,
			configDiagnostics[0]?.message ?? `${userConfigPath}: invalid user extension configuration.`,
		);
		const decision = decideUserExtensionLayer({
			env: options.env,
			supportedHarnesses: invalidFacts,
		});
		if (decision.enabled)
			throw new Error("Invalid Supported harness facts enabled the User layer.");
		return {
			...disabledLayer(decision.reason, [invalidFacts.error, ...configDiagnostics]),
			userConfigPath,
		};
	}

	const settingsDiagnostic = parsed.diagnostics.find(
		(diagnostic) =>
			diagnostic.code === "settings_table_invalid" &&
			diagnostic.path === userSupportedHarnessesSettingsKey,
	);
	const supportedHarnesses =
		settingsDiagnostic === undefined
			? userSupportedHarnessesFactsFromSetting(
					getProjectConfigSetting(parsed.config, userSupportedHarnessesSettingsSchema),
					userConfigPath,
				)
			: invalidUserSupportedHarnessesFacts(userConfigPath, settingsDiagnostic.message);
	const decision = decideUserExtensionLayer({ env: options.env, supportedHarnesses });
	if (!decision.enabled) {
		const factDiagnostics =
			supportedHarnesses.type === "invalid"
				? [
						{
							...supportedHarnesses.error,
							message: `User extension configuration: ${supportedHarnesses.error.message}`,
						},
					]
				: [];
		return {
			...disabledLayer(decision.reason, [...factDiagnostics, ...configDiagnostics]),
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
		decision,
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

function invalidUserSupportedHarnessesFacts(
	configPath: string,
	message: string,
): Extract<UserSupportedHarnessesFacts, { readonly type: "invalid" }> {
	return {
		type: "invalid",
		harnesses: [],
		error: {
			code: "user-supported-harnesses-invalid",
			message,
			path: configPath,
		},
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
					? "user-supported-harnesses-invalid"
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
