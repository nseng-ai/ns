import { describe, expect, test } from "vitest";

import {
	loadModelPolicy,
	parseModelPolicyToml,
	resolveModelOperation,
} from "@nseng-ai/capability-kit/model-policy";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

describe("model policy", () => {
	test("parses structured profiles with model and thinking", () => {
		const policy = parseModelPolicyToml(`
[models.profiles.fast]
model = "acme/quick"
thinking = "minimal"

[models.profiles.deep]
model = "acme/deep"
thinking = "xhigh"
`);

		expect(policy).toEqual({
			ok: true,
			value: {
				profiles: {
					fast: {
						model: { provider: "acme", modelId: "quick" },
						thinking: "minimal",
					},
					deep: {
						model: { provider: "acme", modelId: "deep" },
						thinking: "xhigh",
					},
				},
				operations: {},
			},
		});
	});

	test.each(["off", "minimal", "low", "medium", "high", "xhigh"])(
		"accepts the %s thinking level",
		(thinking) => {
			const policy = parseModelPolicyToml(`
[models.profiles.default]
model = "acme/model"
thinking = "${thinking}"
`);
			expect(policy).toMatchObject({
				ok: true,
				value: { profiles: { default: { thinking } } },
			});
		},
	);

	test("resolves the component default profile", () => {
		const policy = parseModelPolicyToml(`
[models.profiles.quick]
model = "acme/quick"
thinking = "low"
`);
		expect(policy.ok).toBe(true);
		if (policy.ok) {
			expect(resolveModelOperation(policy.value, { id: "slug", defaultProfile: "quick" })).toEqual({
				ok: true,
				value: {
					operationId: "slug",
					profile: "quick",
					model: { provider: "acme", modelId: "quick" },
					modelRef: "acme/quick",
					thinking: "low",
					source: "component-default",
				},
			});
		}
	});

	test("resolves a project operation override instead of the component default", () => {
		const policy = parseModelPolicyToml(`
[models.profiles.quick]
model = "acme/quick"
thinking = "low"

[models.profiles.deep]
model = "other/deep"
thinking = "high"

[models.operations]
custom = "deep"
`);
		expect(policy.ok).toBe(true);
		if (policy.ok) {
			expect(
				resolveModelOperation(policy.value, { id: "custom", defaultProfile: "quick" }),
			).toEqual({
				ok: true,
				value: {
					operationId: "custom",
					profile: "deep",
					model: { provider: "other", modelId: "deep" },
					modelRef: "other/deep",
					thinking: "high",
					source: "project-override",
				},
			});
		}
	});

	test("requires the component default profile to exist", () => {
		const policy = parseModelPolicyToml("");
		expect(policy.ok).toBe(true);
		if (policy.ok) {
			expect(resolveModelOperation(policy.value, { id: "slug", defaultProfile: "quick" })).toEqual({
				ok: false,
				error: {
					code: "missing-profile",
					message: 'Model operation "slug" references missing profile "quick".',
				},
			});
		}
	});

	test("rejects legacy string profiles with an actionable path", () => {
		expect(parseModelPolicyToml('[models.profiles]\nfast = "acme/fast"', "ns.toml")).toMatchObject({
			ok: false,
			error: {
				code: "invalid-model-policy",
				message: expect.stringContaining("ns.toml: models.profiles.fast"),
			},
		});
	});

	test.each(["Bad", "bad_name", "-bad", " bad"])(
		"rejects invalid profile name %j with an actionable path",
		(name) => {
			const source = `[models.profiles.${JSON.stringify(name)}]\nmodel = "acme/model"\nthinking = "low"`;
			expect(parseModelPolicyToml(source, "ns.toml")).toMatchObject({
				ok: false,
				error: {
					code: "invalid-model-policy",
					message: expect.stringContaining(`ns.toml: models.profiles.${name}`),
				},
			});
		},
	);

	test("does not reserve conventional profile names", () => {
		const policy = parseModelPolicyToml(`
[models.profiles.fast]
model = "acme/fast"
thinking = "off"

[models.profiles.default]
model = "acme/default"
thinking = "medium"
`);
		expect(policy).toMatchObject({
			ok: true,
			value: { profiles: { fast: {}, default: {} } },
		});
	});

	test("rejects missing fields, unknown fields, invalid refs, and invalid thinking", () => {
		expect(
			parseModelPolicyToml('[models.profiles.fast]\nthinking = "low"', "ns.toml"),
		).toMatchObject({
			ok: false,
			error: {
				code: "invalid-model-policy",
				message: expect.stringContaining("models.profiles.fast.model"),
			},
		});
		expect(
			parseModelPolicyToml(
				'[models.profiles.fast]\nmodel = "acme/fast"\nthinking = "low"\nextra = true',
				"ns.toml",
			),
		).toMatchObject({
			ok: false,
			error: {
				code: "invalid-model-policy",
				message: expect.stringContaining("models.profiles.fast"),
			},
		});
		expect(
			parseModelPolicyToml(
				'[models.profiles.fast]\nmodel = "not-qualified"\nthinking = "low"',
				"ns.toml",
			),
		).toMatchObject({
			ok: false,
			error: {
				code: "invalid-model-policy",
				message: expect.stringContaining("models.profiles.fast.model"),
			},
		});
		expect(
			parseModelPolicyToml(
				'[models.profiles.fast]\nmodel = "acme/fast"\nthinking = "extreme"',
				"ns.toml",
			),
		).toMatchObject({
			ok: false,
			error: {
				code: "invalid-model-policy",
				message: expect.stringContaining("models.profiles.fast.thinking"),
			},
		});
	});

	test("rejects dangling operation overrides with an actionable path", () => {
		expect(parseModelPolicyToml('[models.operations]\nfoo = "missing"', "ns.toml")).toEqual({
			ok: false,
			error: {
				code: "missing-profile",
				message: 'ns.toml: models.operations.foo references missing profile "missing".',
			},
		});
	});

	test("reports malformed TOML separately from invalid model policy", () => {
		expect(parseModelPolicyToml("[models", "ns.toml")).toMatchObject({
			ok: false,
			error: { code: "invalid-toml", message: expect.stringContaining("ns.toml") },
		});
		expect(parseModelPolicyToml('[models]\nprofiles = "nope"', "ns.toml")).toMatchObject({
			ok: false,
			error: { code: "invalid-model-policy", message: expect.stringContaining("models.profiles") },
		});
	});

	test("rejects empty operation ids with an actionable path", () => {
		expect(parseModelPolicyToml('[models.operations]\n"" = "fast"', "ns.toml")).toMatchObject({
			ok: false,
			error: {
				code: "invalid-model-policy",
				message: expect.stringContaining("ns.toml: models.operations"),
			},
		});
	});

	test("loads model settings without validating unrelated point installations", () => {
		const gateway: ProjectConfigGateway = {
			readTextFile: () => ({
				type: "found",
				text: `
[models.profiles.fast]
model = "acme/fast"
thinking = "medium"
[points]
"flow.submit.pre" = ["just"]
`,
			}),
			pathExists: () => ({ type: "missing" }),
		};

		expect(loadModelPolicy({ repoRoot: "/repo", gateway })).toMatchObject({
			ok: true,
			value: {
				profiles: {
					fast: { model: { provider: "acme", modelId: "fast" }, thinking: "medium" },
				},
			},
		});
	});

	test("returns gateway read failures", () => {
		const failed: ProjectConfigGateway = {
			readTextFile: () => ({ type: "error", message: "permission denied" }),
			pathExists: () => ({ type: "missing" }),
		};
		expect(loadModelPolicy({ repoRoot: "/repo", gateway: failed })).toEqual({
			ok: false,
			error: { code: "invalid-toml", message: "Failed to read ns.toml: permission denied" },
		});
	});

	test("loads missing ns.toml as an empty policy without implicit profiles", () => {
		const missing: ProjectConfigGateway = {
			readTextFile: () => ({ type: "missing" }),
			pathExists: () => ({ type: "missing" }),
		};
		expect(loadModelPolicy({ repoRoot: "/repo", gateway: missing })).toEqual({
			ok: true,
			value: { profiles: {}, operations: {} },
		});
	});
});
