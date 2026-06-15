import { describe, expect, test } from "vitest";

import {
	FakeAregCheckProjectInspectionGateway,
	FakeAregGithubGateway,
	FakeAregHostGateway,
	FakeAregNpxSkillsGateway,
	FakeAregSkillxWorkspaceGateway,
	FakeAregUpdateProjectGateway,
} from "../../src/fake-gateways.ts";
import type {
	AregCheckProjectInspectionGateway,
	AregGithubGateway,
	AregHostGateway,
	AregNpxSkillsGateway,
	AregSkillxInstalledSkill,
	AregUpdateProjectGateway,
	AregSkillxWorkspaceGateway,
} from "../../src/gateways.ts";

describe("areg gateway fakes", () => {
	test("check project inspection fake copies configured state and read-only logs", async () => {
		const skillsDirectoryNames = ["demo"];
		const fake: AregCheckProjectInspectionGateway = new FakeAregCheckProjectInspectionGateway({
			lockfile: { version: 1, skills: { demo: { source: "skills/demo", sourceType: "local", computedHash: "a".repeat(64) } } },
			skillsDirectoryNames,
			skills: [{ name: "demo", skillsPath: { type: "directory" }, localSkillMd: { type: "file", text: "---\nname: demo\n---\n" } }],
		});
		skillsDirectoryNames.push("mutated-after-construction");

		const first = await fake.inspectProjectForCheck({ cwd: "/work", projectPath: ".", env: {} });
		expect(first.skillsDirectoryNames).toEqual(["demo"]);
		(first.skillsDirectoryNames as string[]).push("mutated-return");
		const second = await fake.inspectProjectForCheck({ cwd: "/work", projectPath: "subdir", env: {} });
		expect(second.skillsDirectoryNames).toEqual(["demo"]);
		expect((fake as FakeAregCheckProjectInspectionGateway).operations()).toEqual([
			{ type: "inspect-project-for-check", cwd: "/work", projectPath: "." },
			{ type: "inspect-project-for-check", cwd: "/work", projectPath: "subdir" },
		]);
	});

	test("update project fake copies configured state and logs inspections", async () => {
		const lockfile = { version: 1, skills: { demo: { source: "owner/repo", sourceType: "github", computedHash: "a".repeat(64) } } };
		const update: AregUpdateProjectGateway = new FakeAregUpdateProjectGateway({ projectDir: "/repo/project", lockfile, asdlToml: '[areg]\nagents = ["codex"]\n' });
		lockfile.skills.demo.source = "mutated/repo";

		const first = await update.inspectProjectForUpdate({ cwd: "/repo", projectPath: "project", env: {} });
		expect(first).toMatchObject({ projectDir: "/repo/project", projectPathState: { type: "directory" }, lockfile: { type: "file", text: expect.stringContaining("owner/repo") } });
		if (first.lockfile.type === "file") first.lockfile.text = "mutated return";
		const second = await update.inspectProjectForUpdate({ cwd: "/repo", projectPath: ".", env: {} });
		expect(second.lockfile).toMatchObject({ type: "file", text: expect.stringContaining("owner/repo") });
		expect((update as FakeAregUpdateProjectGateway).operations()).toEqual([
			{ type: "inspect-project-for-update", cwd: "/repo", projectPath: "project" },
			{ type: "inspect-project-for-update", cwd: "/repo", projectPath: "." },
		]);
	});

	test("host fake implements tool checks and read-only operation logs", async () => {
		const host: AregHostGateway = new FakeAregHostGateway({ tools: { gh: "/bin/gh", npx: null } });
		expect(await host.checkTool({ tool: "gh", cwd: "/work", env: {} })).toEqual({ type: "found", tool: "gh", path: "/bin/gh" });
		expect(await host.checkTool({ tool: "npx", cwd: "/work", env: {} })).toMatchObject({ type: "missing", tool: "npx" });

		const fake = host as FakeAregHostGateway;
		const operations = fake.operations();
		expect(operations).toEqual([
			{ type: "check-tool", tool: "gh", cwd: "/work" },
			{ type: "check-tool", tool: "npx", cwd: "/work" },
		]);
		(operations as Array<{ type: "check-tool"; tool: "gh"; cwd: string }>).splice(0);
		expect(fake.operations()).toHaveLength(2);
	});

	test("github fake copies configured skill lists and returned lists", async () => {
		const skillNames = ["alpha"];
		const github: AregGithubGateway = new FakeAregGithubGateway({ repos: { "owner/repo": skillNames } });
		skillNames.push("mutated-after-construction");

		const first = await github.listSkillDirectoryNames({ repo: "owner/repo", env: {} });
		expect(first).toEqual({ type: "ok", skillNames: ["alpha"] });
		if (first.type === "ok") (first.skillNames as string[]).push("mutated-return");
		expect(await github.listSkillDirectoryNames({ repo: "owner/repo", ref: "main", env: {} })).toEqual({ type: "ok", skillNames: ["alpha"] });
		expect(await github.listSkillDirectoryNames({ repo: "missing/repo", env: {} })).toMatchObject({ type: "missing" });
	});

	test("npx skills fake copies requests and failures", async () => {
		const skillNames = ["one"];
		const targetAgents = ["codex"];
		const npxSkills: AregNpxSkillsGateway = new FakeAregNpxSkillsGateway();

		const result = await npxSkills.addSkills({ sourceRepo: "owner/repo", skillNames, targetAgents, cwd: "/repo", env: {} });
		skillNames.push("mutated-request");
		targetAgents.push("claude-code");
		expect(result).toEqual({ type: "ok" });

		const fake = npxSkills as FakeAregNpxSkillsGateway;
		expect(fake.operations()).toEqual([{ type: "add-skills", sourceRepo: "owner/repo", skillNames: ["one"], targetAgents: ["codex"], cwd: "/repo" }]);
		expect(await npxSkills.addSkills({ sourceRepo: "owner/repo", skillNames: [], targetAgents: [], cwd: "/repo", env: {} })).toEqual({ type: "ok" });

		const keyed = new FakeAregNpxSkillsGateway({ failures: { "owner/repo:one": { code: "one-failed", message: "one failed" } } });
		expect(await keyed.addSkills({ sourceRepo: "owner/repo", skillNames: ["one"], targetAgents: [], cwd: "/repo", env: {} })).toMatchObject({ type: "error", error: { code: "one-failed" } });
		expect(await keyed.addSkills({ sourceRepo: "owner/repo", skillNames: ["two"], targetAgents: [], cwd: "/repo", env: {} })).toEqual({ type: "ok" });

		const failing = new FakeAregNpxSkillsGateway({ failure: { code: "npx-failed", message: "npx failed", displayCommand: "npx skills add" } });
		expect(await failing.addSkills({ sourceRepo: "owner/repo", skillNames: [], targetAgents: [], cwd: "/repo", env: {} })).toMatchObject({
			type: "error",
			error: { code: "npx-failed", displayCommand: "npx skills add" },
		});
	});

	test("skillx workspace fake copies installed skill metadata and logs requests", async () => {
		const skill: AregSkillxInstalledSkill = {
			name: "demo",
			directory: "/tmp/workspace/demo",
			skillFile: "/tmp/workspace/demo/SKILL.md",
			relativeFiles: ["SKILL.md"],
		};
		const skillx: AregSkillxWorkspaceGateway = new FakeAregSkillxWorkspaceGateway({ workspaceRoot: "/tmp/workspace", installedSkills: [skill] });
		(skill.relativeFiles as string[]).push("mutated-after-construction.md");

		const result = await skillx.installIntoWorkspace({ sourceRepo: "owner/repo", skillName: "demo", cwd: "/repo", env: {} });
		expect(result).toEqual({
			type: "ok",
			workspace: {
				workspaceRoot: "/tmp/workspace",
				installedSkills: [{ ...skill, relativeFiles: ["SKILL.md"] }],
			},
		});
		if (result.type === "ok") (result.workspace.installedSkills[0]?.relativeFiles as string[]).push("mutated-return.md");
		expect(await skillx.installIntoWorkspace({ sourceRepo: "owner/repo", cwd: "/repo", env: {} })).toMatchObject({
			type: "ok",
			workspace: { installedSkills: [{ relativeFiles: ["SKILL.md"] }] },
		});
		expect(await skillx.cleanupWorkspace({ workspaceRoot: "/tmp/workspace", cwd: "/repo", env: {} })).toEqual({ ok: true });
		expect((skillx as FakeAregSkillxWorkspaceGateway).operations()).toEqual([
			{ type: "install-into-workspace", sourceRepo: "owner/repo", skillName: "demo", cwd: "/repo" },
			{ type: "install-into-workspace", sourceRepo: "owner/repo", cwd: "/repo" },
			{ type: "cleanup-workspace", workspaceRoot: "/tmp/workspace", cwd: "/repo" },
		]);

		const failing = new FakeAregSkillxWorkspaceGateway({ cleanupFailure: { code: "refused", message: "cleanup refused" } });
		expect(await failing.cleanupWorkspace({ workspaceRoot: "/tmp/workspace", cwd: "/repo", env: {} })).toEqual({
			ok: false,
			error: { code: "refused", message: "cleanup refused", displayCommand: undefined },
		});
	});
});
