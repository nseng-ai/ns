import { describe, expect, test } from "vitest";

import type { AnalysisModelRegistry } from "../../src/context-profiler/analysis-model-gateway.ts";
import { resolveContextProfilerAnalysisStartup } from "../../src/context-profiler/extension.ts";
import type { EffectiveProjectConfig, ProjectSetting } from "@nseng-ai/sdk/project-config";

function projectConfig(
	models: unknown,
	calls: ProjectSetting<unknown>[] = [],
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

const registry: AnalysisModelRegistry = {
	find: () => undefined,
	getApiKeyAndHeaders: () => Promise.resolve({ ok: true, apiKey: "unused" }),
};

describe("context profiler model-policy wiring", () => {
	test("defaults both operations through fast from one whole-policy lookup", async () => {
		const calls: ProjectSetting<unknown>[] = [];
		const result = await resolveContextProfilerAnalysisStartup({
			projectConfig: projectConfig(
				{
					profiles: {
						fast: {
							model: "vercel-ai-gateway/openai/gpt-5.6-luna",
							thinking: "medium",
						},
					},
					operations: {},
				},
				calls,
			),
			registry,
		});

		expect(result).toMatchObject({
			type: "available",
			gateway: {
				segmentationModel: "vercel-ai-gateway/openai/gpt-5.6-luna",
				episodeAnalysisModel: "vercel-ai-gateway/openai/gpt-5.6-luna",
			},
		});
		expect(calls).toHaveLength(1);
	});

	test("honors independent operation overrides", async () => {
		const result = await resolveContextProfilerAnalysisStartup({
			projectConfig: projectConfig({
				profiles: {
					fast: { model: "gateway/openai/gpt-5.6-luna", thinking: "medium" },
					standard: { model: "gateway/openai/gpt-5.6-terra", thinking: "high" },
				},
				operations: { "context-profiler.episode-analysis": "standard" },
			}),
			registry,
		});

		expect(result).toMatchObject({
			type: "available",
			gateway: {
				segmentationModel: "gateway/openai/gpt-5.6-luna",
				episodeAnalysisModel: "gateway/openai/gpt-5.6-terra",
			},
		});
	});

	test("returns explicit unavailability for missing policy", async () => {
		const result = await resolveContextProfilerAnalysisStartup({
			projectConfig: projectConfig({ profiles: {}, operations: {} }),
			registry,
		});

		expect(result).toMatchObject({
			type: "unavailable",
			message: expect.stringContaining("[models.profiles.fast]"),
		});
	});
});
