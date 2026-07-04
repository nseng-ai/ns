import { describe, expect, test } from "vitest";

import {
	FakeAregGithubGateway,
	FakeAregHostGateway,
	FakeAregNpxSkillsGateway,
	FakeAregProjectGateway,
	FakeAregSkillxWorkspaceGateway,
} from "../../src/fake-gateways.ts";
import type {
	AregGithubGateway,
	AregHostGateway,
	AregNpxSkillsGateway,
	AregProjectGateway,
	AregSkillxInstalledSkill,
	AregSkillxWorkspaceGateway,
} from "../../src/gateways.ts";

describe("areg gateway fakes", () => {
	test("project fake copies configured facts and read-only logs", async () => {
		const skillsDirectoryNames = ["demo"];
		const fake: AregProjectGateway = new FakeAregProjectGateway({
			lockfile: {
				version: 1,
				skills: {
					demo: { source: "skills/demo", sourceType: "local", computedHash: "a".repeat(64) },
				},
			},
			skillsDirectoryNames,
			checkSkills: [
				{
					name: "demo",
					skillsPath: { type: "directory" },
					localSkillMd: { type: "file", text: "---\nname: demo\n---\n" },
				},
			],
		});
		skillsDirectoryNames.push("mutated-after-construction");

		const base = await fake.inspectProjectBase({ cwd: "/work", projectPath: ".", env: {} });
		const inventory = await fake.inspectSkillNameInventory({
			projectDir: base.projectDir,
			env: {},
		});
		expect(inventory.skillsDirectoryNames).toEqual(["demo"]);
		(inventory.skillsDirectoryNames as string[]).push("mutated-return");
		const piInventory = await fake.inspectPiSkillInventory({
			projectDir: base.projectDir,
			env: {},
		});
		expect(piInventory).toEqual({
			skillNames: [],
			isApproximation: true,
			source: "fake-repo-fallback-resolvable-skill-roots",
		});
		(piInventory.skillNames as string[]).push("mutated-return");
		const secondPiInventory = await fake.inspectPiSkillInventory({
			projectDir: base.projectDir,
			env: {},
		});
		expect(secondPiInventory.skillNames).toEqual([]);
		const secondInventory = await fake.inspectSkillNameInventory({
			projectDir: base.projectDir,
			env: {},
		});
		expect(secondInventory.skillsDirectoryNames).toEqual(["demo"]);
		const findRoots = await fake.inspectSkillFindRoots({ projectDir: base.projectDir, env: {} });
		expect(findRoots.skills).toEqual([]);
		(findRoots.skills as unknown[]).push({});
		expect(
			(await fake.inspectSkillFindRoots({ projectDir: base.projectDir, env: {} })).skills,
		).toEqual([]);
		expect((fake as FakeAregProjectGateway).operations()).toEqual([
			{ type: "inspect-project-base", cwd: "/work", projectPath: "." },
			{ type: "inspect-skill-name-inventory", projectDir: "/repo" },
			{ type: "inspect-pi-skill-inventory", projectDir: "/repo" },
			{ type: "inspect-pi-skill-inventory", projectDir: "/repo" },
			{ type: "inspect-skill-name-inventory", projectDir: "/repo" },
			{ type: "inspect-skill-find-roots", projectDir: "/repo" },
			{ type: "inspect-skill-find-roots", projectDir: "/repo" },
		]);
	});

	test("project fake exposes update facts defensively", async () => {
		const lockfile = {
			version: 1,
			skills: {
				demo: { source: "owner/repo", sourceType: "github", computedHash: "a".repeat(64) },
			},
		};
		const project: AregProjectGateway = new FakeAregProjectGateway({
			projectDir: "/repo/project",
			lockfile,
			nsToml: '[areg]\nagents = ["codex"]\n',
		});
		lockfile.skills.demo.source = "mutated/repo";

		const first = await project.inspectProjectBase({
			cwd: "/repo",
			projectPath: "project",
			env: {},
		});
		expect(first).toMatchObject({
			projectDir: "/repo/project",
			projectPathState: { type: "directory" },
			lockfile: { type: "file", text: expect.stringContaining("owner/repo") },
		});
		if (first.lockfile.type === "file") first.lockfile.text = "mutated return";
		const second = await project.inspectProjectBase({ cwd: "/repo", projectPath: ".", env: {} });
		expect(second.lockfile).toMatchObject({
			type: "file",
			text: expect.stringContaining("owner/repo"),
		});
	});

	test("project fake copies skill-kind facts, resolves specs, and logs primitive mutations", async () => {
		const project: AregProjectGateway = new FakeAregProjectGateway({
			piSettings: { skills: ["-skills/demo"] },
			replacementSurfaces: ["demo"],
			localSkills: [{ name: "demo", skillMd: "---\nname: demo\n---\n" }],
		});

		const pi = await project.inspectPiArtifacts({ projectDir: "/repo", env: {} });
		const inventory = await project.inspectSkillNameInventory({ projectDir: "/repo", env: {} });
		const first = await project.inspectSkillKindSkill({
			projectDir: "/repo",
			skillName: "demo",
			env: {},
		});
		expect(pi).toMatchObject({
			piSettings: { type: "file", text: expect.stringContaining("-skills/demo") },
			replacement: { verifiedSurfaces: ["demo"] },
		});
		expect(inventory.skillKindNames).toEqual(["demo"]);
		expect(first).toMatchObject({
			name: "demo",
			skillDir: { type: "directory" },
			skillMd: { type: "file", text: "---\nname: demo\n---\n" },
		});
		if (first.skillMd.type === "file") first.skillMd.text = "mutated";
		const second = await project.inspectSkillKindSkill({
			projectDir: "/repo",
			skillName: "demo",
			env: {},
		});
		expect(second.skillMd).toMatchObject({ type: "file", text: "---\nname: demo\n---\n" });
		expect(
			await project.resolveSkillKindSpec({
				projectDir: "/repo",
				spec: "skills/demo/SKILL.md",
				cwd: "/repo",
				env: {},
			}),
		).toEqual({ type: "ok", skillName: "demo" });
		expect(
			await project.resolveSkillKindSpec({
				projectDir: "/repo",
				spec: "missing",
				cwd: "/repo",
				env: {},
			}),
		).toMatchObject({ type: "error" });
		expect(
			await project.writeTextFile({
				projectDir: "/repo",
				relativePath: "skills/demo/SKILL.md",
				content: "---\nname: demo\ndisable-model-invocation: true\n---\n",
				description: "SKILL.md",
				createParent: false,
				policy: "skill-kind",
				env: {},
			}),
		).toMatchObject({ ok: true });
		const afterApply = await project.inspectSkillKindSkill({
			projectDir: "/repo",
			skillName: "demo",
			env: {},
		});
		const afterFind = await project.inspectSkillFindRoots({ projectDir: "/repo", env: {} });
		expect(afterApply.skillMd).toMatchObject({
			type: "file",
			text: expect.stringContaining("disable-model-invocation: true"),
		});
		expect(afterFind.skills).toHaveLength(1);
		expect(afterFind.skills[0]?.skillMd).toMatchObject({
			type: "file",
			text: expect.stringContaining("disable-model-invocation: true"),
		});
		expect((project as FakeAregProjectGateway).operations()).toContainEqual({
			type: "write-text-file",
			projectDir: "/repo",
			relativePath: "skills/demo/SKILL.md",
			content: "---\nname: demo\ndisable-model-invocation: true\n---\n",
			description: "SKILL.md",
			createParent: false,
			policy: "skill-kind",
		});
	});

	test("project fake mirrors the delete-symlink gateway contract", async () => {
		const project: AregProjectGateway = new FakeAregProjectGateway({
			localSkills: [
				{
					name: "demo",
					agentsPath: { type: "symlink", target: "../../skills/demo" },
					claudePath: { type: "symlink", target: "../../.agents/skills/demo" },
				},
				{ name: "real-dir", agentsPath: { type: "directory" } },
				{
					name: "wrong-target",
					claudePath: { type: "symlink", target: "../../elsewhere/wrong-target" },
				},
			],
		});

		const inspected = await project.inspectSkillKindSkill({
			projectDir: "/repo",
			skillName: "demo",
			env: {},
		});
		expect(inspected).toMatchObject({
			agentsPath: { type: "symlink", target: "../../skills/demo" },
			claudePath: { type: "symlink", target: "../../.agents/skills/demo" },
		});

		const request = (relativePath: string, description: string) => ({
			projectDir: "/repo",
			relativePath,
			description,
			policy: "skill-kind" as const,
			env: {},
		});
		expect(await project.deleteSymlink(request("skills/demo", "skill directory"))).toMatchObject({
			ok: false,
			error: { code: "skill-kind-delete-symlink-refused" },
		});
		expect(
			await project.preflightDeleteSymlink(
				request(".agents/skills/missing", "agents skill mirror symlink"),
			),
		).toMatchObject({ ok: false, error: { code: "skill-kind-delete-symlink-missing" } });
		expect(
			await project.deleteSymlink(
				request(".agents/skills/real-dir", "agents skill mirror symlink"),
			),
		).toMatchObject({ ok: false, error: { code: "skill-kind-delete-symlink-not-symlink" } });
		expect(
			await project.deleteSymlink(
				request(".claude/skills/wrong-target", "Claude skill mirror symlink"),
			),
		).toMatchObject({ ok: false, error: { code: "skill-kind-delete-symlink-wrong-target" } });

		expect(
			await project.preflightDeleteSymlink(
				request(".claude/skills/demo", "Claude skill mirror symlink"),
			),
		).toEqual({ ok: true });
		expect(
			await project.deleteSymlink(request(".claude/skills/demo", "Claude skill mirror symlink")),
		).toEqual({ ok: true });
		expect(
			await project.deleteSymlink(request(".agents/skills/demo", "agents skill mirror symlink")),
		).toEqual({ ok: true });
		const afterDelete = await project.inspectSkillKindSkill({
			projectDir: "/repo",
			skillName: "demo",
			env: {},
		});
		expect(afterDelete.agentsPath).toEqual({ type: "missing" });
		expect(afterDelete.claudePath).toEqual({ type: "missing" });
		expect(
			(project as FakeAregProjectGateway)
				.operations()
				.filter((operation) => operation.type === "delete-symlink")
				.map((operation) => operation.relativePath),
		).toEqual([
			"skills/demo",
			".agents/skills/real-dir",
			".claude/skills/wrong-target",
			".claude/skills/demo",
			".agents/skills/demo",
		]);
	});

	test("project fake classifies skill-kind spec inspection failures", async () => {
		const project: AregProjectGateway = new FakeAregProjectGateway({
			localSkills: [
				{ name: "dir-symlink", skillDir: { type: "symlink", target: "../outside" } },
				{ name: "dir-other", skillDir: { type: "other" } },
				{ name: "md-symlink", skillMd: { type: "symlink", target: "../SKILL.md" } },
				{ name: "md-missing", skillMd: { type: "missing" } },
			],
		});

		expect(
			await project.resolveSkillKindSpec({
				projectDir: "/repo",
				spec: "dir-symlink",
				cwd: "/repo",
				env: {},
			}),
		).toMatchObject({ type: "error", error: { code: "skill-kind-symlink-skill-dir" } });
		expect(
			await project.resolveSkillKindSpec({
				projectDir: "/repo",
				spec: "dir-other",
				cwd: "/repo",
				env: {},
			}),
		).toMatchObject({ type: "error", error: { code: "skill-kind-missing-skill" } });
		expect(
			await project.resolveSkillKindSpec({
				projectDir: "/repo",
				spec: "md-symlink",
				cwd: "/repo",
				env: {},
			}),
		).toMatchObject({ type: "error", error: { code: "skill-kind-symlink-skill-md" } });
		expect(
			await project.resolveSkillKindSpec({
				projectDir: "/repo",
				spec: "md-missing",
				cwd: "/repo",
				env: {},
			}),
		).toMatchObject({ type: "error", error: { code: "skill-kind-missing-skill-md" } });
	});

	test("project fake supports independent preflight failures with fallback and logs preflights", async () => {
		const project: AregProjectGateway = new FakeAregProjectGateway({
			preflightFailures: {
				"skills/demo/SKILL.md": { code: "specific-preflight", message: "specific preflight" },
				"*": { code: "fallback-preflight", message: "fallback preflight" },
			},
		});

		expect(
			await project.preflightWriteTextFile({
				projectDir: "/repo",
				relativePath: "skills/demo/SKILL.md",
				content: "demo",
				description: "SKILL.md",
				createParent: false,
				policy: "skill-kind",
				env: {},
			}),
		).toMatchObject({ ok: false, error: { code: "specific-preflight" } });
		expect(
			await project.preflightDeleteFile({
				projectDir: "/repo",
				relativePath: ".pi/settings.json",
				description: "Pi settings",
				policy: "skill-kind",
				env: {},
			}),
		).toMatchObject({ ok: false, error: { code: "fallback-preflight" } });
		expect(
			await project.writeTextFile({
				projectDir: "/repo",
				relativePath: "skills/demo/SKILL.md",
				content: "demo",
				description: "SKILL.md",
				createParent: false,
				policy: "skill-kind",
				env: {},
			}),
		).toEqual({ ok: true });
		expect(
			(project as FakeAregProjectGateway).operations().map((operation) => operation.type),
		).toEqual(["preflight-write-text-file", "preflight-delete-file", "write-text-file"]);
	});

	test("host fake implements tool checks and read-only operation logs", async () => {
		const host: AregHostGateway = new FakeAregHostGateway({ tools: { gh: "/bin/gh", npx: null } });
		expect(await host.checkTool({ tool: "gh", cwd: "/work", env: {} })).toEqual({
			type: "found",
			tool: "gh",
			path: "/bin/gh",
		});
		expect(await host.checkTool({ tool: "npx", cwd: "/work", env: {} })).toMatchObject({
			type: "missing",
			tool: "npx",
		});

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
		const github: AregGithubGateway = new FakeAregGithubGateway({
			repos: { "owner/repo": skillNames },
		});
		skillNames.push("mutated-after-construction");

		const first = await github.listSkillDirectoryNames({ repo: "owner/repo", env: {} });
		expect(first).toEqual({ type: "ok", skillNames: ["alpha"] });
		if (first.type === "ok") (first.skillNames as string[]).push("mutated-return");
		expect(
			await github.listSkillDirectoryNames({ repo: "owner/repo", ref: "main", env: {} }),
		).toEqual({ type: "ok", skillNames: ["alpha"] });
		expect(await github.listSkillDirectoryNames({ repo: "missing/repo", env: {} })).toMatchObject({
			type: "missing",
		});
	});

	test("github fake checks configured skill files", async () => {
		const github: AregGithubGateway = new FakeAregGithubGateway({
			files: {
				"owner/repo:skills/alpha/SKILL.md": "found",
				"owner/repo:skills/missing/SKILL.md": "missing",
				"owner/private:skills/alpha/SKILL.md@main": "auth-error",
			},
		});

		expect(
			await github.checkSkillFile({ repo: "owner/repo", path: "skills/alpha/SKILL.md", env: {} }),
		).toEqual({ type: "found" });
		expect(
			await github.checkSkillFile({ repo: "owner/repo", path: "skills/missing/SKILL.md", env: {} }),
		).toMatchObject({ type: "missing" });
		expect(
			await github.checkSkillFile({
				repo: "owner/private",
				path: "skills/alpha/SKILL.md",
				ref: "main",
				env: {},
			}),
		).toMatchObject({ type: "auth-error" });
		expect(
			await github.checkSkillFile({
				repo: "unconfigured/repo",
				path: "skills/ok/SKILL.md",
				env: {},
			}),
		).toEqual({ type: "found" });
	});

	test("npx skills fake copies requests and failures", async () => {
		const skillNames = ["one"];
		const targetAgents = ["codex"];
		const npxSkills: AregNpxSkillsGateway = new FakeAregNpxSkillsGateway();

		const result = await npxSkills.addSkills({
			sourceRepo: "owner/repo",
			skillNames,
			targetAgents,
			cwd: "/repo",
			env: {},
		});
		skillNames.push("mutated-request");
		targetAgents.push("claude-code");
		expect(result).toEqual({ type: "ok" });

		const fake = npxSkills as FakeAregNpxSkillsGateway;
		expect(fake.operations()).toEqual([
			{
				type: "add-skills",
				sourceRepo: "owner/repo",
				skillNames: ["one"],
				targetAgents: ["codex"],
				cwd: "/repo",
			},
		]);
		expect(
			await npxSkills.addSkills({
				sourceRepo: "owner/repo",
				skillNames: [],
				targetAgents: [],
				cwd: "/repo",
				env: {},
			}),
		).toEqual({ type: "ok" });

		const keyed = new FakeAregNpxSkillsGateway({
			failures: { "owner/repo:one": { code: "one-failed", message: "one failed" } },
		});
		expect(
			await keyed.addSkills({
				sourceRepo: "owner/repo",
				skillNames: ["one"],
				targetAgents: [],
				cwd: "/repo",
				env: {},
			}),
		).toMatchObject({ type: "error", error: { code: "one-failed" } });
		expect(
			await keyed.addSkills({
				sourceRepo: "owner/repo",
				skillNames: ["two"],
				targetAgents: [],
				cwd: "/repo",
				env: {},
			}),
		).toEqual({ type: "ok" });

		const failing = new FakeAregNpxSkillsGateway({
			failure: { code: "npx-failed", message: "npx failed", displayCommand: "npx skills add" },
		});
		expect(
			await failing.addSkills({
				sourceRepo: "owner/repo",
				skillNames: [],
				targetAgents: [],
				cwd: "/repo",
				env: {},
			}),
		).toMatchObject({
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
		const skillx: AregSkillxWorkspaceGateway = new FakeAregSkillxWorkspaceGateway({
			workspaceRoot: "/tmp/workspace",
			installedSkills: [skill],
		});
		(skill.relativeFiles as string[]).push("mutated-after-construction.md");

		const result = await skillx.installIntoWorkspace({
			sourceRepo: "owner/repo",
			skillName: "demo",
			cwd: "/repo",
			env: {},
		});
		expect(result).toEqual({
			type: "ok",
			workspace: {
				workspaceRoot: "/tmp/workspace",
				installedSkills: [{ ...skill, relativeFiles: ["SKILL.md"] }],
			},
		});
		if (result.type === "ok") {
			const installedSkill = result.workspace.installedSkills[0];
			if (installedSkill === undefined) throw new Error("expected installed skill fixture");
			(installedSkill.relativeFiles as string[]).push("mutated-return.md");
		}
		expect(
			await skillx.installIntoWorkspace({ sourceRepo: "owner/repo", cwd: "/repo", env: {} }),
		).toMatchObject({
			type: "ok",
			workspace: { installedSkills: [{ relativeFiles: ["SKILL.md"] }] },
		});
		expect(await skillx.cleanupWorkspace({ workspaceRoot: "/tmp/workspace" })).toEqual({
			ok: true,
			value: undefined,
		});

		const fake = skillx as FakeAregSkillxWorkspaceGateway;
		expect(fake.operations()).toEqual([
			{ type: "install-into-workspace", sourceRepo: "owner/repo", skillName: "demo", cwd: "/repo" },
			{ type: "install-into-workspace", sourceRepo: "owner/repo", cwd: "/repo" },
			{ type: "cleanup-workspace", workspaceRoot: "/tmp/workspace" },
		]);
	});
});
