import { describe, expect, test } from "vitest";

import {
	loadModelPolicy,
	parseModelPolicyToml,
	resolveModelOperation,
} from "@nseng-ai/capability-kit/model-policy";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

describe("model policy", () => {
	test("uses the built-in fast profile with zero config", () => {
		const policy = parseModelPolicyToml("");
		expect(policy.ok).toBe(true);
		if (policy.ok)
			expect(resolveModelOperation(policy.value, "slug")).toMatchObject({
				ok: true,
				value: {
					profile: "fast",
					selection: {
						provider: "openai-codex",
						modelId: "gpt-5.6-luna",
						thinking: "minimal" as const,
					},
					source: "builtin",
				},
			});
	});

	test("allows redefining fast and named profiles", () => {
		const policy = parseModelPolicyToml(`
[models.profiles.fast]
model = "acme/quick"
thinking = "minimal"
[models.profiles.deep]
model = "acme/deep"
thinking = "high"
`);
		expect(policy).toMatchObject({
			ok: true,
			value: {
				profiles: {
					fast: { provider: "acme", thinking: "minimal" as const },
					deep: { modelId: "deep", thinking: "high" },
				},
			},
		});
	});

	test("resolves operation overrides and accepts unknown operation keys", () => {
		const policy = parseModelPolicyToml(
			'[models.profiles.deep]\nmodel = "acme/deep"\nthinking = "high"\n[models.operations]\ncustom = "deep"',
		);
		expect(policy.ok).toBe(true);
		if (policy.ok)
			expect(resolveModelOperation(policy.value, "custom")).toMatchObject({
				ok: true,
				value: {
					profile: "deep",
					selection: { provider: "acme", modelId: "deep", thinking: "high" },
					source: "project-operation",
				},
			});
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

	test("rejects dangling profiles, malformed tables, and malformed refs", () => {
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
				profiles: { fast: { provider: "acme", modelId: "fast", thinking: "minimal" as const } },
			},
		});
	});

	test("loads missing ns.toml as zero config through the gateway", () => {
		const missing: ProjectConfigGateway = {
			readTextFile: () => ({ type: "missing" }),
			pathExists: () => ({ type: "missing" }),
		};
		expect(loadModelPolicy({ repoRoot: "/repo", gateway: missing })).toMatchObject({
			ok: true,
			value: { profiles: { fast: { provider: "openai-codex" } } },
		});
	});
});
