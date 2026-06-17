import { InMemoryGitGateway } from "@asdl/core/git/testing";
import { describe, expect, test } from "vitest";

import type { AregCliContext } from "../../src/context.ts";
import {
	FakeAregGithubGateway,
	FakeAregHostGateway,
	FakeAregNpxSkillsGateway,
	FakeAregProjectGateway,
	FakeAregPromptGateway,
	FakeAregSkillxWorkspaceGateway,
} from "../../src/fake-gateways.ts";
import { applyProjectMutationPlan } from "../../src/operations/project-mutations.ts";

function context(project: FakeAregProjectGateway): AregCliContext {
	return {
		host: new FakeAregHostGateway(),
		github: new FakeAregGithubGateway(),
		skillxWorkspace: new FakeAregSkillxWorkspaceGateway(),
		project,
		git: new InMemoryGitGateway(),
		npxSkills: new FakeAregNpxSkillsGateway(),
		prompt: new FakeAregPromptGateway(),
		cwd: "/repo",
		env: {},
	};
}

describe("applyProjectMutationPlan", () => {
	test("preflight failure prevents mutation and reports not-attempted operations", async () => {
		const project = new FakeAregProjectGateway({
			preflightFailures: {
				"skills/demo/agents/openai.yaml": { code: "preflight-denied", message: "preflight denied" },
			},
		});

		const result = await applyProjectMutationPlan({
			ctx: context(project),
			projectDir: "/repo",
			policy: "skill-kind",
			writes: [
				{ relativePath: "skills/demo/SKILL.md", content: "demo", description: "SKILL.md", createParent: false },
				{ relativePath: "skills/demo/agents/openai.yaml", content: "policy", description: "Codex openai.yaml", createParent: true },
			],
			deletes: [{ relativePath: ".pi/settings.json", description: "Pi settings" }],
			removeEmptyDirs: [],
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "preflight-denied" },
			writtenRelativePaths: [],
			deletedRelativePaths: [],
			removedEmptyDirRelativePaths: [],
			operationStatuses: [
				{ type: "write", path: "skills/demo/SKILL.md", status: "not_attempted" },
				{ type: "write", path: "skills/demo/agents/openai.yaml", status: "failed", error: { code: "preflight-denied" } },
				{ type: "delete", path: ".pi/settings.json", status: "not_attempted" },
			],
		});
		expect(project.text("skills/demo/SKILL.md")).toBeUndefined();
		expect(project.operations().map((operation) => operation.type)).toEqual([
			"preflight-write-text-file",
			"preflight-write-text-file",
			"preflight-delete-file",
		]);
	});

	test("execution failure returns partial operation statuses", async () => {
		const project = new FakeAregProjectGateway({
			mutationFailures: {
				"skills/demo/agents/openai.yaml": { code: "write-failed", message: "write failed" },
			},
		});

		const result = await applyProjectMutationPlan({
			ctx: context(project),
			projectDir: "/repo",
			policy: "skill-kind",
			writes: [
				{ relativePath: "skills/demo/SKILL.md", content: "demo", description: "SKILL.md", createParent: false },
				{ relativePath: "skills/demo/agents/openai.yaml", content: "policy", description: "Codex openai.yaml", createParent: true },
			],
			deletes: [{ relativePath: ".pi/settings.json", description: "Pi settings" }],
			removeEmptyDirs: [],
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "write-failed" },
			writtenRelativePaths: ["skills/demo/SKILL.md"],
			deletedRelativePaths: [],
			removedEmptyDirRelativePaths: [],
			operationStatuses: [
				{ type: "write", path: "skills/demo/SKILL.md", status: "applied" },
				{ type: "write", path: "skills/demo/agents/openai.yaml", status: "failed", error: { code: "write-failed" } },
				{ type: "delete", path: ".pi/settings.json", status: "not_attempted" },
			],
		});
		expect(project.text("skills/demo/SKILL.md")).toBe("demo");
		expect(project.text("skills/demo/agents/openai.yaml")).toBeUndefined();
	});
});
