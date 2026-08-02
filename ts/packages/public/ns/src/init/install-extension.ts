import { join } from "node:path";

import type { CommandOutcome } from "@nseng-ai/clinkr/app";
import { failure, ok } from "@nseng-ai/clinkr/app";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import { ALL_HARNESS_IDS, parseNsTomlExtensions } from "../harness-artifacts/api.ts";
import { planDeclaredExtensionInstallToml } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import {
	completedUserArtifactEvidence,
	decideUserExtensionLifecycleGate,
	extensionLifecycleScopeSchemaValues,
	loadOneUserDescriptor,
	parseUserSupportedHarnessesFacts,
	prepareUserConfig,
	prepareUserExtensionSource,
	summarizeDormantUserContributions,
	summarizeUserArtifactActions,
	userArtifactPreflightBlockers,
	type UserExtensionAvailabilityContext,
	type UserExtensionLifecycleContext,
} from "./user-extension-lifecycle.ts";

import { applyNsActivation, prepareNsActivation } from "./activate-ns.ts";
import {
	activationCompletedSchema,
	declaredArtifactActivationOutcomeSchema,
} from "./activation-outcomes.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type {
	ExtensionInstallAcquisitionGateway,
	ExtensionUninstallAcquisitionGateway,
} from "./extension-acquisition.ts";
import {
	extensionLifecycleFailure,
	prepareExtensionLifecycle,
} from "./extension-lifecycle-preflight.ts";
import {
	normalizeExtensionDiagnostic,
	normalizeExtensionDiagnostics,
} from "./diagnostic-collection.ts";
import {
	createLifecycleRecorder,
	lifecycleStepSchema,
	renderLifecycleMarkdown,
	type LifecycleDiagnostic,
} from "./lifecycle-observability.ts";

export interface ExtensionInstallContext
	extends NsActivationContext, UserExtensionLifecycleContext, UserExtensionAvailabilityContext {
	readonly installAcquisition: ExtensionInstallAcquisitionGateway;
	readonly uninstallAcquisition: ExtensionUninstallAcquisitionGateway;
}

export const installExtensionRequestSchema = z.object({
	source: z
		.string()
		.min(1)
		.describe("npm: package spec or unprefixed local extension package path."),
	scope: z.enum(extensionLifecycleScopeSchemaValues).default("project"),
});

const installExtensionSourceResultSchema = z.object({
	sourceSpec: z.string(),
	sourceKind: z.enum(["local", "npm"]),
	packageName: z.string(),
	packageVersion: z.string(),
	moduleRoot: z.string(),
});
export const installExtensionResultSchema = z.discriminatedUnion("scope", [
	installExtensionSourceResultSchema.extend({
		scope: z.literal("project"),
		configPath: z.string(),
		nsTomlPath: z.string(),
		isRecorded: z.boolean(),
		repoRoot: z.string(),
		trunkBranch: z.string(),
		harnesses: z.array(z.enum(ALL_HARNESS_IDS)),
		completed: activationCompletedSchema,
		steps: z.array(lifecycleStepSchema).readonly(),
	}),
	installExtensionSourceResultSchema.extend({
		scope: z.literal("user"),
		configPath: z.string(),
		declarationAction: z.enum(["appended", "unchanged"]),
		acquisitionOutcome: z.enum(["installed", "unchanged", "local-in-place"]),
		commandAvailability: z.enum(["available", "unavailable"]),
		configuredHarnesses: z.array(z.enum(ALL_HARNESS_IDS)).readonly(),
		userExtensionLayer: z.object({
			enabled: z.boolean(),
			activeHarness: z.enum(ALL_HARNESS_IDS).optional(),
			reason: z.string().optional(),
		}),
		artifacts: z.array(declaredArtifactActivationOutcomeSchema).readonly(),
		dormantContributions: z.object({
			instructionModuleCount: z.number().int().nonnegative(),
			consumerDirCount: z.number().int().nonnegative(),
		}),
		activation: z.literal("not-performed"),
	}),
]);

export type InstallExtensionRequest = z.input<typeof installExtensionRequestSchema> & {
	readonly cwd: string;
};
export type InstallExtensionResult = z.infer<typeof installExtensionResultSchema>;

export async function installExtension(
	context: ExtensionInstallContext,
	request: InstallExtensionRequest,
): Promise<CommandOutcome<InstallExtensionResult>> {
	if (request.scope === "user") return installUserExtension(context, request);
	const recorder = createLifecycleRecorder(context.lifecycleTrace);
	function tracedFailure<TData extends object>(options: {
		readonly diagnostic: LifecycleDiagnostic;
		readonly errorType: string;
		readonly message: string;
		readonly data: TData;
	}): CommandOutcome<InstallExtensionResult> {
		recorder.fail(options.diagnostic);
		return failure(options.errorType, options.message, {
			...options.data,
			steps: recorder.steps(),
		});
	}

	const preflight = await prepareExtensionLifecycle(context, request, recorder);
	if (preflight.type === "failed")
		return extensionLifecycleFailure("install", preflight.failure, recorder);
	const { repository, repoRoot, trunkBranch, nsTomlContent, harnesses } = preflight.prepared;

	const declaration = planDeclaredExtensionInstallToml({
		projectRoot: repoRoot,
		nsTomlContent,
		requestedSpec: request.source,
	});
	if (!declaration.ok) {
		const diagnostic = {
			code: declaration.reason,
			message: declaration.message,
			path: "ns.toml",
		};
		if (declaration.reason === "identity-conflict") {
			return tracedFailure({
				diagnostic,
				errorType: "ns-extension-install-identity-conflict",
				message: declaration.message,
				data: {
					phase: "preflight",
					requestedSpec: declaration.requestedSpec,
					existingSpecs: [...declaration.existingSpecs],
					identity: declaration.identity,
					completed: {},
				},
			});
		}
		return tracedFailure({
			diagnostic,
			errorType: "ns-extension-install-config-invalid",
			message: declaration.message,
			data: {
				phase: "preflight",
				diagnostics: normalizeExtensionDiagnostics([diagnostic]),
				completed: {},
			},
		});
	}
	recorder.record({
		type: "declaration-decided",
		sourceSpec: request.source,
		nsTomlPath: join(repoRoot, "ns.toml"),
		action: declaration.isAdded ? "appended" : "unchanged",
	});
	recorder.beginPhase("acquisition");

	const acquired = await context.installAcquisition.ensure({
		repoRoot,
		sourceSpec: request.source,
	});
	if (!acquired.ok) {
		const diagnostic = acquired.diagnostics[0] ?? {
			code: "acquisition-failed",
			message: `Could not acquire extension ${request.source}.`,
		};
		return tracedFailure({
			diagnostic: normalizeExtensionDiagnostic(diagnostic),
			errorType: "ns-extension-install-acquisition-failed",
			message: diagnostic.message,
			data: {
				phase: "acquisition",
				diagnostics: normalizeExtensionDiagnostics(acquired.diagnostics),
				completed: {},
			},
		});
	}
	recorder.record({
		type: "acquisition-decided",
		sourceSpec: request.source,
		sourceKind: acquired.sourceKind,
		intent: acquired.sourceKind === "local" ? "local-in-place" : "install",
		outcome: acquired.outcome,
		moduleRoot: acquired.moduleRoot,
	});
	recorder.beginPhase("activation-preflight");

	const prepared = await prepareNsActivation(
		context,
		{
			repository,
			harnesses,
			harnessSource: "ns-toml",
			nsTomlContent: declaration.text,
			nsTomlChange: declaration.isAdded ? "appended" : "unchanged",
			nsTomlExpected: { type: "file", content: nsTomlContent },
		},
		recorder,
	);
	if (prepared.type === "preflight-failed") {
		const diagnostic = prepared.diagnostics[0] ?? {
			code: "activation-preflight-failed",
			message: "Extension activation preflight failed.",
		};
		return tracedFailure({
			diagnostic,
			errorType: "ns-extension-install-preflight-failed",
			message: "Extension activation preflight failed; no project files were written.",
			data: {
				phase: "preflight",
				diagnostics: normalizeExtensionDiagnostics(prepared.diagnostics),
				completed: {},
			},
		});
	}
	const selected = prepared.activation.descriptors.find(
		(descriptor) => descriptor.spec === request.source,
	);
	if (selected === undefined) {
		const diagnostic = {
			code: "extension-descriptor-not-selected",
			message: `No validated descriptor was selected for ${request.source}.`,
		};
		return tracedFailure({
			diagnostic,
			errorType: "ns-extension-install-preflight-failed",
			message: `The acquired extension descriptor was not selected for ${request.source}.`,
			data: {
				phase: "preflight",
				diagnostics: normalizeExtensionDiagnostics([diagnostic]),
				completed: {},
			},
		});
	}
	recorder.beginPhase("activation-apply");
	const applied = await applyNsActivation(context, prepared.activation, recorder);
	if (applied.type === "apply-failed") {
		return tracedFailure({
			diagnostic: applied.error,
			errorType: "ns-extension-install-apply-failed",
			message: applied.error.message,
			data: {
				phase: applied.phase,
				error: normalizeExtensionDiagnostic(applied.error),
				completed: applied.completed,
			},
		});
	}
	recorder.complete();
	return ok({
		scope: "project",
		sourceSpec: request.source,
		sourceKind: selected.sourceKind,
		packageName: selected.packageName,
		packageVersion: selected.version,
		moduleRoot: selected.moduleRoot,
		configPath: join(repoRoot, "ns.toml"),
		nsTomlPath: join(repoRoot, "ns.toml"),
		isRecorded: declaration.isAdded,
		repoRoot,
		trunkBranch,
		harnesses: [...harnesses],
		completed: applied.completed,
		steps: recorder.steps(),
	});
}

async function installUserExtension(
	context: ExtensionInstallContext,
	request: InstallExtensionRequest,
): Promise<CommandOutcome<InstallExtensionResult>> {
	const source = prepareUserExtensionSource<InstallExtensionResult>({
		context,
		cwd: request.cwd,
		source: request.source,
		operation: "install",
	});
	if (!source.ok) return source.exit;
	const prepared = await prepareUserConfig<InstallExtensionResult>(context, "install");
	if ("status" in prepared) return prepared;
	const supportedHarnesses = parseUserSupportedHarnessesFacts(
		prepared.content,
		prepared.configPath,
	);
	if (supportedHarnesses.type === "invalid")
		return failure("ns-extension-install-user-config-invalid", supportedHarnesses.error.message, {
			scope: "user",
			diagnostics: [supportedHarnesses.error],
		});
	const declaration = planDeclaredExtensionInstallToml({
		projectRoot: prepared.configDir,
		nsTomlContent: prepared.content,
		requestedSpec: source.sourceSpec,
	});
	if (!declaration.ok)
		return failure(`ns-extension-install-user-${declaration.reason}`, declaration.message, {
			scope: "user",
			...declaration,
		});
	const parsedPlanned = parseNsTomlExtensions(declaration.text, prepared.configPath);
	if (parsedPlanned.type === "error")
		return failure("ns-extension-install-user-config-invalid", parsedPlanned.error.message, {
			scope: "user",
			diagnostics: [parsedPlanned.error],
		});
	let acquisitionOutcome: "installed" | "unchanged" | "local-in-place" = "local-in-place";
	let createdPackageProject = false;
	if (source.source.kind === "npm") {
		if (context.userManagedNpmStorage.type !== "available")
			throw new Error("User npm storage became unavailable after source preparation.");
		const acquired = await context.installAcquisition.ensure({
			repoRoot: prepared.configDir,
			sourceSpec: source.sourceSpec,
			managedNpmStorage: context.userManagedNpmStorage.storage,
		});
		if (!acquired.ok)
			return failure(
				"ns-extension-install-user-acquisition-failed",
				acquired.diagnostics[0]?.message ?? `Could not acquire ${source.sourceSpec}.`,
				{
					scope: "user",
					diagnostics: normalizeExtensionDiagnostics(acquired.diagnostics),
				},
			);
		acquisitionOutcome = acquired.outcome;
		createdPackageProject = acquired.createdPackageProject;
	}
	const loaded = await loadOneUserDescriptor<InstallExtensionResult>({
		context,
		configDir: prepared.configDir,
		sourceSpec: source.sourceSpec,
		operation: "install",
	});
	if (!loaded.ok) {
		if (source.source.kind === "npm" && createdPackageProject) {
			return rollbackUserInstall(context, source.source.packageName, loaded.exit);
		}
		return loaded.exit;
	}
	const plannedSpecs = parsedPlanned.type === "missing" ? [] : parsedPlanned.extensions;
	const availability = await context.userExtensionAvailability.evaluate({
		configDir: prepared.configDir,
		sourceSpecs: plannedSpecs,
	});
	const requestedAvailability = availability.find((fact) => fact.sourceSpec === source.sourceSpec);
	if (requestedAvailability?.availability !== "available") {
		const primary = failure(
			"ns-extension-install-user-package-unavailable",
			`User extension package is not fully available: ${source.sourceSpec}.`,
			{
				scope: "user",
				sourceSpec: source.sourceSpec,
				diagnostics: requestedAvailability?.diagnostics ?? [],
			},
		);
		return source.source.kind === "npm" && createdPackageProject
			? rollbackUserInstall(context, source.source.packageName, primary)
			: primary;
	}
	const preparedArtifacts = await context.userArtifacts.prepare({
		cwd: request.cwd,
		descriptors: [loaded.descriptor],
		configuredHarnesses: supportedHarnesses.harnesses,
		targetPackageNames: [loaded.descriptor.packageName],
	});
	if (!preparedArtifacts.ok) {
		const primary = failure(
			"ns-extension-install-user-artifact-preflight-failed",
			preparedArtifacts.error.message,
			{
				scope: "user",
				declarationCompleted: false,
				diagnostics: [normalizeExtensionDiagnostic(preparedArtifacts.error)],
			},
		);
		if (source.source.kind === "npm" && createdPackageProject)
			return rollbackUserInstall(context, source.source.packageName, primary);
		return primary;
	}
	const blockers = userArtifactPreflightBlockers(preparedArtifacts.prepared);
	if (blockers.length > 0) {
		const primary = failure(
			"ns-extension-install-user-artifact-preflight-failed",
			blockers[0]?.message ?? "User artifact preflight failed.",
			{ scope: "user", declarationCompleted: false, diagnostics: blockers },
		);
		if (source.source.kind === "npm" && createdPackageProject)
			return rollbackUserInstall(context, source.source.packageName, primary);
		return primary;
	}
	if (declaration.isAdded) {
		const written = await context.userExtensionConfig.compareAndWrite({
			expected: prepared.expected,
			content: declaration.text,
		});
		if (!written.ok) {
			const primary = failure(
				"ns-extension-install-user-config-write-failed",
				written.error.message,
				{ scope: "user", error: written.error },
			);
			if (source.source.kind === "npm" && createdPackageProject) {
				return rollbackUserInstall(context, source.source.packageName, primary);
			}
			return primary;
		}
	}
	const applied = await context.userArtifacts.apply(preparedArtifacts.prepared);
	if (!applied.ok)
		return failure("ns-extension-install-user-artifact-apply-failed", applied.error.message, {
			scope: "user",
			declarationCompleted: true,
			declarationAction: declaration.isAdded ? "appended" : "unchanged",
			acquisitionOutcome,
			completedArtifacts: completedUserArtifactEvidence(applied.completed),
			diagnostics: [normalizeExtensionDiagnostic(applied.error)],
			retryGuidance: `Re-run ns extension update --scope user ${source.sourceSpec} to retry the remaining artifact transitions.`,
		});
	const gate = decideUserExtensionLifecycleGate({ env: context.env, supportedHarnesses });
	return ok({
		scope: "user",
		sourceSpec: source.sourceSpec,
		sourceKind: source.source.kind === "npm" ? "npm" : "local",
		packageName: loaded.descriptor.packageName,
		packageVersion: loaded.descriptor.version,
		moduleRoot: loaded.descriptor.moduleRoot,
		configPath: prepared.configPath,
		declarationAction: declaration.isAdded ? "appended" : "unchanged",
		acquisitionOutcome,
		commandAvailability: gate.enabled ? "available" : "unavailable",
		configuredHarnesses: [...supportedHarnesses.harnesses],
		userExtensionLayer: gate.enabled
			? { enabled: true, activeHarness: gate.activeHarness }
			: { enabled: false, reason: gate.reason.type },
		artifacts: completedUserArtifactEvidence(applied.completed),
		dormantContributions: summarizeDormantUserContributions([loaded.descriptor]),
		activation: "not-performed",
	});
}

async function rollbackUserInstall(
	context: ExtensionInstallContext,
	packageName: string,
	primary: CommandOutcome<InstallExtensionResult>,
): Promise<CommandOutcome<InstallExtensionResult>> {
	if (context.userManagedNpmStorage.type !== "available")
		throw new Error("User npm storage became unavailable during rollback.");
	const cleanup = await context.uninstallAcquisition.removeManagedNpmPackage({
		storage: context.userManagedNpmStorage.storage,
		packageName,
	});
	if (cleanup.ok) return primary;
	return failure(
		"ns-extension-install-user-rollback-failed",
		`Extension installation failed and newly installed managed bytes could not be removed: ${cleanup.error.message}`,
		{
			scope: "user",
			primaryFailure: primary,
			cleanupDiagnostic: normalizeExtensionDiagnostic(cleanup.error),
			...optionalEntry("retainedPath", cleanup.error.path),
		},
	);
}

export function renderInstallExtensionMarkdown(result: InstallExtensionResult): string {
	if (result.scope === "user")
		return `Installed ${result.packageName}@${result.packageVersion} at user scope in ${result.configPath}; acquisition: ${result.acquisitionOutcome}; bundled artifacts: ${summarizeUserArtifactActions(result.artifacts)}; user layer: ${result.userExtensionLayer.enabled ? "enabled" : "disabled"}; no project activation ran.`;
	return renderLifecycleMarkdown(
		"ns extension install",
		`Installed ${result.packageName}@${result.packageVersion}.`,
		result.steps,
	);
}

export function renderInstallExtensionHuman(result: InstallExtensionResult): string {
	if (result.scope === "user")
		return [
			`Installed ${result.packageName}@${result.packageVersion} at user scope from ${result.sourceSpec}.`,
			`Acquisition: ${result.acquisitionOutcome}.`,
			`Declaration: ${result.declarationAction} in ${result.configPath}.`,
			`Bundled artifacts: ${summarizeUserArtifactActions(result.artifacts)} for ${result.configuredHarnesses.join(", ") || "no configured harnesses"}.`,
			`User extension layer: ${result.userExtensionLayer.enabled ? "enabled" : `disabled (${result.userExtensionLayer.reason ?? "unknown"})`}.`,
			`Dormant contributions: ${result.dormantContributions.instructionModuleCount} instruction block(s), ${result.dormantContributions.consumerDirCount} consumer directory declaration(s).`,
			"No project activation was performed.",
		].join("\n");
	const declaration = result.isRecorded ? "recorded in" : "already present in";
	const artifactCount = result.completed.artifacts?.length ?? 0;
	const outcome = result.isRecorded ? "Installed" : "Ensured already-present";
	return [
		`${outcome} ${result.packageName}@${result.packageVersion} from ${result.sourceSpec}.`,
		`Module root: ${result.moduleRoot}`,
		`Declaration: ${declaration} ${result.nsTomlPath}`,
		`Activated ${artifactCount} artifact${artifactCount === 1 ? "" : "s"} for ${result.harnesses.join(", ")}.`,
	].join("\n");
}
