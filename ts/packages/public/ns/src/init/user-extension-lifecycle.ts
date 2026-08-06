import { failure, type CommandOutcome } from "@nseng-ai/clinkr/app";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";
import type { UserExtensionLayerDecision } from "@nseng-ai/sdk/extensions/user-extension-layer";
import {
	classifyExtensionSourceLifecycle,
	managedNpmPackagePaths,
	type ExtensionSourceSpec,
	type ManagedNpmStorage,
} from "@nseng-ai/sdk/project-config";
import { ALL_HARNESS_IDS, type HarnessId } from "@nseng-ai/sdk/project-config/harness-identity";
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

export const userExtensionLayerStatusSchema = z.discriminatedUnion("enabled", [
	z.object({
		enabled: z.literal(true),
		activeHarness: z.enum(ALL_HARNESS_IDS),
	}),
	z.object({
		enabled: z.literal(false),
		reason: z.enum([
			"active-harness-unset",
			"active-harness-unknown",
			"user-config-unavailable",
			"supported-harnesses-missing",
			"supported-harnesses-invalid",
			"active-harness-unsupported",
		]),
	}),
]);
export type UserExtensionLayerStatus = z.infer<typeof userExtensionLayerStatusSchema>;

/** Convert the SDK gate decision to the lifecycle commands' public status. */
export function userExtensionLayerStatus(
	decision: UserExtensionLayerDecision,
): UserExtensionLayerStatus {
	return decision.enabled
		? { enabled: true, activeHarness: decision.activeHarness }
		: { enabled: false, reason: decision.reason.type };
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

export const dormantUserContributionsSchema = z.object({
	instructionModuleCount: z.number().int().nonnegative(),
	consumerDirCount: z.number().int().nonnegative(),
});
export type DormantUserContributions = z.infer<typeof dormantUserContributionsSchema>;

export function summarizeDormantUserContributions(
	descriptors: readonly DeclaredExtensionDescriptor[],
): DormantUserContributions {
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
			readonly descriptor: DeclaredExtensionDescriptor;
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
