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
	flowPrInventory: "flow.pr-inventory",
	thermoCouncilSynthesis: "thermo-council.synthesis",
	piFastDraft: "pi.fast-draft",
	stackViewEnrichment: "stack-view.enrichment",
	contextProfilerSegmentation: "context-profiler.segmentation",
	contextProfilerEpisodeAnalysis: "context-profiler.episode-analysis",
} as const;

export type ModelOperationId = string;
export type ModelProfileName = string;

export type ModelProfileSource = "built-in-profile" | "project-profile";

export interface ModelPolicy {
	readonly profiles: Readonly<Record<ModelProfileName, ModelSelection>>;
	readonly profileSources: Readonly<Record<ModelProfileName, ModelProfileSource>>;
	readonly operations: Readonly<Record<ModelOperationId, ModelProfileName>>;
}

export interface ResolvedModelOperation {
	readonly operationId: ModelOperationId;
	readonly profile: ModelProfileName;
	readonly selection: ModelSelection;
	readonly source: ModelProfileSource | "project-operation";
}

const BUILT_IN_FAST_MODEL_PROFILE_WARNING =
	"No configured fast model profile was found; using built-in openai-codex/gpt-5.6-luna with minimal thinking.";

export interface ResolveModelOperationOptions {
	readonly presentWarning: (message: string) => void;
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
	options: ResolveModelOperationOptions,
): ModelPolicyResult<ResolvedModelOperation> {
	const selectedProfile = policy.operations[operationId] ?? "fast";
	const selection = policy.profiles[selectedProfile];
	if (selection === undefined) {
		return resultErrOf(
			"missing-profile",
			`Model operation ${JSON.stringify(operationId)} references missing profile ${JSON.stringify(selectedProfile)}.`,
		);
	}
	const profileSource = policy.profileSources[selectedProfile];
	if (profileSource === undefined) {
		return resultErrOf(
			"missing-profile",
			`Model profile ${JSON.stringify(selectedProfile)} has no provenance.`,
		);
	}
	const source =
		profileSource === "built-in-profile" || policy.operations[operationId] === undefined
			? profileSource
			: "project-operation";
	if (source === "built-in-profile") {
		options.presentWarning(BUILT_IN_FAST_MODEL_PROFILE_WARNING);
	}
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
	const profiles: Record<string, ModelSelection> = {
		fast: {
			provider: "openai-codex",
			modelId: "gpt-5.6-luna",
			thinking: "minimal",
		},
	};
	const profileSources: Record<string, ModelProfileSource> = { fast: "built-in-profile" };
	for (const [name, profile] of Object.entries(settings?.profiles ?? {})) {
		const parsed = parseModelRef(profile.model, profile.thinking);
		if (parsed === undefined)
			return resultErrOf(
				"invalid-model-policy",
				`Model profile ${JSON.stringify(name)} must be a qualified provider/model reference.`,
			);
		profiles[name] = parsed;
		profileSources[name] = "project-profile";
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
	return { ok: true, value: { profiles, profileSources, operations } };
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
