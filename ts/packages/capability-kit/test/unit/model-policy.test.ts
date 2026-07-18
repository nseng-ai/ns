import { describe, expect, test } from "vitest";

import {
	loadModelPolicy,
	parseModelPolicyToml,
	resolveModelOperation,
} from "@nseng-ai/capability-kit/model-policy";
import type {
	ProjectConfigGateway,
	ProjectConfigReadResult,
} from "@nseng-ai/sdk/project-config/points";

class ModelPolicyConfigGateway implements ProjectConfigGateway {
	readonly reads: string[] = [];
	private readonly files: Readonly<Record<string, string>>;
	private readonly readErrors: Readonly<Record<string, string>>;

	constructor(
		files: Readonly<Record<string, string>>,
		readErrors: Readonly<Record<string, string>> = {},
	) {
		this.files = files;
		this.readErrors = readErrors;
	}

	readTextFile(request: { relativePath: string }): ProjectConfigReadResult {
		this.reads.push(request.relativePath);
		const readError = this.readErrors[request.relativePath];
		if (readError !== undefined) return { type: "error", message: readError };
		const text = this.files[request.relativePath];
		return text === undefined ? { type: "missing" } : { type: "found", text };
	}

	pathExists(): { type: "missing" } {
		return { type: "missing" };
	}
}

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
		const gateway = new ModelPolicyConfigGateway({
			"ns.toml": '[models.profiles]\nfast = "acme/fast"\n[points]\n"flow.submit.pre" = ["just"]\n',
		});

		expect(loadModelPolicy({ repoRoot: "/repo", gateway })).toMatchObject({
			ok: true,
			value: { profiles: { fast: { provider: "acme", modelId: "fast" } } },
		});
	});

	test("recursively merges profiles and lets local settings override base settings", () => {
		const gateway = new ModelPolicyConfigGateway({
			"ns.toml": `
[models.profiles]
fast = "base/fast"
deep = "base/deep"
[models.operations]
slug = "deep"
flow = "fast"
`,
			"ns.local.toml": `
[models.profiles]
fast = "local/fast"
review = "local/review"
[models.operations]
flow = "review"
`,
		});

		expect(loadModelPolicy({ repoRoot: "/repo", gateway })).toMatchObject({
			ok: true,
			value: {
				profiles: {
					fast: { provider: "local", modelId: "fast" },
					deep: { provider: "base", modelId: "deep" },
					review: { provider: "local", modelId: "review" },
				},
				operations: { slug: "deep", flow: "review" },
				fastSource: "project-profile",
			},
		});
	});

	test.each([
		{
			name: "both sources",
			files: {},
			expectedProvider: "openai-codex",
		},
		{
			name: "base source",
			files: { "ns.toml": '[models.profiles]\nfast = "base/fast"' },
			expectedProvider: "base",
		},
		{
			name: "local source",
			files: { "ns.local.toml": '[models.profiles]\nfast = "local/fast"' },
			expectedProvider: "local",
		},
	])("loads with missing $name", ({ files, expectedProvider }) => {
		const gateway = new ModelPolicyConfigGateway(files);

		expect(loadModelPolicy({ repoRoot: "/repo", gateway })).toMatchObject({
			ok: true,
			value: { profiles: { fast: { provider: expectedProvider } } },
		});
		expect(gateway.reads).toEqual(["ns.toml", "ns.local.toml"]);
	});

	test("reports malformed local config as invalid TOML with its source name", () => {
		const gateway = new ModelPolicyConfigGateway({ "ns.local.toml": "[models" });

		expect(loadModelPolicy({ repoRoot: "/repo", gateway })).toMatchObject({
			ok: false,
			error: {
				code: "invalid-toml",
				message: expect.stringContaining("ns.local.toml"),
			},
		});
	});

	test("reports local read failures as invalid TOML with its source name", () => {
		const gateway = new ModelPolicyConfigGateway({}, { "ns.local.toml": "permission denied" });

		expect(loadModelPolicy({ repoRoot: "/repo", gateway })).toEqual({
			ok: false,
			error: {
				code: "invalid-toml",
				message: "Failed to read ns.local.toml: permission denied",
			},
		});
	});
});
