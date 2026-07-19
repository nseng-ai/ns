import {
	parseModelRef,
	modelThinkingSchema,
	type ModelSelection,
} from "@nseng-ai/foundation/model-slug";
import { resultErrOf, type Result } from "@nseng-ai/foundation/result";
import {
	getProjectConfigSetting,
	parseProjectConfigToml,
	type ProjectConfigDiagnostic,
	type ProjectConfigGateway,
	type SettingsSchema,
} from "@nseng-ai/sdk/project-config/points";
import { z } from "zod";

export const MODEL_OPERATION_IDS = {
	slug: "slug",
	flowCheckpoint: "flow.checkpoint",
	flowChanges: "flow.changes",
	flowSubmitFailure: "flow.submit-failure",
	flowPrDescription: "flow.pr-description",
	cmuxSidebar: "cmux.sidebar",
	thermoCouncilSynthesis: "thermo-council.synthesis",
	piFastDraft: "pi.fast-draft",
	stackViewEnrichment: "stack-view.enrichment",
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

const modelRefSchema = z.string().trim().min(1);
const profileNameSchema = z.string().trim().min(1);
const modelProfileSchema = z.strictObject({
	model: modelRefSchema,
	thinking: modelThinkingSchema,
});
type ModelProfileSettings = z.infer<typeof modelProfileSchema>;
const modelPolicySettingsSchema = {
	path: ["models"] as const,
	schema: z.strictObject({
		profiles: z.record(profileNameSchema, modelProfileSchema).default({}),
		operations: z.record(z.string().trim().min(1), profileNameSchema).default({}),
	}),
	invalidMessage: ({ pathLabel }) => `${pathLabel}: [models] is invalid.`,
} satisfies SettingsSchema<{
	profiles: Record<string, ModelProfileSettings>;
	operations: Record<string, string>;
}>;

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
	return modelPolicyFromSettings(getProjectConfigSetting(result.config, modelPolicySettingsSchema));
}

export function loadModelPolicy(request: {
	repoRoot: string;
	gateway: ProjectConfigGateway;
}): ModelPolicyResult<ModelPolicy> {
	const readResult = request.gateway.readTextFile({
		repoRoot: request.repoRoot,
		relativePath: "ns.toml",
	});
	if (readResult.type === "missing") return modelPolicyFromSettings(undefined);
	if (readResult.type === "error") {
		return resultErrOf("invalid-toml", `Failed to read ns.toml: ${readResult.message}`);
	}
	return parseModelPolicyToml(readResult.text, "ns.toml");
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

function modelPolicyFromSettings(
	settings:
		| {
				profiles: Record<string, ModelProfileSettings>;
				operations: Record<string, string>;
		  }
		| undefined,
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
