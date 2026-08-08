import type { CommandOutcome } from "@nseng-ai/clinkr/app";
import { failure, ok } from "@nseng-ai/clinkr/app";
import { parseNsTomlExtensions } from "./ns-toml.ts";
import type { ExtensionAcquisitionDiagnostic } from "@nseng-ai/sdk/extensions/acquisition";
import { planDeclaredExtensionTarget } from "@nseng-ai/sdk/project-config";
import { z } from "zod";

import {
	extensionLifecycleScopeSchemaValues,
	loadOneUserDescriptor,
	prepareUserConfig,
	prepareUserExtensionSource,
	type UserExtensionAvailabilityContext,
	type UserExtensionLifecycleContext,
} from "./user-extension-lifecycle.ts";

import {
	type ActivationDiagnostic,
	applyNsActivation,
	prepareNsActivation,
} from "./activate-ns.ts";
import { activationCompletedSchema } from "./activation-outcomes.ts";
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
		completed: activationCompletedSchema,
		steps: z.array(lifecycleStepSchema).readonly(),
	}),
	updateExtensionSourceResultSchema.extend({
		scope: z.literal("user"),
		configPath: z.string(),
		packageName: z.string().optional(),
		packageVersion: z.string().optional(),
		moduleRoot: z.string().optional(),
		commandAvailability: z.enum(["available", "planned"]),
		acquisitionIntent: z.enum(["ensure-pinned", "refresh-floating", "local-in-place"]),
		acquisitionOutcome: z.enum(["planned", "restored", "refreshed", "unchanged", "local-in-place"]),
		activation: z.literal("not-performed"),
		configWrite: z.literal("not-performed"),
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
	const { repository, repoRoot, trunkBranch, nsTomlContent } = preflight.prepared;
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
				commandAvailability: "planned",
				activation: "not-performed",
				configWrite: "not-performed",
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
		return ok({
			scope: "user",
			sourceSpec: target.matchedSpec,
			sourceKind: "npm",
			mode: "applied",
			configPath: prepared.configPath,
			packageName: loaded.descriptor.packageName,
			packageVersion: loaded.descriptor.version,
			moduleRoot: loaded.descriptor.moduleRoot,
			commandAvailability: "available",
			acquisitionIntent: acquisition.intent,
			acquisitionOutcome: acquisition.outcome,
			activation: "not-performed",
			configWrite: "not-performed",
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
	return ok({
		scope: "user",
		sourceSpec: target.matchedSpec,
		sourceKind: "local",
		mode: request.dryRun ? "dry-run" : "applied",
		configPath: prepared.configPath,
		packageName: loaded.descriptor.packageName,
		packageVersion: loaded.descriptor.version,
		moduleRoot: loaded.descriptor.moduleRoot,
		commandAvailability: "available",
		acquisitionIntent: "local-in-place",
		acquisitionOutcome: request.dryRun ? "planned" : "local-in-place",
		activation: "not-performed",
		configWrite: "not-performed",
	});
}

export function renderUpdateExtensionMarkdown(result: UpdateExtensionResult): string {
	if (result.scope === "user")
		return `${result.mode === "dry-run" ? "Planned" : "Applied"} ${result.acquisitionIntent} for ${result.sourceSpec}; no config writes or project activation were performed.`;
	const summary =
		result.mode === "dry-run"
			? `Dry run planned ${result.sourceSpec}; no writes were performed. Exact prospective effects are ${result.prospectiveEffects}.`
			: `Applied ${result.sourceSpec}; exact effects are ${result.prospectiveEffects}.`;
	return renderLifecycleMarkdown("ns extension update", summary, result.steps);
}
export function renderUpdateExtensionHuman(result: UpdateExtensionResult): string {
	if (result.scope === "user")
		return `${result.mode === "dry-run" ? "Planned" : "Applied"} ${result.acquisitionIntent} for ${result.sourceSpec}; acquisition ${result.acquisitionOutcome}. No config writes or project activation were performed.`;
	return `${result.mode === "dry-run" ? "Planned" : "Applied"} ${result.acquisitionIntent} for ${result.sourceSpec}; acquisition ${result.acquisitionOutcome}; exact prospective effects ${result.prospectiveEffects}.`;
}
