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
				value: { profile: "fast", modelRef: "openai-codex/gpt-5.6-luna", source: "builtin" },
			});
	});

	test("allows redefining fast and named profiles", () => {
		const policy = parseModelPolicyToml(
			'[models.profiles]\nfast = "acme/quick"\ndeep = "acme/deep"',
		);
		expect(policy).toMatchObject({
			ok: true,
			value: { profiles: { fast: { provider: "acme" }, deep: { modelId: "deep" } } },
		});
	});

	test("resolves operation overrides and accepts unknown operation keys", () => {
		const policy = parseModelPolicyToml(
			'[models.profiles]\ndeep = "acme/deep"\n[models.operations]\ncustom = "deep"',
		);
		expect(policy.ok).toBe(true);
		if (policy.ok)
			expect(resolveModelOperation(policy.value, "custom")).toMatchObject({
				ok: true,
				value: { profile: "deep", modelRef: "acme/deep", source: "project-operation" },
			});
	});

	test("rejects empty operation keys and invalid or empty profile names", () => {
		expect(parseModelPolicyToml('[models.operations]\n"" = "fast"')).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy" },
		});
		expect(parseModelPolicyToml('[models.profiles]\n"" = "acme/fast"')).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy" },
		});
		expect(parseModelPolicyToml('[models.profiles]\n"  " = "acme/fast"')).toMatchObject({
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
		expect(parseModelPolicyToml('[models.profiles]\nfast = "not-qualified"')).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy" },
		});
	});

	test("loads model settings without validating unrelated point installations", () => {
		const gateway: ProjectConfigGateway = {
			readTextFile: () => ({
				type: "found",
				text: '[models.profiles]\nfast = "acme/fast"\n[points]\n"flow.submit.pre" = ["just"]\n',
			}),
			pathExists: () => ({ type: "missing" }),
		};

		expect(loadModelPolicy({ repoRoot: "/repo", gateway })).toMatchObject({
			ok: true,
			value: { profiles: { fast: { provider: "acme", modelId: "fast" } } },
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
