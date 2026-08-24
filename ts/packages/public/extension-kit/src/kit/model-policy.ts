import {
	parseModelRef,
	modelThinkingSchema,
	type ModelSelection,
} from "@nseng-ai/foundation/model-slug";
import { resultErrOf, type Result } from "@nseng-ai/foundation/result";
import type {
	EffectiveProjectConfig,
	ProjectConfigError,
	ProjectSetting,
} from "@nseng-ai/sdk/project-config";
import { z } from "zod";

export const MODEL_OPERATION_IDS = {
	slug: "slug",
	flowCheckpoint: "flow.checkpoint",
	flowChanges: "flow.changes",
	flowSubmitFailure: "flow.submit-failure",
	flowPrInventory: "flow.pr-inventory",
	thermoCouncilSynthesis: "thermo-council.synthesis",
	piFastDraft: "pi.fast-draft",
	stackViewEnrichment: "stack-view.enrichment",
	contextProfilerSegmentation: "context-profiler.segmentation",
	contextProfilerEpisodeAnalysis: "context-profiler.episode-analysis",
} as const;

export type ModelOperationId = string;
export type ModelProfileName = string;

export interface ModelPolicy {
	readonly profiles: Readonly<Record<ModelProfileName, ModelSelection>>;
	readonly operations: Readonly<Record<ModelOperationId, ModelProfileName>>;
}

export interface ResolvedModelOperation {
	readonly operationId: ModelOperationId;
	readonly profile: ModelProfileName;
	readonly selection: ModelSelection;
	readonly source: "project-profile" | "project-operation";
}

export type ModelPolicyErrorCode = "invalid-toml" | "invalid-model-policy" | "missing-profile";
export interface ModelPolicyError {
	readonly code: ModelPolicyErrorCode;
	readonly message: string;
}
export type ModelPolicyResult<T> = Result<T, ModelPolicyError>;

export type EffectiveModelPolicyError =
	| { readonly type: "project-config"; readonly error: ProjectConfigError }
	| { readonly type: "model-policy"; readonly error: ModelPolicyError };
export type EffectiveModelPolicyResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: EffectiveModelPolicyError };

const modelRefSchema = z.string().trim().min(1);
const profileNameSchema = z.string().trim().min(1);
const modelProfileSchema = z.strictObject({
	model: modelRefSchema,
	thinking: modelThinkingSchema,
});
type ModelProfileSettings = z.infer<typeof modelProfileSchema>;
type ModelPolicySettings = {
	profiles: Record<string, ModelProfileSettings>;
	operations: Record<string, string>;
};

export const modelPolicySetting = {
	path: ["models"] as const,
	schema: z.strictObject({
		profiles: z.record(profileNameSchema, modelProfileSchema).default({}),
		operations: z.record(z.string().trim().min(1), profileNameSchema).default({}),
	}),
	invalidMessage: ({ pathLabel }) => `${pathLabel}: [models] is invalid.`,
} satisfies ProjectSetting<ModelPolicySettings>;

export async function resolveEffectiveModelPolicy(
	projectConfig: EffectiveProjectConfig,
): Promise<EffectiveModelPolicyResult<ModelPolicy>> {
	const setting = await projectConfig.get(modelPolicySetting);
	if (!setting.ok) {
		return { ok: false, error: { type: "project-config", error: setting.error } };
	}
	const policy = validateModelPolicySettings(setting.value?.value);
	if (!policy.ok) {
		return { ok: false, error: { type: "model-policy", error: policy.error } };
	}
	return policy;
}

export async function resolveEffectiveModelOperation(
	projectConfig: EffectiveProjectConfig,
	operationId: ModelOperationId,
): Promise<EffectiveModelPolicyResult<ResolvedModelOperation>> {
	const policy = await resolveEffectiveModelPolicy(projectConfig);
	if (!policy.ok) return policy;
	const operation = resolveModelOperation(policy.value, operationId);
	if (!operation.ok) {
		return { ok: false, error: { type: "model-policy", error: operation.error } };
	}
	return operation;
}

export function resolveModelOperation(
	policy: ModelPolicy,
	operationId: ModelOperationId,
): ModelPolicyResult<ResolvedModelOperation> {
	const selectedProfile = policy.operations[operationId] ?? "fast";
	const selection = policy.profiles[selectedProfile];
	if (selection === undefined) {
		return resultErrOf(
			"missing-profile",
			`Model operation ${JSON.stringify(operationId)} references missing profile ${JSON.stringify(selectedProfile)}.`,
		);
	}
	const source =
		policy.operations[operationId] === undefined ? "project-profile" : "project-operation";
	return {
		ok: true,
		value: {
			operationId,
			profile: selectedProfile,
			selection,
			source,
		},
	};
}

function validateModelPolicySettings(
	settings: ModelPolicySettings | undefined,
): ModelPolicyResult<ModelPolicy> {
	const profiles: Record<string, ModelSelection> = {};
	for (const [name, profile] of Object.entries(settings?.profiles ?? {})) {
		const parsed = parseModelRef(profile.model, profile.thinking);
		if (parsed === undefined)
			return resultErrOf(
				"invalid-model-policy",
				`Model profile ${JSON.stringify(name)} must be a qualified provider/model reference.`,
			);
		profiles[name] = parsed;
	}
	if (profiles.fast === undefined) {
		return resultErrOf(
			"missing-profile",
			'Model profile "fast" is required in ns.toml at [models.profiles.fast].',
		);
	}
	const operations = settings?.operations ?? {};
	for (const [operationId, profile] of Object.entries(operations)) {
		if (profiles[profile] === undefined) {
			return resultErrOf(
				"missing-profile",
				`Model operation ${JSON.stringify(operationId)} references missing profile ${JSON.stringify(profile)}.`,
			);
		}
	}
	return { ok: true, value: { profiles, operations } };
}
