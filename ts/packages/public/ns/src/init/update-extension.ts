import type { CommandOutcome } from "@nseng-ai/clinkr/app";
import { failure, ok } from "@nseng-ai/clinkr/app";
import {
	ALL_HARNESS_IDS,
	parseNsTomlExtensions,
	type PreparedDeclaredArtifactActivation,
} from "../harness-artifacts/api.ts";
import type { ExtensionAcquisitionDiagnostic } from "@nseng-ai/sdk/extensions/acquisition";
import type { DeclaredExtensionDescriptor } from "@nseng-ai/sdk/extensions/declared-descriptors";
import {
	decideUserExtensionLayer,
	parseUserSupportedHarnessesFacts,
	type UserSupportedHarnessesFacts,
} from "@nseng-ai/sdk/extensions/user-extension-layer";
import { planDeclaredExtensionTarget, type ManagedNpmStorage } from "@nseng-ai/sdk/project-config";
import type { HarnessId } from "@nseng-ai/sdk/project-config/harness-identity";
import { z } from "zod";

import {
	completedUserArtifactEvidence,
	describeUserConfiguredHarnesses,
	extensionLifecycleScopeSchemaValues,
	loadOneUserDescriptor,
	plannedUserArtifactEvidence,
	prepareUserConfig,
	prepareUserExtensionSource,
	summarizeUserArtifactActions,
	userArtifactPreflightBlockers,
	userExtensionLayerStatus,
	userExtensionLayerStatusSchema,
	type UserExtensionAvailabilityContext,
	type UserExtensionLayerStatus,
	type UserExtensionLifecycleContext,
} from "./user-extension-lifecycle.ts";

import {
	type ActivationDiagnostic,
	applyNsActivation,
	prepareNsActivation,
} from "./activate-ns.ts";
import {
	activationCompletedSchema,
	declaredArtifactActivationOutcomeSchema,
} from "./activation-outcomes.ts";
import type { NsActivationContext } from "./activation-context.ts";
import type {
	ExtensionUpdateAcquisitionGateway,
	PreviewExtensionUpdateSourceResult,
	ReconcileExtensionUpdateSourceResult,
} from "./extension-acquisition.ts";
import type {
	PreparedUserNpmUpdate,
	UserNpmUpdateAcquisitionGateway,
} from "./user-npm-update-acquisition.ts";
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
	type LifecycleRecorder,
} from "./lifecycle-observability.ts";

export interface ExtensionUpdateContext
	extends NsActivationContext, UserExtensionLifecycleContext, UserExtensionAvailabilityContext {
	readonly updateAcquisition: ExtensionUpdateAcquisitionGateway;
	readonly userNpmUpdateAcquisition: UserNpmUpdateAcquisitionGateway;
}

export const updateExtensionRequestSchema = z.object({
	source: z.string().min(1),
	dryRun: z.boolean().default(false),
	scope: z.enum(extensionLifecycleScopeSchemaValues).default("project"),
});
const updateExtensionSourceResultSchema = z.object({
	sourceSpec: z.string(),
	sourceKind: z.enum(["local", "npm"]),
	mode: z.enum(["dry-run", "applied"]),
});
export const updateExtensionResultSchema = z.discriminatedUnion("scope", [
	updateExtensionSourceResultSchema.extend({
		scope: z.literal("project"),
		acquisitionIntent: z.enum(["refresh-floating", "ensure-pinned", "local-in-place"]),
		acquisitionOutcome: z.enum(["planned", "refreshed", "restored", "unchanged", "not-applicable"]),
		prospectiveEffects: z.enum(["available", "unavailable"]),
		repoRoot: z.string(),
		trunkBranch: z.string(),
		harnesses: z.array(z.enum(ALL_HARNESS_IDS)),
		completed: activationCompletedSchema,
		steps: z.array(lifecycleStepSchema).readonly(),
	}),
	updateExtensionSourceResultSchema.extend({
		scope: z.literal("user"),
		configPath: z.string(),
		packageName: z.string().optional(),
		packageVersion: z.string().optional(),
		moduleRoot: z.string().optional(),
		commandAvailability: z.enum(["available", "unavailable"]),
		userExtensionLayer: userExtensionLayerStatusSchema,
		acquisitionIntent: z.enum(["ensure-pinned", "refresh-floating", "local-in-place"]),
		acquisitionOutcome: z.enum(["planned", "restored", "refreshed", "unchanged", "local-in-place"]),
		activation: z.literal("not-performed"),
		configWrite: z.literal("not-performed"),
		supportedHarnessesState: z.enum(["configured", "missing"]),
		configuredHarnesses: z.array(z.enum(ALL_HARNESS_IDS)).readonly(),
		artifactEffects: z.enum(["available", "deferred"]),
		/** Applied outcomes, or planned outcomes when a local dry-run can inspect current bytes. */
		artifacts: z.array(declaredArtifactActivationOutcomeSchema).readonly().optional(),
	}),
]);
export type UpdateExtensionRequest = z.input<typeof updateExtensionRequestSchema> & {
	readonly cwd: string;
};
export type UpdateExtensionResult = z.infer<typeof updateExtensionResultSchema>;

export async function updateExtension(
	context: ExtensionUpdateContext,
	request: UpdateExtensionRequest,
): Promise<CommandOutcome<UpdateExtensionResult>> {
	if (request.scope === "user") return updateUserExtension(context, request);
	const recorder = createLifecycleRecorder(context.lifecycleTrace);
	function tracedFailure<TData extends object>(options: {
		readonly diagnostic: LifecycleDiagnostic;
		readonly errorType: string;
		readonly message: string;
		readonly data: TData;
	}): CommandOutcome<UpdateExtensionResult> {
		recorder.fail(options.diagnostic);
		return failure(options.errorType, options.message, {
			...options.data,
			steps: recorder.steps(),
		});
	}

	const preflight = await prepareExtensionLifecycle(context, request, recorder);
	if (preflight.type === "failed")
		return extensionLifecycleFailure("update", preflight.failure, recorder);
	const { repository, repoRoot, trunkBranch, nsTomlContent, harnesses } = preflight.prepared;
	const target = planDeclaredExtensionTarget({
		projectRoot: repoRoot,
		nsTomlContent,
		requestedSpec: request.source,
	});
	if (!target.ok) {
		return tracedFailure({
			diagnostic: { code: target.reason, message: target.message, path: "ns.toml" },
			errorType: `ns-extension-update-${target.reason}`,
			message: target.message,
			data: { phase: "preflight", ...target, completed: {} },
		});
	}
	recorder.record({
		type: "declaration-decided",
		sourceSpec: target.matchedSpec,
		nsTomlPath: `${repoRoot}/ns.toml`,
		action: "unchanged",
	});
	recorder.beginPhase("acquisition");

	if (request.dryRun) {
		const preview = await context.updateAcquisition.preview({
			repoRoot,
			sourceSpec: target.matchedSpec,
		});
		if (preview.type === "failed") {
			const failureOptions = acquisitionFailure(target.matchedSpec, preview.diagnostics);
			return tracedFailure(failureOptions);
		}
		const facts = classifyUpdateOutcome(preview);
		recordAcquisition(
			recorder,
			target.matchedSpec,
			facts,
			preview.type === "preview-existing" ? preview.moduleRoot : undefined,
		);
		if (preview.type === "preview-existing") {
			recorder.beginPhase("activation-preflight");
			const prepared = await prepareNsActivation(
				context,
				{
					repository,
					harnesses,
					harnessSource: "ns-toml",
					nsTomlContent,
					nsTomlChange: "unchanged",
					nsTomlExpected: { type: "file", content: nsTomlContent },
				},
				recorder,
			);
			if (prepared.type === "preflight-failed") {
				const failureOptions = activationPreflightFailure(prepared.diagnostics, false);
				return tracedFailure(failureOptions);
			}
		}
		if (preview.type === "preview-apply-required") recorder.skipPhase("activation-preflight");
		recorder.skipPhase("activation-apply");
		recorder.record({ type: "effect", effect: "dry-run-no-writes" });
		recorder.record({
			type: "effect",
			effect:
				facts.prospectiveEffects === "available"
					? "prospective-effects-available"
					: "prospective-effects-unavailable",
		});
		recorder.complete();
		return ok({
			scope: "project",
			sourceSpec: target.matchedSpec,
			mode: "dry-run",
			...facts,
			repoRoot,
			trunkBranch,
			harnesses: [...harnesses],
			completed: { files: {} },
			steps: recorder.steps(),
		});
	}

	const reconciled = await context.updateAcquisition.reconcile({
		repoRoot,
		sourceSpec: target.matchedSpec,
	});
	if (reconciled.type === "failed") {
		const failureOptions = acquisitionFailure(target.matchedSpec, reconciled.diagnostics);
		return tracedFailure(failureOptions);
	}
	const facts = classifyUpdateOutcome(reconciled);
	recordAcquisition(recorder, target.matchedSpec, facts, reconciled.moduleRoot);
	recorder.beginPhase("activation-preflight");
	const prepared = await prepareNsActivation(
		context,
		{
			repository,
			harnesses,
			harnessSource: "ns-toml",
			nsTomlContent,
			nsTomlChange: "unchanged",
			nsTomlExpected: { type: "file", content: nsTomlContent },
		},
		recorder,
	);
	if (prepared.type === "preflight-failed") {
		const failureOptions = activationPreflightFailure(prepared.diagnostics, true);
		return tracedFailure(failureOptions);
	}
	recorder.beginPhase("activation-apply");
	const applied = await applyNsActivation(context, prepared.activation, recorder);
	if (applied.type === "apply-failed") {
		return tracedFailure({
			diagnostic: applied.error,
			errorType: "ns-extension-update-apply-failed",
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
		sourceSpec: target.matchedSpec,
		mode: "applied",
		...facts,
		repoRoot,
		trunkBranch,
		harnesses: [...harnesses],
		completed: applied.completed,
		steps: recorder.steps(),
	});
}

function recordAcquisition(
	recorder: LifecycleRecorder,
	sourceSpec: string,
	facts: PublicAcquisitionFacts,
	moduleRoot?: string,
): void {
	recorder.record({
		type: "acquisition-decided",
		sourceSpec,
		sourceKind: facts.sourceKind,
		intent: facts.acquisitionIntent,
		outcome: facts.acquisitionOutcome,
		...(moduleRoot === undefined ? {} : { moduleRoot }),
	});
}
function acquisitionFailure(
	sourceSpec: string,
	diagnostics: readonly ExtensionAcquisitionDiagnostic[],
) {
	const diagnostic = normalizeExtensionDiagnostic(
		diagnostics[0] ?? { code: "acquisition-failed", message: `Could not update ${sourceSpec}.` },
	);
	return {
		diagnostic,
		errorType: "ns-extension-update-acquisition-failed",
		message: diagnostic.message,
		data: {
			phase: "acquisition" as const,
			diagnostics: normalizeExtensionDiagnostics(diagnostics),
			completed: {},
		},
	};
}
function activationPreflightFailure(
	diagnostics: readonly ActivationDiagnostic[],
	sourceAcquisitionCompleted: boolean,
) {
	const diagnostic = diagnostics[0] ?? {
		code: "activation-preflight-failed",
		message: "Extension update activation preflight failed.",
	};
	return {
		diagnostic,
		errorType: "ns-extension-update-preflight-failed",
		message: "Extension update activation preflight failed.",
		data: {
			phase: "preflight" as const,
			diagnostics: normalizeExtensionDiagnostics(diagnostics),
			sourceAcquisitionCompleted,
			completed: {},
		},
	};
}

type SuccessfulUpdateAcquisition = Exclude<
	PreviewExtensionUpdateSourceResult | ReconcileExtensionUpdateSourceResult,
	{ readonly type: "failed" }
>;
type ProjectUpdateResult = Extract<UpdateExtensionResult, { readonly scope: "project" }>;
type PublicAcquisitionFacts = Pick<
	ProjectUpdateResult,
	"sourceKind" | "acquisitionIntent" | "acquisitionOutcome" | "prospectiveEffects"
>;
export function classifyUpdateOutcome(
	acquisition: SuccessfulUpdateAcquisition,
): PublicAcquisitionFacts {
	switch (acquisition.type) {
		case "preview-existing":
			return {
				sourceKind: acquisition.sourceKind,
				acquisitionIntent: acquisition.intent,
				acquisitionOutcome: "planned",
				prospectiveEffects: "available",
			};
		case "preview-apply-required":
			return {
				sourceKind: acquisition.sourceKind,
				acquisitionIntent: acquisition.intent,
				acquisitionOutcome: "planned",
				prospectiveEffects: "unavailable",
			};
		case "applied":
			return {
				sourceKind: acquisition.sourceKind,
				acquisitionIntent: acquisition.intent,
				acquisitionOutcome:
					acquisition.outcome === "local-in-place" ? "not-applicable" : acquisition.outcome,
				prospectiveEffects: "available",
			};
	}
}
async function updateUserExtension(
	context: ExtensionUpdateContext,
	request: UpdateExtensionRequest,
): Promise<CommandOutcome<UpdateExtensionResult>> {
	const source = prepareUserExtensionSource<UpdateExtensionResult>({
		context,
		cwd: request.cwd,
		source: request.source,
		operation: "update",
	});
	if (!source.ok) return source.exit;
	const prepared = await prepareUserConfig<UpdateExtensionResult>(context, "update");
	if ("status" in prepared) return prepared;
	const parsed = parseNsTomlExtensions(prepared.content, prepared.configPath);
	if (parsed.type === "error")
		return failure("ns-extension-update-user-config-invalid", parsed.error.message, {
			scope: "user",
			diagnostics: [parsed.error],
		});
	const supportedHarnesses = parseUserSupportedHarnessesFacts(
		prepared.content,
		prepared.configPath,
	);
	if (supportedHarnesses.type === "invalid")
		return failure("ns-extension-update-user-config-invalid", supportedHarnesses.error.message, {
			scope: "user",
			diagnostics: [supportedHarnesses.error],
		});
	const target = planDeclaredExtensionTarget({
		projectRoot: prepared.configDir,
		nsTomlContent: prepared.content,
		requestedSpec: source.sourceSpec,
	});
	if (!target.ok)
		return failure(`ns-extension-update-user-${target.reason}`, target.message, {
			scope: "user",
			...target,
		});
	const gate = decideUserExtensionLayer({ env: context.env, supportedHarnesses });
	const options: UserUpdateFlowOptions = {
		context,
		request,
		configPath: prepared.configPath,
		configDir: prepared.configDir,
		configuredSourceSpecs: parsed.type === "missing" ? [] : parsed.extensions,
		matchedSpec: target.matchedSpec,
		supportedHarnesses,
		commandAvailability: gate.enabled ? "available" : "unavailable",
		userExtensionLayer: userExtensionLayerStatus(gate),
	};
	return source.source.kind === "npm"
		? updateUserNpmExtension(options)
		: updateUserLocalExtension(options);
}

interface UserUpdateFlowOptions {
	readonly context: ExtensionUpdateContext;
	readonly request: UpdateExtensionRequest;
	readonly configPath: string;
	readonly configDir: string;
	readonly configuredSourceSpecs: readonly string[];
	readonly matchedSpec: string;
	readonly supportedHarnesses: Exclude<UserSupportedHarnessesFacts, { readonly type: "invalid" }>;
	readonly commandAvailability: "available" | "unavailable";
	readonly userExtensionLayer: UserExtensionLayerStatus;
}

async function updateUserNpmExtension(
	options: UserUpdateFlowOptions,
): Promise<CommandOutcome<UpdateExtensionResult>> {
	const { context, request } = options;
	if (context.userManagedNpmStorage.type !== "available")
		throw new Error("User npm storage became unavailable after source preparation.");
	const params = {
		repoRoot: options.configDir,
		sourceSpec: options.matchedSpec,
		managedNpmStorage: context.userManagedNpmStorage.storage,
	};
	if (request.dryRun) {
		const preview = await context.updateAcquisition.preview(params);
		if (preview.type === "failed")
			return failure(
				"ns-extension-update-user-acquisition-failed",
				preview.diagnostics[0]?.message ?? `Could not update ${options.matchedSpec}.`,
				{ scope: "user", diagnostics: normalizeExtensionDiagnostics(preview.diagnostics) },
			);
		return ok({
			scope: "user",
			sourceSpec: options.matchedSpec,
			sourceKind: "npm",
			mode: "dry-run",
			configPath: options.configPath,
			acquisitionIntent: preview.intent,
			acquisitionOutcome: "planned",
			commandAvailability: options.commandAvailability,
			userExtensionLayer: options.userExtensionLayer,
			activation: "not-performed",
			configWrite: "not-performed",
			supportedHarnessesState: options.supportedHarnesses.type,
			configuredHarnesses: [...options.supportedHarnesses.harnesses],
			artifactEffects: "deferred",
		});
	}
	return applyStagedUserNpmUpdate(options, params);
}

async function applyStagedUserNpmUpdate(
	options: UserUpdateFlowOptions,
	params: {
		readonly repoRoot: string;
		readonly sourceSpec: string;
		readonly managedNpmStorage: ManagedNpmStorage;
	},
): Promise<CommandOutcome<UpdateExtensionResult>> {
	const { context, request } = options;
	const staged = await context.userNpmUpdateAcquisition.prepare(params);
	if (staged.type === "failed")
		return failure(
			"ns-extension-update-user-acquisition-failed",
			staged.diagnostics[0]?.message ?? `Could not stage ${options.matchedSpec}.`,
			{
				scope: "user",
				diagnostics: normalizeExtensionDiagnostics(staged.diagnostics),
				retainedPaths: [...staged.retainedPaths],
			},
		);
	const candidate = staged.prepared;
	const loaded = await loadOneUserDescriptor<UpdateExtensionResult>({
		context,
		configDir: options.configDir,
		sourceSpec: options.matchedSpec,
		operation: "update",
		npmModuleRootOverride: candidate.candidateModuleRoot,
	});
	if (!loaded.ok) return discardUserNpmCandidate(context, candidate, loaded.exit);
	const availability = await context.userExtensionAvailability.evaluate({
		configDir: options.configDir,
		sourceSpecs: options.configuredSourceSpecs,
		npmPackageRootOverride: {
			sourceSpec: options.matchedSpec,
			packageName: candidate.packageName,
			moduleRoot: candidate.candidateModuleRoot,
		},
	});
	const targetAvailability = availability.find((fact) => fact.sourceSpec === options.matchedSpec);
	if (targetAvailability?.availability !== "available") {
		const primary: CommandOutcome<UpdateExtensionResult> = failure(
			"ns-extension-update-user-package-unavailable",
			`User extension package is not fully available: ${options.matchedSpec}.`,
			{
				scope: "user",
				sourceSpec: options.matchedSpec,
				diagnostics: normalizeExtensionDiagnostics(targetAvailability?.diagnostics ?? []),
				canonicalBytesUnchanged: true,
			},
		);
		return discardUserNpmCandidate(context, candidate, primary);
	}
	const artifactPreparation = await prepareUserUpdateArtifacts({
		context,
		request,
		descriptor: loaded.descriptor,
		configuredHarnesses: options.supportedHarnesses.harnesses,
		acquisitionOutcome: candidate.outcome,
	});
	if ("exit" in artifactPreparation)
		return discardUserNpmCandidate(context, candidate, artifactPreparation.exit);
	const promoted = await context.userNpmUpdateAcquisition.promote(candidate);
	if (promoted.type === "failed")
		return failure(
			"ns-extension-update-user-promotion-failed",
			promoted.diagnostics[0]?.message ?? `Could not promote ${options.matchedSpec}.`,
			{
				scope: "user",
				diagnostics: normalizeExtensionDiagnostics(promoted.diagnostics),
				retainedPaths: [...promoted.retainedPaths],
			},
		);
	const applied = await context.userArtifacts.apply(artifactPreparation.prepared);
	if (!applied.ok) {
		const rollback = await context.userNpmUpdateAcquisition.settle(promoted.promoted, "rollback");
		return failure("ns-extension-update-user-artifact-apply-failed", applied.error.message, {
			scope: "user",
			acquisitionOutcome: candidate.outcome,
			completedArtifacts: completedUserArtifactEvidence(applied.completed),
			diagnostics: [normalizeExtensionDiagnostic(applied.error)],
			packageRollback: rollback.type === "settled" ? "completed" : "failed",
			...(rollback.type === "failed"
				? {
						rollbackDiagnostics: normalizeExtensionDiagnostics(rollback.diagnostics),
						retainedPaths: [...rollback.retainedPaths],
					}
				: {}),
			retryGuidance: `Canonical package bytes were ${rollback.type === "settled" ? "restored" : "not fully restored"}; completed Harness artifact transitions were not rolled back. Re-run ns extension update --scope user ${request.source} to reconcile them idempotently.`,
		});
	}
	const committed = await context.userNpmUpdateAcquisition.settle(promoted.promoted, "commit");
	if (committed.type === "failed")
		return failure(
			"ns-extension-update-user-commit-cleanup-failed",
			committed.diagnostics[0]?.message ?? "User npm update completed but cleanup failed.",
			{
				scope: "user",
				packagePromotionCompleted: true,
				completedArtifacts: completedUserArtifactEvidence(applied.completed),
				diagnostics: normalizeExtensionDiagnostics(committed.diagnostics),
				retainedPaths: [...committed.retainedPaths],
				retryGuidance:
					"The promoted package and artifacts are active. Retry update or remove only the reported operation residue after inspection.",
			},
		);
	return ok({
		scope: "user",
		sourceSpec: options.matchedSpec,
		sourceKind: "npm",
		mode: "applied",
		configPath: options.configPath,
		packageName: loaded.descriptor.packageName,
		packageVersion: loaded.descriptor.version,
		moduleRoot: loaded.descriptor.moduleRoot,
		commandAvailability: options.commandAvailability,
		userExtensionLayer: options.userExtensionLayer,
		acquisitionIntent: candidate.intent,
		acquisitionOutcome: candidate.outcome,
		activation: "not-performed",
		configWrite: "not-performed",
		supportedHarnessesState: options.supportedHarnesses.type,
		configuredHarnesses: [...options.supportedHarnesses.harnesses],
		artifactEffects: "available",
		artifacts: completedUserArtifactEvidence(applied.completed),
	});
}

async function updateUserLocalExtension(
	options: UserUpdateFlowOptions,
): Promise<CommandOutcome<UpdateExtensionResult>> {
	const { context, request } = options;
	const availability = await context.userExtensionAvailability.evaluate({
		configDir: options.configDir,
		sourceSpecs: options.configuredSourceSpecs,
	});
	const targetAvailability = availability.find((fact) => fact.sourceSpec === options.matchedSpec);
	if (targetAvailability?.availability !== "available")
		return failure(
			"ns-extension-update-user-package-unavailable",
			`User extension package is not fully available: ${options.matchedSpec}.`,
			{
				scope: "user",
				sourceSpec: options.matchedSpec,
				diagnostics: normalizeExtensionDiagnostics(targetAvailability?.diagnostics ?? []),
			},
		);
	const loaded = await loadOneUserDescriptor<UpdateExtensionResult>({
		context,
		configDir: options.configDir,
		sourceSpec: options.matchedSpec,
		operation: "update",
	});
	if (!loaded.ok) return loaded.exit;
	if (request.dryRun) {
		const planned = await prepareUserUpdateArtifacts({
			context,
			request,
			descriptor: loaded.descriptor,
			configuredHarnesses: options.supportedHarnesses.harnesses,
			acquisitionOutcome: "planned",
		});
		if ("exit" in planned) return planned.exit;
		return ok({
			scope: "user",
			sourceSpec: options.matchedSpec,
			sourceKind: "local",
			mode: "dry-run",
			configPath: options.configPath,
			packageName: loaded.descriptor.packageName,
			packageVersion: loaded.descriptor.version,
			moduleRoot: loaded.descriptor.moduleRoot,
			commandAvailability: options.commandAvailability,
			userExtensionLayer: options.userExtensionLayer,
			acquisitionIntent: "local-in-place",
			acquisitionOutcome: "planned",
			activation: "not-performed",
			configWrite: "not-performed",
			supportedHarnessesState: options.supportedHarnesses.type,
			configuredHarnesses: [...options.supportedHarnesses.harnesses],
			artifactEffects: "available",
			artifacts: plannedUserArtifactEvidence(planned.prepared),
		});
	}
	const artifacts = await reconcileUserUpdateArtifacts({
		context,
		request,
		descriptor: loaded.descriptor,
		configuredHarnesses: options.supportedHarnesses.harnesses,
		acquisitionOutcome: "local-in-place",
	});
	if ("exit" in artifacts) return artifacts.exit;
	return ok({
		scope: "user",
		sourceSpec: options.matchedSpec,
		sourceKind: "local",
		mode: "applied",
		configPath: options.configPath,
		packageName: loaded.descriptor.packageName,
		packageVersion: loaded.descriptor.version,
		moduleRoot: loaded.descriptor.moduleRoot,
		commandAvailability: options.commandAvailability,
		userExtensionLayer: options.userExtensionLayer,
		acquisitionIntent: "local-in-place",
		acquisitionOutcome: "local-in-place",
		activation: "not-performed",
		configWrite: "not-performed",
		supportedHarnessesState: options.supportedHarnesses.type,
		configuredHarnesses: [...options.supportedHarnesses.harnesses],
		artifactEffects: "available",
		artifacts: artifacts.completed,
	});
}

async function discardUserNpmCandidate(
	context: ExtensionUpdateContext,
	candidate: PreparedUserNpmUpdate,
	primary: CommandOutcome<UpdateExtensionResult>,
): Promise<CommandOutcome<UpdateExtensionResult>> {
	const discarded = await context.userNpmUpdateAcquisition.discard(candidate);
	if (discarded.type === "settled") return primary;
	return failure(
		"ns-extension-update-user-candidate-cleanup-failed",
		discarded.diagnostics[0]?.message ?? "User npm update candidate cleanup failed.",
		{
			scope: "user",
			primaryFailure: primary,
			cleanupDiagnostics: normalizeExtensionDiagnostics(discarded.diagnostics),
			retainedPaths: [...discarded.retainedPaths],
		},
	);
}

interface UserUpdateArtifactSuccess {
	readonly completed: readonly z.infer<typeof declaredArtifactActivationOutcomeSchema>[];
}

type UserUpdateAcquisitionOutcome = Extract<
	UpdateExtensionResult,
	{ readonly scope: "user" }
>["acquisitionOutcome"];

/**
 * Prepare the candidate extension's bundled artifacts across the configured
 * harness set. Callers decide whether candidate package promotion has occurred.
 */
async function prepareUserUpdateArtifacts(options: {
	readonly context: ExtensionUpdateContext;
	readonly request: UpdateExtensionRequest;
	readonly descriptor: DeclaredExtensionDescriptor;
	readonly configuredHarnesses: readonly HarnessId[];
	readonly acquisitionOutcome: UserUpdateAcquisitionOutcome;
}): Promise<
	| { readonly prepared: PreparedDeclaredArtifactActivation }
	| { readonly exit: CommandOutcome<UpdateExtensionResult> }
> {
	const prepared = await options.context.userArtifacts.prepare({
		cwd: options.request.cwd,
		descriptors: [options.descriptor],
		configuredHarnesses: options.configuredHarnesses,
		targetPackageNames: [options.descriptor.packageName],
	});
	if (!prepared.ok)
		return {
			exit: failure("ns-extension-update-user-artifact-preflight-failed", prepared.error.message, {
				scope: "user",
				acquisitionOutcome: options.acquisitionOutcome,
				packagePromotionCompleted: false,
				diagnostics: [normalizeExtensionDiagnostic(prepared.error)],
			}),
		};
	const blockers = userArtifactPreflightBlockers(prepared.prepared);
	if (blockers.length > 0)
		return {
			exit: failure(
				"ns-extension-update-user-artifact-preflight-failed",
				blockers[0]?.message ?? "User artifact preflight failed.",
				{
					scope: "user",
					acquisitionOutcome: options.acquisitionOutcome,
					packagePromotionCompleted: false,
					diagnostics: blockers,
				},
			),
		};
	return { prepared: prepared.prepared };
}

async function reconcileUserUpdateArtifacts(options: {
	readonly context: ExtensionUpdateContext;
	readonly request: UpdateExtensionRequest;
	readonly descriptor: DeclaredExtensionDescriptor;
	readonly configuredHarnesses: readonly HarnessId[];
	readonly acquisitionOutcome: UserUpdateAcquisitionOutcome;
}): Promise<UserUpdateArtifactSuccess | { readonly exit: CommandOutcome<UpdateExtensionResult> }> {
	const preparation = await prepareUserUpdateArtifacts(options);
	if ("exit" in preparation) return preparation;
	const applied = await options.context.userArtifacts.apply(preparation.prepared);
	if (!applied.ok) {
		return {
			exit: failure("ns-extension-update-user-artifact-apply-failed", applied.error.message, {
				scope: "user",
				acquisitionOutcome: options.acquisitionOutcome,
				acquisitionCompleted: true,
				completedArtifacts: completedUserArtifactEvidence(applied.completed),
				diagnostics: [normalizeExtensionDiagnostic(applied.error)],
				retryGuidance: `Re-run ns extension update --scope user ${options.request.source} to retry the remaining artifact transitions.`,
			}),
		};
	}
	return { completed: completedUserArtifactEvidence(applied.completed) };
}

export function renderUpdateExtensionMarkdown(result: UpdateExtensionResult): string {
	if (result.scope === "user")
		return `${result.mode === "dry-run" ? "Planned" : "Applied"} ${result.acquisitionIntent} for ${result.sourceSpec}; bundled artifacts: ${result.artifacts === undefined ? "not reconciled (dry run)" : summarizeUserArtifactActions(result.artifacts)} for ${describeUserConfiguredHarnesses(result)}; no config writes or project activation were performed.`;
	const summary =
		result.mode === "dry-run"
			? `Dry run planned ${result.sourceSpec}; no writes were performed. Exact prospective effects are ${result.prospectiveEffects}.`
			: `Applied ${result.sourceSpec}; exact effects are ${result.prospectiveEffects}.`;
	return renderLifecycleMarkdown("ns extension update", summary, result.steps);
}
export function renderUpdateExtensionHuman(result: UpdateExtensionResult): string {
	if (result.scope === "user")
		return `${result.mode === "dry-run" ? "Planned" : "Applied"} ${result.acquisitionIntent} for ${result.sourceSpec}; acquisition ${result.acquisitionOutcome}; bundled artifacts ${result.artifacts === undefined ? "not reconciled (dry run)" : summarizeUserArtifactActions(result.artifacts)} for ${describeUserConfiguredHarnesses(result)}. No config writes or project activation were performed.`;
	return `${result.mode === "dry-run" ? "Planned" : "Applied"} ${result.acquisitionIntent} for ${result.sourceSpec}; acquisition ${result.acquisitionOutcome}; exact prospective effects ${result.prospectiveEffects}.`;
}
