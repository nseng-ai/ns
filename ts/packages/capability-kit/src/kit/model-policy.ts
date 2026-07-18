import { parseModelRef, type ParsedModelRef } from "@nseng-ai/foundation/model-slug";
import { resultErrOf, type Result } from "@nseng-ai/foundation/result";
import type { TextGenerationReasoning } from "@nseng-ai/sdk";
import {
	getProjectConfigSetting,
	parseProjectConfigToml,
	type ProjectConfigDiagnostic,
	type ProjectConfigGateway,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

export const MODEL_THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
] as const satisfies readonly TextGenerationReasoning[];

export type ModelThinking = TextGenerationReasoning;
export type ModelOperationId = string;
export type ModelProfileName = string;

export interface ModelProfile {
	readonly model: ParsedModelRef;
	readonly thinking: ModelThinking;
}

export interface ModelPolicy {
	readonly profiles: Readonly<Record<ModelProfileName, ModelProfile>>;
	readonly operations: Readonly<Record<ModelOperationId, ModelProfileName>>;
}

export interface ModelOperationDefinition {
	readonly id: ModelOperationId;
	readonly defaultProfile: ModelProfileName;
}

export interface ResolvedModelOperation {
	readonly operationId: ModelOperationId;
	readonly profile: ModelProfileName;
	readonly model: ParsedModelRef;
	readonly modelRef: string;
	readonly thinking: ModelThinking;
	readonly source: "component-default" | "project-override";
}

export type ModelPolicyErrorCode = "invalid-toml" | "invalid-model-policy" | "missing-profile";
export interface ModelPolicyError {
	readonly code: ModelPolicyErrorCode;
	readonly message: string;
}
export type ModelPolicyResult<T> = Result<T, ModelPolicyError>;

const profileNameSchema = z
	.string()
	.regex(/^[a-z0-9][a-z0-9-]*$/, "must match ^[a-z0-9][a-z0-9-]*$");
const modelRefSchema = z
	.string()
	.trim()
	.min(1)
	.transform((value, context) => {
		const parsed = parseModelRef(value);
		if (parsed !== undefined) return parsed;
		context.addIssue({
			code: "custom",
			message: "must be a qualified provider/model reference (provider/model-id)",
		});
		return z.NEVER;
	});
const modelProfileSchema = z.strictObject({
	model: modelRefSchema,
	thinking: z.enum(MODEL_THINKING_LEVELS),
});
const modelPolicySchema = z.strictObject({
	profiles: z.record(profileNameSchema, modelProfileSchema).default({}),
	operations: z.record(z.string().trim().min(1), profileNameSchema).default({}),
});
type ModelPolicySettings = z.infer<typeof modelPolicySchema>;

const modelPolicySettingsSchema = {
	path: ["models"] as const,
	schema: z.unknown(),
} satisfies SettingsSchema<unknown>;

export function parseModelPolicyToml(
	source: string,
	pathLabel?: string,
): ModelPolicyResult<ModelPolicy> {
	const result = parseProjectConfigToml(source, {
		...(pathLabel === undefined ? {} : { pathLabel }),
		pointsTable: { mode: "skip" },
		settingsSchemas: [modelPolicySettingsSchema],
	});
	if (result.ok === false) return modelPolicyErrorFromDiagnostics(result.diagnostics, pathLabel);
	return modelPolicyFromSettings(
		getProjectConfigSetting(result.config, modelPolicySettingsSchema),
		pathLabel,
	);
}

export function loadModelPolicy(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
}): ModelPolicyResult<ModelPolicy> {
	const readResult = request.gateway.readTextFile({
		repoRoot: request.repoRoot,
		relativePath: "ns.toml",
	});
	if (readResult.type === "missing") return modelPolicyFromSettings(undefined, "ns.toml");
	if (readResult.type === "error") {
		return resultErrOf("invalid-toml", `Failed to read ns.toml: ${readResult.message}`);
	}
	return parseModelPolicyToml(readResult.text, "ns.toml");
}

export function resolveModelOperation(
	policy: ModelPolicy,
	definition: ModelOperationDefinition,
): ModelPolicyResult<ResolvedModelOperation> {
	const overriddenProfile = policy.operations[definition.id];
	const selectedProfile = overriddenProfile ?? definition.defaultProfile;
	const profile = policy.profiles[selectedProfile];
	if (profile === undefined) {
		return resultErrOf(
			"missing-profile",
			`Model operation ${JSON.stringify(definition.id)} references missing profile ${JSON.stringify(selectedProfile)}.`,
		);
	}
	return {
		ok: true,
		value: {
			operationId: definition.id,
			profile: selectedProfile,
			model: profile.model,
			modelRef: `${profile.model.provider}/${profile.model.modelId}`,
			thinking: profile.thinking,
			source: overriddenProfile === undefined ? "component-default" : "project-override",
		},
	};
}

function modelPolicyFromSettings(
	settings: unknown,
	pathLabel: string | undefined,
): ModelPolicyResult<ModelPolicy> {
	if (settings === undefined) return { ok: true, value: { profiles: {}, operations: {} } };
	const result = modelPolicySchema.safeParse(settings);
	if (!result.success) {
		const issue = result.error.issues[0];
		const path = ["models", ...(issue?.path ?? [])].join(".");
		return resultErrOf(
			"invalid-model-policy",
			formatMessage(`${path}: ${issue?.message ?? "is invalid"}`, pathLabel),
		);
	}
	const policy = policyFromValidatedSettings(result.data);
	for (const [operationId, profile] of Object.entries(policy.operations)) {
		if (policy.profiles[profile] === undefined) {
			return resultErrOf(
				"missing-profile",
				formatMessage(
					`models.operations.${operationId} references missing profile ${JSON.stringify(profile)}.`,
					pathLabel,
				),
			);
		}
	}
	return { ok: true, value: policy };
}

function policyFromValidatedSettings(settings: ModelPolicySettings): ModelPolicy {
	return { profiles: settings.profiles, operations: settings.operations };
}

function modelPolicyErrorFromDiagnostics(
	diagnostics: readonly ProjectConfigDiagnostic[],
	pathLabel: string | undefined,
): ModelPolicyResult<ModelPolicy> {
	const diagnostic =
		diagnostics.find((candidate) => candidate.severity === "error") ?? diagnostics[0];
	if (diagnostic?.code === "ns_toml_invalid") {
		return resultErrOf("invalid-toml", diagnostic.message);
	}
	return resultErrOf(
		"invalid-model-policy",
		diagnostic?.message ?? formatMessage("invalid [models] configuration", pathLabel),
	);
}

function formatMessage(message: string, pathLabel: string | undefined): string {
	return pathLabel === undefined ? message : `${pathLabel}: ${message}`;
}
