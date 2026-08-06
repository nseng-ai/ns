import { failure, type CommandOutcome } from "@nseng-ai/clinkr/app";
import {
	classifyExtensionSourceLifecycle,
	managedNpmPackagePaths,
	type ExtensionSourceSpec,
	type ManagedNpmStorage,
} from "@nseng-ai/sdk/project-config";
import { decideUserExtensionLayer } from "@nseng-ai/sdk/extensions/user-extension-layer";
import {
	ALL_HARNESS_IDS,
	validateSupportedHarnesses,
	type HarnessId,
} from "@nseng-ai/sdk/project-config/harness-identity";
import {
	getProjectConfigSetting,
	parseProjectConfigToml,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

import type {
	DeclaredExtensionsGateway,
	UserExtensionAvailabilityGateway,
} from "./declared-extensions.ts";
import type {
	ExpectedUserExtensionConfigState,
	UserExtensionConfigGateway,
} from "./user-extension-config.ts";
import type {
	DeclaredArtifactActivationOutcome,
	PreparedDeclaredArtifactActivation,
} from "../harness-artifacts/api.ts";
import type { UserArtifactActivationGateway } from "./user-artifact-activation.ts";

export const extensionLifecycleScopeSchemaValues = ["project", "user"] as const;
export type ExtensionLifecycleScope = (typeof extensionLifecycleScopeSchemaValues)[number];

export type UserManagedNpmStorageResolution =
	| { readonly type: "available"; readonly storage: ManagedNpmStorage }
	| {
			readonly type: "unavailable";
			readonly diagnostic: {
				readonly code: "user-managed-npm-storage-unavailable";
				readonly message: string;
			};
	  };

export interface UserExtensionLifecycleContext {
	readonly env?: Record<string, string | undefined>;
	readonly userExtensionConfig: UserExtensionConfigGateway;
	readonly declaredExtensions: DeclaredExtensionsGateway;
	readonly userManagedNpmStorage: UserManagedNpmStorageResolution;
	readonly userArtifacts: UserArtifactActivationGateway;
}

export type UserSupportedHarnessesFacts =
	| { readonly type: "configured"; readonly harnesses: readonly HarnessId[] }
	| { readonly type: "missing"; readonly harnesses: readonly [] }
	| {
			readonly type: "invalid";
			readonly harnesses: readonly [];
			readonly error: { readonly code: string; readonly message: string; readonly path: string };
	  };

const userSupportedHarnessesSettingsSchema = {
	path: ["supported_harnesses"] as const,
	schema: z.array(z.string()),
	invalidMessage: ({ pathLabel }) =>
		`${pathLabel} top-level supported_harnesses must be a string array of canonical harness ids (${ALL_HARNESS_IDS.join(", ")}).`,
} satisfies SettingsSchema<readonly string[]>;

/** Parse lifecycle gate facts without changing the byte-oriented config editing path. */
export function parseUserSupportedHarnessesFacts(
	content: string,
	configPath: string,
): UserSupportedHarnessesFacts {
	const parsed = parseProjectConfigToml(content, {
		pathLabel: configPath,
		pointsTable: { mode: "skip" },
		settingsSchemas: [userSupportedHarnessesSettingsSchema],
	});
	const diagnostic = parsed.diagnostics.find((item) => item.severity === "error");
	if (parsed.config === undefined || diagnostic !== undefined) {
		return invalidUserSupportedHarnesses(
			configPath,
			diagnostic?.message ?? `${configPath}: invalid user extension configuration.`,
		);
	}
	const values = getProjectConfigSetting(parsed.config, userSupportedHarnessesSettingsSchema);
	if (values === undefined) return { type: "missing", harnesses: [] };
	const validated = validateSupportedHarnesses(values);
	if (validated.type === "invalid") {
		return invalidUserSupportedHarnesses(configPath, `${configPath}: ${validated.message}`);
	}
	return { type: "configured", harnesses: validated.harnesses };
}

/** Shared catalog/lifecycle gate reporting over already parsed lifecycle facts. */
export function decideUserExtensionLifecycleGate(options: {
	readonly env: Record<string, string | undefined> | undefined;
	readonly supportedHarnesses: UserSupportedHarnessesFacts;
}) {
	return decideUserExtensionLayer({
		env: options.env,
		supportedHarnesses:
			options.supportedHarnesses.type === "configured"
				? { type: "configured", harnesses: options.supportedHarnesses.harnesses }
				: { type: options.supportedHarnesses.type },
	});
}

export interface UserArtifactPreflightBlocker {
	readonly code: string;
	readonly message: string;
	readonly path?: string;
}

export function userArtifactPreflightBlockers(
	prepared: PreparedDeclaredArtifactActivation,
): readonly UserArtifactPreflightBlocker[] {
	const blockers: UserArtifactPreflightBlocker[] =
		prepared.selectedHarnesses.length === 0
			? []
			: prepared.diagnostics.map((diagnostic) => ({
					code: diagnostic.code.replaceAll("_", "-"),
					message: diagnostic.message,
					...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
				}));
	for (const collision of prepared.skippedCollisions) {
		blockers.push({
			code: "user-artifact-collision",
			message: `Artifact ${collision.kind} collision for ${collision.value}: ${collision.packages.join(", ")}.`,
		});
	}
	for (const item of prepared.reconciliation.items) {
		if (item.conflictingFiles.length === 0) continue;
		const artifactId =
			item.type === "remove" ? item.removal.entry.artifactId : item.pair.desired.artifact.id;
		const harness = item.type === "remove" ? item.removal.entry.harness : item.pair.harness;
		blockers.push({
			code: "user-artifact-conflict",
			message: `Artifact ${artifactId} conflicts with locally edited files for ${harness}: ${item.conflictingFiles.join(", ")}.`,
		});
	}
	return blockers;
}

export function completedUserArtifactEvidence(
	completed: readonly DeclaredArtifactActivationOutcome[],
): readonly DeclaredArtifactActivationOutcome[] {
	return completed.map((outcome) => ({ ...outcome }));
}

/** Project prepared transitions into the same evidence shape without applying them. */
export function plannedUserArtifactEvidence(
	prepared: PreparedDeclaredArtifactActivation,
): readonly DeclaredArtifactActivationOutcome[] {
	return prepared.artifacts.map((item) => {
		const transition = prepared.reconciliation.items.find(
			(candidate) => candidate.key === item.key,
		);
		if (transition === undefined)
			throw new Error(`Prepared User artifact transition is missing for ${item.key}.`);
		if (item.type === "remove") {
			return {
				key: item.key,
				action: item.action,
				artifactId: item.removal.entry.artifactId,
				skillName: item.removal.entry.provisionName,
				harness: item.removal.entry.harness,
				targetArtifactPath: item.removal.entry.targetArtifactPath,
				manifestPath: item.removal.manifestPath,
				writtenFiles: [],
				conflictingFiles: [...transition.conflictingFiles],
				removedFiles: [],
				removalReason: item.removal.reason,
			};
		}
		return {
			key: item.key,
			action: item.action,
			artifactId: item.artifact.id,
			skillName: item.artifact.skillName,
			harness: item.harness,
			targetArtifactPath: item.provision.plan.targetArtifactPath,
			manifestPath: item.provision.manifestPath,
			writtenFiles: [],
			conflictingFiles: [...transition.conflictingFiles],
		};
	});
}

export function describeUserConfiguredHarnesses(facts: {
	readonly supportedHarnessesState: "configured" | "missing";
	readonly configuredHarnesses: readonly HarnessId[];
}): string {
	return facts.supportedHarnessesState === "missing"
		? "no harnesses (user ns.toml sets no supported_harnesses)"
		: facts.configuredHarnesses.join(", ");
}

export function summarizeUserArtifactActions(
	artifacts: readonly { readonly action: string }[],
): string {
	if (artifacts.length === 0) return "none";
	const counts = new Map<string, number>();
	for (const artifact of artifacts)
		counts.set(artifact.action, (counts.get(artifact.action) ?? 0) + 1);
	return [...counts.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([action, count]) => `${count} ${action}`)
		.join(", ");
}

export function summarizeDormantUserContributions(
	descriptors: Awaited<ReturnType<DeclaredExtensionsGateway["load"]>>["descriptors"],
): { readonly instructionModuleCount: number; readonly consumerDirCount: number } {
	return {
		instructionModuleCount: descriptors.filter(
			(descriptor) => descriptor.descriptor.activation?.instructions !== undefined,
		).length,
		consumerDirCount: descriptors.reduce(
			(count, descriptor) => count + (descriptor.descriptor.activation?.consumerDirs?.length ?? 0),
			0,
		),
	};
}

function invalidUserSupportedHarnesses(
	configPath: string,
	message: string,
): Extract<UserSupportedHarnessesFacts, { readonly type: "invalid" }> {
	return {
		type: "invalid",
		harnesses: [],
		error: { code: "user-supported-harnesses-invalid", message, path: configPath },
	};
}

export interface UserExtensionAvailabilityContext {
	readonly userExtensionAvailability: UserExtensionAvailabilityGateway;
}

export interface PreparedUserConfig {
	readonly configPath: string;
	readonly configDir: string;
	readonly content: string;
	readonly expected: ExpectedUserExtensionConfigState;
}

export async function prepareUserConfig<TResult>(
	context: UserExtensionLifecycleContext,
	operation: string,
): Promise<PreparedUserConfig | CommandOutcome<TResult>> {
	const read = await context.userExtensionConfig.read();
	if (read.type === "error") {
		return failure(`ns-extension-${operation}-user-config-unavailable`, read.error.message, {
			scope: "user",
			diagnostics: [read.error],
		});
	}
	if (read.type === "not-file") {
		return failure(
			`ns-extension-${operation}-user-config-invalid`,
			`${read.configPath} exists but is not a file.`,
			{
				scope: "user",
				diagnostics: [
					{
						code: "user-config-not-file",
						message: `${read.configPath} exists but is not a file.`,
						path: read.configPath,
					},
				],
			},
		);
	}
	return {
		configPath: read.configPath,
		configDir: read.configDir,
		content: read.type === "file" ? read.content : "",
		expected: read.type === "file" ? { type: "file", content: read.content } : { type: "missing" },
	};
}

export function prepareUserExtensionSource<TResult>(options: {
	readonly context: UserExtensionLifecycleContext;
	readonly cwd: string;
	readonly source: string;
	readonly operation: string;
}):
	| { readonly ok: true; readonly sourceSpec: string; readonly source: ExtensionSourceSpec }
	| { readonly ok: false; readonly exit: CommandOutcome<TResult> } {
	const classified = classifyExtensionSourceLifecycle(options.cwd, options.source);
	if (classified.type === "supported-local") {
		return { ok: true, sourceSpec: classified.source.path, source: classified.source };
	}
	if (classified.type === "supported-npm") {
		if (options.context.userManagedNpmStorage.type === "available") {
			return { ok: true, sourceSpec: classified.source.raw, source: classified.source };
		}
		return {
			ok: false,
			exit: failure(
				`ns-extension-${options.operation}-user-managed-npm-storage-unavailable`,
				options.context.userManagedNpmStorage.diagnostic.message,
				{
					scope: "user",
					sourceSpec: options.source,
					diagnostic: options.context.userManagedNpmStorage.diagnostic,
				},
			),
		};
	}
	const message =
		classified.type === "invalid-npm" ? classified.diagnostic.message : classified.message;
	return {
		ok: false,
		exit: failure(`ns-extension-${options.operation}-user-source-invalid`, message, {
			scope: "user",
			sourceSpec: options.source,
			code: "user-extension-source-invalid",
		}),
	};
}

export async function loadOneUserDescriptor<TResult>(options: {
	readonly context: UserExtensionLifecycleContext;
	readonly configDir: string;
	readonly sourceSpec: string;
	readonly operation: string;
	readonly npmModuleRootOverride?: string;
}): Promise<
	| {
			readonly ok: true;
			readonly descriptor: Awaited<
				ReturnType<DeclaredExtensionsGateway["load"]>
			>["descriptors"][number];
	  }
	| { readonly ok: false; readonly exit: CommandOutcome<TResult> }
> {
	const loaded = await options.context.declaredExtensions.load({
		repoRoot: options.configDir,
		specs: [options.sourceSpec],
		localPathPolicy: "absolute-only",
		resolveNpmPackageRoot: (packageName, sourceSpec) =>
			sourceSpec === options.sourceSpec && options.npmModuleRootOverride !== undefined
				? options.npmModuleRootOverride
				: options.context.userManagedNpmStorage.type === "available"
					? managedNpmPackagePaths(options.context.userManagedNpmStorage.storage, packageName)
							.packageRoot
					: undefined,
	});
	const descriptor = loaded.descriptors[0];
	if (
		descriptor !== undefined &&
		descriptor.spec === options.sourceSpec &&
		loaded.descriptors.length === 1 &&
		loaded.diagnostics.length === 0
	) {
		return { ok: true, descriptor };
	}
	const diagnostic = loaded.diagnostics[0] ?? {
		severity: "error" as const,
		code: "extension-descriptor-status-unavailable",
		message: `No descriptor was returned for ${options.sourceSpec}.`,
		spec: options.sourceSpec,
	};
	return {
		ok: false,
		exit: failure(`ns-extension-${options.operation}-user-descriptor-invalid`, diagnostic.message, {
			scope: "user",
			sourceSpec: options.sourceSpec,
			diagnostics: loaded.diagnostics.length === 0 ? [diagnostic] : loaded.diagnostics,
		}),
	};
}
