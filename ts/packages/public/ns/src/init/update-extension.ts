import type { CommandOutcome } from "@nseng-ai/clinkr/app";
import { failure, ok } from "@nseng-ai/clinkr/app";
import { ALL_HARNESS_IDS, parseNsTomlExtensions } from "../harness-artifacts/api.ts";
import type { ExtensionAcquisitionDiagnostic } from "@nseng-ai/sdk/extensions/acquisition";
import { planDeclaredExtensionTarget } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import {
	completedUserArtifactEvidence,
	decideUserExtensionLifecycleGate,
	describeUserConfiguredHarnesses,
	extensionLifecycleScopeSchemaValues,
	loadOneUserDescriptor,
	parseUserSupportedHarnessesFacts,
	plannedUserArtifactEvidence,
	prepareUserConfig,
	prepareUserExtensionSource,
	summarizeUserArtifactActions,
	userArtifactPreflightBlockers,
	type UserExtensionAvailabilityContext,
	type UserExtensionLifecycleContext,
	type UserSupportedHarnessesFacts,
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
		userExtensionLayer: z.object({
			enabled: z.boolean(),
			activeHarness: z.enum(ALL_HARNESS_IDS).optional(),
			reason: z.string().optional(),
		}),
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
	const configuredSourceSpecs = parsed.type === "missing" ? [] : parsed.extensions;
	const supportedHarnesses = parseUserSupportedHarnessesFacts(
		prepared.content,
		prepared.configPath,
	);
	if (supportedHarnesses.type === "invalid")
		return failure("ns-extension-update-user-config-invalid", supportedHarnesses.error.message, {
			scope: "user",
			diagnostics: [supportedHarnesses.error],
		});
	const gate = decideUserExtensionLifecycleGate({ env: context.env, supportedHarnesses });
	const commandAvailability = gate.enabled ? "available" : "unavailable";
	const userExtensionLayer = gate.enabled
		? { enabled: true as const, activeHarness: gate.activeHarness }
		: { enabled: false as const, reason: gate.reason.type };
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
	if (source.source.kind === "npm") {
		if (context.userManagedNpmStorage.type !== "available")
			throw new Error("User npm storage became unavailable after source preparation.");
		const params = {
			repoRoot: prepared.configDir,
			sourceSpec: target.matchedSpec,
			managedNpmStorage: context.userManagedNpmStorage.storage,
		};
		const acquisition = request.dryRun
			? await context.updateAcquisition.preview(params)
			: await context.updateAcquisition.reconcile(params);
		if (acquisition.type === "failed")
			return failure(
				"ns-extension-update-user-acquisition-failed",
				acquisition.diagnostics[0]?.message ?? `Could not update ${target.matchedSpec}.`,
				{
					scope: "user",
					diagnostics: normalizeExtensionDiagnostics(acquisition.diagnostics),
				},
			);
		if (request.dryRun) {
			return ok({
				scope: "user",
				sourceSpec: target.matchedSpec,
				sourceKind: "npm",
				mode: "dry-run",
				configPath: prepared.configPath,
				acquisitionIntent: acquisition.intent,
				acquisitionOutcome: "planned",
				commandAvailability,
				userExtensionLayer,
				activation: "not-performed",
				configWrite: "not-performed",
				supportedHarnessesState: supportedHarnesses.type,
				configuredHarnesses: [...supportedHarnesses.harnesses],
				artifactEffects: "deferred",
			});
		}
		if (acquisition.type !== "applied") throw new Error("Applied update returned preview state.");
		const availability = await context.userExtensionAvailability.evaluate({
			configDir: prepared.configDir,
			sourceSpecs: configuredSourceSpecs,
		});
		const targetAvailability = availability.find((fact) => fact.sourceSpec === target.matchedSpec);
		if (targetAvailability?.availability !== "available")
			return failure(
				"ns-extension-update-user-package-unavailable",
				`User extension package is not fully available: ${target.matchedSpec}.`,
				{
					scope: "user",
					sourceSpec: target.matchedSpec,
					diagnostics: normalizeExtensionDiagnostics(targetAvailability?.diagnostics ?? []),
					sourceAcquisitionCompleted: true,
					managedBytesRetained: true,
					acquisitionIntent: acquisition.intent,
					acquisitionOutcome: acquisition.outcome,
				},
			);
		const loaded = await loadOneUserDescriptor<UpdateExtensionResult>({
			context,
			configDir: prepared.configDir,
			sourceSpec: target.matchedSpec,
			operation: "update",
		});
		if (!loaded.ok) return loaded.exit;
		const artifacts = await reconcileUserUpdateArtifacts({
			context,
			request,
			descriptor: loaded.descriptor,
			supportedHarnesses,
			acquisitionOutcome: acquisition.outcome,
		});
		if ("exit" in artifacts) return artifacts.exit;
		return ok({
			scope: "user",
			sourceSpec: target.matchedSpec,
			sourceKind: "npm",
			mode: "applied",
			configPath: prepared.configPath,
			packageName: loaded.descriptor.packageName,
			packageVersion: loaded.descriptor.version,
			moduleRoot: loaded.descriptor.moduleRoot,
			commandAvailability,
			userExtensionLayer,
			acquisitionIntent: acquisition.intent,
			acquisitionOutcome: acquisition.outcome,
			activation: "not-performed",
			configWrite: "not-performed",
			supportedHarnessesState: supportedHarnesses.type,
			configuredHarnesses: [...supportedHarnesses.harnesses],
			artifactEffects: "available",
			artifacts: artifacts.completed,
		});
	}
	const availability = await context.userExtensionAvailability.evaluate({
		configDir: prepared.configDir,
		sourceSpecs: configuredSourceSpecs,
	});
	const targetAvailability = availability.find((fact) => fact.sourceSpec === target.matchedSpec);
	if (targetAvailability?.availability !== "available")
		return failure(
			"ns-extension-update-user-package-unavailable",
			`User extension package is not fully available: ${target.matchedSpec}.`,
			{
				scope: "user",
				sourceSpec: target.matchedSpec,
				diagnostics: normalizeExtensionDiagnostics(targetAvailability?.diagnostics ?? []),
			},
		);
	const loaded = await loadOneUserDescriptor<UpdateExtensionResult>({
		context,
		configDir: prepared.configDir,
		sourceSpec: target.matchedSpec,
		operation: "update",
	});
	if (!loaded.ok) return loaded.exit;
	if (request.dryRun) {
		const planned = await prepareUserUpdateArtifacts({
			context,
			request,
			descriptor: loaded.descriptor,
			supportedHarnesses,
			acquisitionOutcome: "planned",
		});
		if ("exit" in planned) return planned.exit;
		return ok({
			scope: "user",
			sourceSpec: target.matchedSpec,
			sourceKind: "local",
			mode: "dry-run",
			configPath: prepared.configPath,
			packageName: loaded.descriptor.packageName,
			packageVersion: loaded.descriptor.version,
			moduleRoot: loaded.descriptor.moduleRoot,
			commandAvailability,
			userExtensionLayer,
			acquisitionIntent: "local-in-place",
			acquisitionOutcome: "planned",
			activation: "not-performed",
			configWrite: "not-performed",
			supportedHarnessesState: supportedHarnesses.type,
			configuredHarnesses: [...supportedHarnesses.harnesses],
			artifactEffects: "available",
			artifacts: plannedUserArtifactEvidence(planned.prepared.prepared),
		});
	}
	const artifacts = await reconcileUserUpdateArtifacts({
		context,
		request,
		descriptor: loaded.descriptor,
		supportedHarnesses,
		acquisitionOutcome: "local-in-place",
	});
	if ("exit" in artifacts) return artifacts.exit;
	return ok({
		scope: "user",
		sourceSpec: target.matchedSpec,
		sourceKind: "local",
		mode: "applied",
		configPath: prepared.configPath,
		packageName: loaded.descriptor.packageName,
		packageVersion: loaded.descriptor.version,
		moduleRoot: loaded.descriptor.moduleRoot,
		commandAvailability,
		userExtensionLayer,
		acquisitionIntent: "local-in-place",
		acquisitionOutcome: "local-in-place",
		activation: "not-performed",
		configWrite: "not-performed",
		supportedHarnessesState: supportedHarnesses.type,
		configuredHarnesses: [...supportedHarnesses.harnesses],
		artifactEffects: "available",
		artifacts: artifacts.completed,
	});
}

interface UserUpdateArtifactSuccess {
	readonly completed: readonly z.infer<typeof declaredArtifactActivationOutcomeSchema>[];
}

/**
 * Reconcile the updated extension's bundled artifacts across the configured
 * harness set. Failures report whether acquisition already advanced so callers
 * can distinguish stale bytes from stale artifacts; no rollback is claimed
 * because none is performed.
 */
async function prepareUserUpdateArtifacts(options: {
	readonly context: ExtensionUpdateContext;
	readonly request: UpdateExtensionRequest;
	readonly descriptor: Awaited<
		ReturnType<ExtensionUpdateContext["declaredExtensions"]["load"]>
	>["descriptors"][number];
	readonly supportedHarnesses: UserSupportedHarnessesFacts;
	readonly acquisitionOutcome: string;
}): Promise<
	| {
			readonly prepared: Awaited<ReturnType<ExtensionUpdateContext["userArtifacts"]["prepare"]>> & {
				readonly ok: true;
			};
	  }
	| { readonly exit: CommandOutcome<UpdateExtensionResult> }
> {
	const prepared = await options.context.userArtifacts.prepare({
		cwd: options.request.cwd,
		descriptors: [options.descriptor],
		configuredHarnesses: options.supportedHarnesses.harnesses,
		targetPackageNames: [options.descriptor.packageName],
	});
	if (!prepared.ok)
		return {
			exit: failure("ns-extension-update-user-artifact-preflight-failed", prepared.error.message, {
				scope: "user",
				acquisitionOutcome: options.acquisitionOutcome,
				acquisitionCompleted: options.acquisitionOutcome !== "planned",
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
					acquisitionCompleted: options.acquisitionOutcome !== "planned",
					diagnostics: blockers,
				},
			),
		};
	return { prepared };
}

async function reconcileUserUpdateArtifacts(options: {
	readonly context: ExtensionUpdateContext;
	readonly request: UpdateExtensionRequest;
	readonly descriptor: Awaited<
		ReturnType<ExtensionUpdateContext["declaredExtensions"]["load"]>
	>["descriptors"][number];
	readonly supportedHarnesses: UserSupportedHarnessesFacts;
	readonly acquisitionOutcome: string;
}): Promise<UserUpdateArtifactSuccess | { readonly exit: CommandOutcome<UpdateExtensionResult> }> {
	const preparation = await prepareUserUpdateArtifacts(options);
	if ("exit" in preparation) return preparation;
	const applied = await options.context.userArtifacts.apply(preparation.prepared.prepared);
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
