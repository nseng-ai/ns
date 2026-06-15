import { describe, expect, test } from "vitest";

import { createAregCliContext } from "../../src/context.ts";
import {
	FakeAregCheckProjectInspectionGateway,
	FakeAregGithubGateway,
	FakeAregHostGateway,
	FakeAregNpxSkillsGateway,
	FakeAregSkillxWorkspaceGateway,
} from "../../src/fake-gateways.ts";
import type { AregSkillxInstalledSkill } from "../../src/gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

describe("areg exec skillx CLI", () => {
	test("parse succeeds in default human rendering", async () => {
		const run = runScenario(["exec", "skillx", "parse", "owner/repo demo"]);

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({ success: true, repo: "owner/repo", skill: "demo", format: "plain" });
		expect(run.stderr.join("")).toBe("");
	});

	test("parse failure uses Clinkr negative envelope under --format json", async () => {
		const run = runScenario(["exec", "skillx", "parse", "", "--format", "json"]);

		expect(await run.exit).toBe(1);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			exit_code: 1,
			message: "Empty input",
			data: { success: false, error: "Empty input" },
		});
	});

	test("list returns sorted skills in a Clinkr success envelope", async () => {
		const run = runScenario(["exec", "skillx", "list", "--repo", "owner/repo", "--format", "json"], {
			github: { repos: { "owner/repo": ["zeta", "alpha"] } },
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			exit_code: 0,
			data: { success: true, repo: "owner/repo", skills: ["alpha", "zeta"] },
		});
	});

	test("list missing repo/path returns durable failure data and hint", async () => {
		const run = runScenario(["exec", "skillx", "list", "--repo", "owner/repo", "--format", "json"], {
			github: { repos: { "owner/repo": "missing" } },
		});

		expect(await run.exit).toBe(1);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			exit_code: 1,
			message: "No skills directory found in owner/repo",
			data: {
				success: false,
				error: "No skills directory found in owner/repo",
				hint: "Check that the repo exists and has a skills/ directory",
			},
		});
	});

	test("list missing gh is a Clinkr precondition failure", async () => {
		const run = runScenario(["exec", "skillx", "list", "--repo", "owner/repo", "--format", "json"], {
			host: { tools: { gh: null } },
		});

		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			exit_code: 2,
			error_type: "missing-tool",
			message: "Required host tool is missing: gh",
		});
	});

	test("fetch selects requested skill from fake workspace", async () => {
		const run = runScenario(["exec", "skillx", "fetch", "--repo", "owner/repo", "--skill", "demo", "--format", "json"], {
			skillxWorkspace: { workspaceRoot: "/tmp/skillx.fake-1", installedSkills: [skill("demo", ["z.txt", "SKILL.md"])] },
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			exit_code: 0,
			data: {
				success: true,
				repo: "owner/repo",
				skill: "demo",
				tmp_dir: "/tmp/skillx.fake-1",
				skill_dir: "/tmp/skillx.fake-1/.agents/skills/demo",
				skill_md: "/tmp/skillx.fake-1/.agents/skills/demo/SKILL.md",
				files: ["SKILL.md", "z.txt"],
				needs_selection: false,
			},
		});
	});

	test("fetch with multiple installed skills asks caller to select and keeps workspace", async () => {
		const workspace = new FakeAregSkillxWorkspaceGateway({
			workspaceRoot: "/tmp/skillx.fake-1",
			installedSkills: [skill("beta", ["SKILL.md"]), skill("alpha", ["SKILL.md"])],
		});
		const context = createAregCliContext({
			host: new FakeAregHostGateway(),
			github: new FakeAregGithubGateway(),
			npxSkills: new FakeAregNpxSkillsGateway(),
			skillxWorkspace: workspace,
			projectInspection: new FakeAregCheckProjectInspectionGateway(),
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
		});
		const run = runScenario(["exec", "skillx", "fetch", "--repo", "owner/repo", "--format", "json"], { context });

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			exit_code: 0,
			data: {
				success: true,
				repo: "owner/repo",
				skill: null,
				tmp_dir: "/tmp/skillx.fake-1",
				skill_dir: null,
				skill_md: null,
				files: null,
				needs_selection: true,
				available_skills: ["alpha", "beta"],
			},
		});
		expect(workspace.operations()).toEqual([{ type: "install-into-workspace", sourceRepo: "owner/repo", cwd: "/repo" }]);
	});

	test("fetch cleans up when requested skill is absent after install", async () => {
		const workspace = new FakeAregSkillxWorkspaceGateway({ workspaceRoot: "/tmp/skillx.fake-1", installedSkills: [skill("other", ["SKILL.md"])] });
		const context = createAregCliContext({
			host: new FakeAregHostGateway(),
			github: new FakeAregGithubGateway(),
			npxSkills: new FakeAregNpxSkillsGateway(),
			skillxWorkspace: workspace,
			projectInspection: new FakeAregCheckProjectInspectionGateway(),
			cwd: "/repo",
			env: { PATH: "/fake/bin" },
		});
		const run = runScenario(["exec", "skillx", "fetch", "--repo", "owner/repo", "--skill", "demo", "--format", "json"], { context });

		expect(await run.exit).toBe(1);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			exit_code: 1,
			data: { success: false, error: "Skill 'demo' was not found in installed skills", tmp_dir: null },
		});
		expect(workspace.operations()).toEqual([
			{ type: "install-into-workspace", sourceRepo: "owner/repo", skillName: "demo", cwd: "/repo" },
			{ type: "cleanup-workspace", workspaceRoot: "/tmp/skillx.fake-1", cwd: "/repo" },
		]);
	});

	test("cleanup returns removed path or failure data", async () => {
		const okRun = runScenario(["exec", "skillx", "cleanup", "--dir", "/tmp/skillx.fake-1", "--format", "json"]);
		expect(await okRun.exit).toBe(0);
		expect(JSON.parse(okRun.stdout.join(""))).toEqual({ exit_code: 0, data: { success: true, removed: "/tmp/skillx.fake-1" } });

		const failRun = runScenario(["exec", "skillx", "cleanup", "--dir", "/tmp/skillx.fake-1", "--format", "json"], {
			skillxWorkspace: { cleanupFailure: { code: "refused", message: "Refusing cleanup" } },
		});
		expect(await failRun.exit).toBe(1);
		expect(JSON.parse(failRun.stdout.join(""))).toEqual({
			exit_code: 1,
			message: "Refusing cleanup",
			data: { success: false, error: "Refusing cleanup" },
		});
	});
});

function skill(name: string, relativeFiles: readonly string[]): AregSkillxInstalledSkill {
	return {
		name,
		directory: `/tmp/skillx.fake-1/.agents/skills/${name}`,
		skillFile: `/tmp/skillx.fake-1/.agents/skills/${name}/SKILL.md`,
		relativeFiles,
	};
}
