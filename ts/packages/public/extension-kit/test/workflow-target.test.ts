import { describe, expect, test } from "vitest";

import { loadRepositoryWorkflowTarget } from "@nseng-ai/extension-kit/workflow-target";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";

function configGateway(text: string | undefined): ProjectConfigGateway {
	return {
		readTextFile: () => (text === undefined ? { type: "missing" } : { type: "found", text }),
		pathExists: () => ({ type: "missing" }),
	};
}

describe("repository workflow target configuration", () => {
	test.each([
		[undefined, { type: "branch" }],
		["", { type: "branch" }],
		['[workflow]\nbranch-creation = "graphite"', { type: "branch" }],
		['[workflow]\nstack-provider = "graphite"', { type: "stack", provider: "graphite" }],
	] as const)("resolves %j", (source, target) => {
		const result = loadRepositoryWorkflowTarget({
			repoRoot: "/repo",
			gateway: configGateway(source),
		});
		expect(result).toEqual({ ok: true, value: target });
	});

	test.each([
		["[workflow", "invalid-toml"],
		['workflow = "graphite"', "invalid-workflow"],
		['[workflow]\nstack-provider = "gh-stack"', "invalid-stack-provider"],
		["[workflow]\nstack-provider = true", "invalid-stack-provider"],
	] as const)("fails closed for invalid configuration", (source, code) => {
		const result = loadRepositoryWorkflowTarget({
			repoRoot: "/repo",
			gateway: configGateway(source),
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe(code);
			expect(result.error.message).toContain("ns.toml");
		}
	});

	test("preserves stable read-failure diagnostics", () => {
		const gateway: ProjectConfigGateway = {
			readTextFile: () => ({ type: "error", message: "permission denied" }),
			pathExists: () => ({ type: "missing" }),
		};
		const result = loadRepositoryWorkflowTarget({ repoRoot: "/repo", gateway });
		expect(result).toEqual({
			ok: false,
			error: {
				code: "config-read-failed",
				message: "Failed to read ns.toml: permission denied",
			},
		});
	});
});
