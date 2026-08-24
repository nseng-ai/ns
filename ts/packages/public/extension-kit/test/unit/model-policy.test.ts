import { describe, expect, test } from "vitest";

import {
	MODEL_OPERATION_IDS,
	modelPolicySetting,
	resolveEffectiveModelOperation,
	resolveEffectiveModelPolicy,
	resolveModelOperation,
} from "@nseng-ai/extension-kit/model-policy";
import type { EffectiveProjectConfig, ProjectSetting } from "@nseng-ai/sdk/project-config";

function fakeProjectConfig(
	models: unknown,
	calls: ProjectSetting<unknown>[],
): EffectiveProjectConfig {
	return {
		async get<T>(setting: ProjectSetting<T>) {
			calls.push(setting);
			return {
				ok: true,
				value: {
					value: setting.schema.parse(models),
					provenance: {
						source: "project",
						path: "/repo/ns.toml",
						settingPath: [...setting.path],
					},
				},
			};
		},
	};
}

const configuredModels = {
	profiles: {
		fast: { model: "acme/quick", thinking: "minimal" },
		deep: { model: "acme/deep", thinking: "high" },
	},
	operations: { custom: "deep" },
};

describe("model policy", () => {
	test("publishes stable operation identifiers", () => {
		expect(MODEL_OPERATION_IDS.flowPrInventory).toBe("flow.pr-inventory");
		expect(MODEL_OPERATION_IDS.contextProfilerSegmentation).toBe("context-profiler.segmentation");
		expect(MODEL_OPERATION_IDS.contextProfilerEpisodeAnalysis).toBe(
			"context-profiler.episode-analysis",
		);
		expect(MODEL_OPERATION_IDS).not.toHaveProperty("flowPrDescription");
	});

	test("declares and validates the raw models setting", () => {
		expect(modelPolicySetting.path).toEqual(["models"]);
		expect(modelPolicySetting.schema.parse(configuredModels)).toEqual(configuredModels);
		expect(modelPolicySetting.schema.parse({ profiles: configuredModels.profiles })).toEqual({
			profiles: configuredModels.profiles,
			operations: {},
		});
		expect(modelPolicySetting.schema.safeParse({ profiles: "invalid" }).success).toBe(false);
		expect(
			modelPolicySetting.schema.safeParse({
				profiles: { "": { model: "acme/quick", thinking: "minimal" } },
			}).success,
		).toBe(false);
		expect(
			modelPolicySetting.schema.safeParse({
				profiles: configuredModels.profiles,
				operations: { "": "fast" },
			}).success,
		).toBe(false);
	});

	test("transforms raw settings into a model policy with qualified model selections", async () => {
		const calls: ProjectSetting<unknown>[] = [];

		await expect(
			resolveEffectiveModelPolicy(fakeProjectConfig(configuredModels, calls)),
		).resolves.toEqual({
			ok: true,
			value: {
				profiles: {
					fast: { provider: "acme", modelId: "quick", thinking: "minimal" },
					deep: { provider: "acme", modelId: "deep", thinking: "high" },
				},
				operations: { custom: "deep" },
			},
		});
		expect(calls).toEqual([modelPolicySetting]);
	});

	test("requires fast and rejects malformed model references and dangling operations", async () => {
		const cases = [
			{
				models: { profiles: {}, operations: {} },
				code: "missing-profile",
				message: "[models.profiles.fast]",
			},
			{
				models: {
					profiles: { fast: { model: "not-qualified", thinking: "minimal" } },
					operations: {},
				},
				code: "invalid-model-policy",
				message: "qualified provider/model",
			},
			{
				models: {
					profiles: { fast: { model: "acme/quick", thinking: "minimal" } },
					operations: { custom: "missing" },
				},
				code: "missing-profile",
				message: "missing profile",
			},
		] as const;

		for (const item of cases) {
			const result = await resolveEffectiveModelPolicy(fakeProjectConfig(item.models, []));
			expect(result).toMatchObject({
				ok: false,
				error: {
					type: "model-policy",
					error: { code: item.code, message: expect.stringContaining(item.message) },
				},
			});
		}
	});

	test("preserves typed project-config failures", async () => {
		const projectConfig: EffectiveProjectConfig = {
			async get() {
				return {
					ok: false,
					error: { code: "project-not-found", cwd: "/outside" },
				};
			},
		};

		await expect(resolveEffectiveModelPolicy(projectConfig)).resolves.toEqual({
			ok: false,
			error: {
				type: "project-config",
				error: { code: "project-not-found", cwd: "/outside" },
			},
		});
	});

	test("resolves pure defaults and operation overrides with source evidence", async () => {
		const policy = await resolveEffectiveModelPolicy(fakeProjectConfig(configuredModels, []));
		expect(policy.ok).toBe(true);
		if (!policy.ok) return;

		expect(resolveModelOperation(policy.value, "unconfigured")).toEqual({
			ok: true,
			value: {
				operationId: "unconfigured",
				profile: "fast",
				selection: { provider: "acme", modelId: "quick", thinking: "minimal" },
				source: "project-profile",
			},
		});
		expect(resolveModelOperation(policy.value, "custom")).toEqual({
			ok: true,
			value: {
				operationId: "custom",
				profile: "deep",
				selection: { provider: "acme", modelId: "deep", thinking: "high" },
				source: "project-operation",
			},
		});
	});

	test("composes effective policy lookup with pure operation resolution", async () => {
		const calls: ProjectSetting<unknown>[] = [];

		await expect(
			resolveEffectiveModelOperation(fakeProjectConfig(configuredModels, calls), "custom"),
		).resolves.toEqual({
			ok: true,
			value: {
				operationId: "custom",
				profile: "deep",
				selection: { provider: "acme", modelId: "deep", thinking: "high" },
				source: "project-operation",
			},
		});
		expect(calls).toEqual([modelPolicySetting]);
	});

	test("one whole-policy read supports repeated operation resolution", async () => {
		const calls: ProjectSetting<unknown>[] = [];
		const policy = await resolveEffectiveModelPolicy(fakeProjectConfig(configuredModels, calls));
		expect(policy.ok).toBe(true);
		if (!policy.ok) return;

		expect(resolveModelOperation(policy.value, MODEL_OPERATION_IDS.slug).ok).toBe(true);
		expect(resolveModelOperation(policy.value, "custom").ok).toBe(true);
		expect(calls).toEqual([modelPolicySetting]);
	});
});
