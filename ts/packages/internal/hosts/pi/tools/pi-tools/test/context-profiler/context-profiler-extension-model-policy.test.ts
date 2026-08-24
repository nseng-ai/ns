import { createModelExecutionCoordinator } from "@nseng-ai/extension-kit/model-execution";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import { describe, expect, test } from "vitest";

import type { AnalysisModelRegistry } from "../../src/context-profiler/analysis-model-gateway.ts";
import { resolveContextProfilerAnalysisStartup } from "../../src/context-profiler/extension.ts";

function projectConfig(source: string): ProjectConfigGateway {
	return {
		readTextFile: () => ({ type: "found", text: source }),
		pathExists: () => ({ type: "missing" }),
	};
}

const registry: AnalysisModelRegistry = {
	find: () => undefined,
	getApiKeyAndHeaders: () => Promise.resolve({ ok: true, apiKey: "unused" }),
};

describe("context profiler model-policy wiring", () => {
	test("configured fast profile suppresses warnings when execution starts", async () => {
		const warnings: string[] = [];
		const result = resolveContextProfilerAnalysisStartup({
			repoRoot: "/repo",
			registry,
			projectConfigGateway: projectConfig(`
[models.profiles.fast]
model = "vercel-ai-gateway/openai/gpt-5.6-luna"
thinking = "medium"
`),
			modelExecutionCoordinator: createModelExecutionCoordinator({
				warn: (warning) => warnings.push(warning),
			}),
		});

		expect(result).toMatchObject({
			type: "available",
			gateway: {
				segmentationModel: "vercel-ai-gateway/openai/gpt-5.6-luna",
				episodeAnalysisModel: "vercel-ai-gateway/openai/gpt-5.6-luna",
			},
		});
		if (result.type !== "available") throw new Error("expected available analysis");
		await result.gateway.segmentTurns({ json: "{}" }, { signal: new AbortController().signal });
		expect(warnings).toEqual([]);
	});

	test("honors independent operation overrides", () => {
		const result = resolveContextProfilerAnalysisStartup({
			repoRoot: "/repo",
			registry,
			projectConfigGateway: projectConfig(`
[models.profiles.fast]
model = "gateway/openai/gpt-5.6-luna"
thinking = "medium"
[models.profiles.standard]
model = "gateway/openai/gpt-5.6-terra"
thinking = "high"
[models.operations]
"context-profiler.episode-analysis" = "standard"
`),
			modelExecutionCoordinator: createModelExecutionCoordinator({ warn: () => {} }),
		});

		expect(result).toMatchObject({
			type: "available",
			gateway: {
				segmentationModel: "gateway/openai/gpt-5.6-luna",
				episodeAnalysisModel: "gateway/openai/gpt-5.6-terra",
			},
		});
	});

	test("shares one fallback warning across refreshed analysis startups", async () => {
		const missing: ProjectConfigGateway = {
			readTextFile: () => ({ type: "missing" }),
			pathExists: () => ({ type: "missing" }),
		};
		const warnings: string[] = [];
		const modelExecutionCoordinator = createModelExecutionCoordinator({
			warn: (warning) => warnings.push(warning),
		});
		const first = resolveContextProfilerAnalysisStartup({
			repoRoot: "/repo",
			registry,
			projectConfigGateway: missing,
			modelExecutionCoordinator,
		});
		const refreshed = resolveContextProfilerAnalysisStartup({
			repoRoot: "/repo",
			registry,
			projectConfigGateway: missing,
			modelExecutionCoordinator,
		});
		if (first.type !== "available" || refreshed.type !== "available") {
			throw new Error("expected available analysis");
		}
		const signal = new AbortController().signal;

		await first.gateway.segmentTurns({ json: "{}" }, { signal });
		await refreshed.gateway.segmentTurns({ json: "{}" }, { signal });

		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("using built-in");
	});

	test("keeps analysis available and warns once at execution across parallel operations", async () => {
		const missing: ProjectConfigGateway = {
			readTextFile: () => ({ type: "missing" }),
			pathExists: () => ({ type: "missing" }),
		};
		const warnings: string[] = [];
		const result = resolveContextProfilerAnalysisStartup({
			repoRoot: "/repo",
			registry,
			projectConfigGateway: missing,
			modelExecutionCoordinator: createModelExecutionCoordinator({
				warn: (warning) => warnings.push(warning),
			}),
		});

		expect(result).toMatchObject({
			type: "available",
			gateway: {
				segmentationModel: "openai-codex/gpt-5.6-luna",
				episodeAnalysisModel: "openai-codex/gpt-5.6-luna",
			},
		});
		expect(warnings).toEqual([]);
		if (result.type !== "available") throw new Error("expected available analysis");
		const signal = new AbortController().signal;
		await Promise.all([
			result.gateway.segmentTurns({ json: "{}" }, { signal }),
			result.gateway.analyzeEpisode({ json: "{}" }, { signal }),
		]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("using built-in");
	});
});
