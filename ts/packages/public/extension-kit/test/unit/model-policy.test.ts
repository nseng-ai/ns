import { describe, expect, test } from "vitest";

import {
	formatModelPolicyFallbackWarning,
	loadModelPolicy,
	MODEL_OPERATION_IDS,
	parseModelPolicyToml,
	resolveModelOperation,
} from "@nseng-ai/extension-kit/model-policy";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

const BUILT_IN_FAST_SELECTION = {
	provider: "openai-codex",
	modelId: "gpt-5.6-luna",
	thinking: "minimal" as const,
};
const FALLBACK_WARNING =
	"No configured fast model profile was found; using built-in openai-codex/gpt-5.6-luna with minimal thinking.";

describe("model policy", () => {
	test("publishes stable operation identifiers", () => {
		expect(MODEL_OPERATION_IDS.flowPrInventory).toBe("flow.pr-inventory");
		expect(MODEL_OPERATION_IDS.contextProfilerSegmentation).toBe("context-profiler.segmentation");
		expect(MODEL_OPERATION_IDS.contextProfilerEpisodeAnalysis).toBe(
			"context-profiler.episode-analysis",
		);
		expect(MODEL_OPERATION_IDS).not.toHaveProperty("flowPrDescription");
	});

	test("uses the built-in fast profile with zero config", () => {
		const policy = parseModelPolicyToml("");
		expect(policy).toEqual({
			ok: true,
			value: {
				profiles: { fast: BUILT_IN_FAST_SELECTION },
				profileSources: { fast: "built-in" },
				operations: {},
			},
		});
		if (!policy.ok) return;

		const resolved = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
		expect(resolved).toEqual({
			ok: true,
			value: {
				operationId: MODEL_OPERATION_IDS.slug,
				profile: "fast",
				selection: BUILT_IN_FAST_SELECTION,
				profileSource: "built-in",
				operationSource: "default",
			},
		});
		if (resolved.ok)
			expect(formatModelPolicyFallbackWarning(resolved.value)).toBe(FALLBACK_WARNING);
	});

	test("uses the built-in fast profile when ns.toml is missing", () => {
		const missing: ProjectConfigGateway = {
			readTextFile: () => ({ type: "missing" }),
			pathExists: () => ({ type: "missing" }),
		};
		expect(loadModelPolicy({ repoRoot: "/repo", gateway: missing })).toMatchObject({
			ok: true,
			value: {
				profiles: { fast: BUILT_IN_FAST_SELECTION },
				profileSources: { fast: "built-in" },
			},
		});
	});

	test("keeps the built-in fast profile when only a non-fast profile is configured", () => {
		const policy = parseModelPolicyToml(`
[models.profiles.deep]
model = "acme/deep"
thinking = "high"
`);
		expect(policy).toMatchObject({
			ok: true,
			value: {
				profiles: {
					fast: BUILT_IN_FAST_SELECTION,
					deep: { provider: "acme", modelId: "deep", thinking: "high" },
				},
				profileSources: { fast: "built-in", deep: "project" },
			},
		});
	});

	test("replaces the built-in fast profile with the project fast profile", () => {
		const policy = parseModelPolicyToml(`
[models.profiles.fast]
model = "acme/quick"
thinking = "medium"
[models.profiles.deep]
model = "acme/deep"
thinking = "high"
`);
		expect(policy).toMatchObject({
			ok: true,
			value: {
				profiles: {
					fast: { provider: "acme", modelId: "quick", thinking: "medium" },
					deep: { provider: "acme", modelId: "deep", thinking: "high" },
				},
				profileSources: { fast: "project", deep: "project" },
			},
		});
		if (!policy.ok) return;

		const resolved = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
		expect(resolved).toMatchObject({
			ok: true,
			value: { profileSource: "project", operationSource: "default" },
		});
		if (resolved.ok) expect(formatModelPolicyFallbackWarning(resolved.value)).toBeUndefined();
	});

	test("allows a project operation override to select the built-in fast profile", () => {
		const policy = parseModelPolicyToml(`
[models.profiles.deep]
model = "acme/deep"
thinking = "high"
[models.operations]
custom = "fast"
`);
		expect(policy.ok).toBe(true);
		if (!policy.ok) return;

		const resolved = resolveModelOperation(policy.value, "custom");
		expect(resolved).toEqual({
			ok: true,
			value: {
				operationId: "custom",
				profile: "fast",
				selection: BUILT_IN_FAST_SELECTION,
				profileSource: "built-in",
				operationSource: "project",
			},
		});
		if (resolved.ok)
			expect(formatModelPolicyFallbackWarning(resolved.value)).toBe(FALLBACK_WARNING);
	});

	test("does not warn for an identical fast tuple explicitly configured by the project", () => {
		const policy = parseModelPolicyToml(`
[models.profiles.fast]
model = "openai-codex/gpt-5.6-luna"
thinking = "minimal"
`);
		expect(policy.ok).toBe(true);
		if (!policy.ok) return;

		const resolved = resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug);
		expect(resolved).toMatchObject({
			ok: true,
			value: { selection: BUILT_IN_FAST_SELECTION, profileSource: "project" },
		});
		if (resolved.ok) expect(formatModelPolicyFallbackWarning(resolved.value)).toBeUndefined();
	});

	test("rejects empty operation keys and invalid or empty profile names", () => {
		expect(parseModelPolicyToml('[models.operations]\n"" = "fast"')).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy" },
		});
		expect(
			parseModelPolicyToml('[models.profiles.""]\nmodel = "acme/fast"\nthinking = "minimal"'),
		).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy" },
		});
		expect(
			parseModelPolicyToml('[models.profiles."  "]\nmodel = "acme/fast"\nthinking = "minimal"'),
		).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy" },
		});
	});

	test("rejects dangling overrides and malformed model policy input", () => {
		expect(parseModelPolicyToml('[models.operations]\nfoo = "missing"')).toMatchObject({
			ok: false,
			error: { code: "missing-profile" },
		});
		expect(parseModelPolicyToml('[models]\nprofiles = "nope"')).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy" },
		});
		expect(
			parseModelPolicyToml('[models.profiles.fast]\nmodel = "not-qualified"\nthinking = "minimal"'),
		).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy" },
		});
		expect(parseModelPolicyToml('[models.profiles]\nfast = "acme/fast"')).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy" },
		});
		expect(
			parseModelPolicyToml(
				'[models.profiles.fast]\nmodel = "acme/fast"\nthinking = "minimal"\nextra = true',
			),
		).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy" },
		});
	});

	test("loads model settings without validating unrelated point installations", () => {
		const gateway: ProjectConfigGateway = {
			readTextFile: () => ({
				type: "found",
				text: '[models.profiles.fast]\nmodel = "acme/fast"\nthinking = "minimal"\n[points]\n"flow.submit.pre" = ["just"]\n',
			}),
			pathExists: () => ({ type: "missing" }),
		};

		expect(loadModelPolicy({ repoRoot: "/repo", gateway })).toMatchObject({
			ok: true,
			value: {
				profiles: { fast: { provider: "acme", modelId: "fast", thinking: "minimal" } },
				profileSources: { fast: "project" },
			},
		});
	});
});
