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
	test("defaults both operations through fast without consulting a session model", () => {
		const result = resolveContextProfilerAnalysisStartup({
			repoRoot: "/repo",
			registry,
			projectConfigGateway: projectConfig(`
[models.profiles.fast]
model = "vercel-ai-gateway/openai/gpt-5.6-luna"
thinking = "medium"
`),
		});

		expect(result).toMatchObject({
			type: "available",
			gateway: {
				segmentationModel: "vercel-ai-gateway/openai/gpt-5.6-luna",
				episodeAnalysisModel: "vercel-ai-gateway/openai/gpt-5.6-luna",
			},
		});
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
		});

		expect(result).toMatchObject({
			type: "available",
			gateway: {
				segmentationModel: "gateway/openai/gpt-5.6-luna",
				episodeAnalysisModel: "gateway/openai/gpt-5.6-terra",
			},
		});
	});

	test("uses the built-in fast profile when project config is missing", () => {
		const missing: ProjectConfigGateway = {
			readTextFile: () => ({ type: "missing" }),
			pathExists: () => ({ type: "missing" }),
		};
		const result = resolveContextProfilerAnalysisStartup({
			repoRoot: "/repo",
			registry,
			projectConfigGateway: missing,
		});

		expect(result).toMatchObject({
			type: "available",
			gateway: {
				segmentationModel: "openai-codex/gpt-5.6-luna",
				episodeAnalysisModel: "openai-codex/gpt-5.6-luna",
			},
		});
	});
});
