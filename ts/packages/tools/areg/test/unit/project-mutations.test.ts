import { createFakeClinkrInteraction } from "@ns/clinkr/testing";
import { InMemoryGitGateway } from "@ns/capability-kit/git/testing";
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
		interaction: createFakeClinkrInteraction().interaction,
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
				{
					relativePath: "skills/demo/SKILL.md",
					content: "demo",
					description: "SKILL.md",
					createParent: false,
				},
				{
					relativePath: "skills/demo/agents/openai.yaml",
					content: "policy",
					description: "Codex openai.yaml",
					createParent: true,
				},
			],
			deletes: [{ relativePath: ".pi/settings.json", description: "Pi settings" }],
			deleteSymlinks: [],
			removeEmptyDirs: [],
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "preflight-denied" },
			appliedPaths: { written: [], deleted: [], deletedSymlink: [], removedEmptyDir: [] },
			operationStatuses: [
				{ type: "write", path: "skills/demo/SKILL.md", status: "not-attempted" },
				{
					type: "write",
					path: "skills/demo/agents/openai.yaml",
					status: "failed",
					error: { code: "preflight-denied" },
				},
				{ type: "delete", path: ".pi/settings.json", status: "not-attempted" },
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
				{
					relativePath: "skills/demo/SKILL.md",
					content: "demo",
					description: "SKILL.md",
					createParent: false,
				},
				{
					relativePath: "skills/demo/agents/openai.yaml",
					content: "policy",
					description: "Codex openai.yaml",
					createParent: true,
				},
			],
			deletes: [{ relativePath: ".pi/settings.json", description: "Pi settings" }],
			deleteSymlinks: [],
			removeEmptyDirs: [],
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "write-failed" },
			appliedPaths: {
				written: ["skills/demo/SKILL.md"],
				deleted: [],
				deletedSymlink: [],
				removedEmptyDir: [],
			},
			operationStatuses: [
				{ type: "write", path: "skills/demo/SKILL.md", status: "applied" },
				{
					type: "write",
					path: "skills/demo/agents/openai.yaml",
					status: "failed",
					error: { code: "write-failed" },
				},
				{ type: "delete", path: ".pi/settings.json", status: "not-attempted" },
			],
		});
		expect(project.text("skills/demo/SKILL.md")).toBe("demo");
		expect(project.text("skills/demo/agents/openai.yaml")).toBeUndefined();
	});

	test("delete-symlink operations run through the symlink gateway primitives", async () => {
		const project = new FakeAregProjectGateway({
			localSkills: [
				{
					name: "demo",
					agentsPath: { type: "symlink", target: "../../skills/demo" },
					claudePath: { type: "symlink", target: "../../.agents/skills/demo" },
				},
			],
		});

		const result = await applyProjectMutationPlan({
			ctx: context(project),
			projectDir: "/repo",
			policy: "skill-kind",
			writes: [],
			deletes: [],
			deleteSymlinks: [
				{ relativePath: ".claude/skills/demo", description: "Claude skill mirror symlink" },
				{ relativePath: ".agents/skills/demo", description: "agents skill mirror symlink" },
			],
			removeEmptyDirs: [],
		});

		expect(result).toMatchObject({
			ok: true,
			appliedPaths: { deletedSymlink: [".claude/skills/demo", ".agents/skills/demo"] },
			operationStatuses: [
				{ type: "delete-symlink", path: ".claude/skills/demo", status: "applied" },
				{ type: "delete-symlink", path: ".agents/skills/demo", status: "applied" },
			],
		});
		const skill = await project.inspectSkillKindSkill({
			projectDir: "/repo",
			skillName: "demo",
			env: {},
		});
		expect(skill.agentsPath).toEqual({ type: "missing" });
		expect(skill.claudePath).toEqual({ type: "missing" });
	});

	test("delete-symlink preflight refuses missing mirrors before mutation", async () => {
		const project = new FakeAregProjectGateway({
			localSkills: [{ name: "demo" }],
		});

		const result = await applyProjectMutationPlan({
			ctx: context(project),
			projectDir: "/repo",
			policy: "skill-kind",
			writes: [],
			deletes: [],
			deleteSymlinks: [
				{ relativePath: ".agents/skills/demo", description: "agents skill mirror symlink" },
			],
			removeEmptyDirs: [],
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: "skill-kind-delete-symlink-missing" },
			appliedPaths: { deletedSymlink: [] },
		});
		expect(project.operations().map((operation) => operation.type)).toEqual([
			"preflight-delete-symlink",
		]);
	});
});
