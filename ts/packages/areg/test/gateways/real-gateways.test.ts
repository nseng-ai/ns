import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@asdl/core/git/testing";

import type { AregNpxSkillsAddRequest, AregNpxSkillsAddResult, AregNpxSkillsGateway } from "../../src/gateways.ts";
import {
	buildNpxSkillsAddArgs,
	RealAregGithubGateway,
	RealAregHostGateway,
	RealAregNpxSkillsGateway,
	RealAregProjectGateway,
	RealAregSkillxWorkspaceGateway,
} from "../../src/real-gateways.ts";
import { ScriptedCommandRunner, step } from "../support/scripted-command-runner.ts";

describe("real areg gateways", () => {
	test("check project inspection resolves relative path, symlink targets, excludes, and prunes pairing traversal", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-check."));
		try {
			const project = path.join(root, "project");
			await mkdir(path.join(project, "skills", "demo", "agents"), { recursive: true });
			await mkdir(path.join(project, ".agents", "skills"), { recursive: true });
			await mkdir(path.join(project, ".claude", "skills"), { recursive: true });
			await mkdir(path.join(project, ".git", "info"), { recursive: true });
			await writeFile(path.join(project, "skills-lock.json"), JSON.stringify({ version: 1, skills: { demo: { source: "skills/demo", sourceType: "local", computedHash: "a".repeat(64) } } }));
			await writeFile(path.join(project, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
			await writeFile(path.join(project, "skills", "demo", "agents", "openai.yaml"), "policy:\n");
			await writeFile(path.join(project, ".git", "info", "exclude"), ".agents/skills/local-only\n");
			await symlink(path.join("..", "..", "skills", "demo"), path.join(project, ".agents", "skills", "demo"));
			await symlink(path.join("..", "..", ".agents", "skills", "demo"), path.join(project, ".claude", "skills", "demo"));
			await writeFile(path.join(project, "AGENTS.md"), "# Agents\n");
			await writeFile(path.join(project, "CLAUDE.md"), "# Claude\n\n@AGENTS.md\n");
			await mkdir(path.join(project, ".agents", "skills", "ignored"), { recursive: true });
			await writeFile(path.join(project, ".agents", "skills", "ignored", "CLAUDE.md"), "# ignored\n");

			const git = new InMemoryGitGateway({ gitPaths: { "info/exclude": path.join(project, ".git", "info", "exclude") } });
			const gateway = new RealAregProjectGateway({ git });
			const base = await gateway.inspectProjectBase({ cwd: root, projectPath: "project", env: {} });
			const inventory = await gateway.inspectSkillNameInventory({ projectDir: base.projectDir, env: {} });
			const excludedSkillNames = await gateway.readLocallyExcludedSkillNames({ projectDir: base.projectDir, env: {} });
			const skill = await gateway.inspectCheckSkill({ projectDir: base.projectDir, skillName: "demo", env: {} });
			const pairingDirectories = await gateway.inspectPairingDirectories({ projectDir: base.projectDir, env: {} });

			expect(base.projectDir).toBe(project);
			expect(base.lockfile).toMatchObject({ type: "file" });
			expect(excludedSkillNames).toEqual(["local-only"]);
			expect(inventory.skillsDirectoryNames).toEqual(["demo"]);
			expect(inventory.agentsSkillNames).toEqual(["demo", "ignored"]);
			expect(skill).toMatchObject({
				name: "demo",
				agentsPath: { type: "symlink", target: "../../skills/demo" },
				claudePath: { type: "symlink", target: "../../.agents/skills/demo" },
				openaiPolicy: { type: "file", text: "policy:\n" },
			});
			expect(pairingDirectories).toEqual([{ relativeDir: "", hasAgents: true, hasClaude: true, claudeText: "# Claude\n\n@AGENTS.md\n" }]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("project gateway reads local skill exclusions from linked worktree git paths", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-linked-exclude."));
		try {
			const project = path.join(root, "project");
			const actualGitDir = path.join(root, "actual-git-dir");
			const excludePath = path.join(actualGitDir, "info", "exclude");
			await mkdir(project);
			await mkdir(path.dirname(excludePath), { recursive: true });
			await writeFile(path.join(project, ".git"), `gitdir: ${actualGitDir}\n`);
			await writeFile(excludePath, "# local excludes\n.claude/skills/linked-only\n.agents/skills/agents-only\n\n");
			const git = new InMemoryGitGateway({ gitPaths: { "info/exclude": excludePath } });
			const gateway = new RealAregProjectGateway({ git });

			expect(await gateway.readLocallyExcludedSkillNames({ projectDir: project, env: {} })).toEqual(["agents-only", "linked-only"]);
			expect(git.gitPathCalls).toEqual([{ cwd: project, relativePath: "info/exclude" }]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("project gateway treats failed git-path resolution as no local exclusions", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-exclude-failure."));
		try {
			const project = path.join(root, "project");
			await mkdir(project);
			const git = new InMemoryGitGateway({ gitPaths: { "info/exclude": { type: "failure" } } });
			const gateway = new RealAregProjectGateway({ git });

			expect(await gateway.readLocallyExcludedSkillNames({ projectDir: project, env: {} })).toEqual([]);
			expect(git.gitPathCalls).toEqual([{ cwd: project, relativePath: "info/exclude" }]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("skill-kind project gateway inspects local skills and resolves harness symlink specs", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-kind."));
		try {
			const project = path.join(root, "project");
			await mkdir(path.join(project, "skills", "demo", "agents"), { recursive: true });
			await mkdir(path.join(project, ".agents", "skills"), { recursive: true });
			await mkdir(path.join(project, ".pi", "extensions"), { recursive: true });
			await mkdir(path.join(project, "ts", "packages", "pi-extensions", "src"), { recursive: true });
			await writeFile(path.join(project, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
			await writeFile(path.join(project, "skills", "demo", "README.md"), "nested docs\n");
			await writeFile(path.join(project, "skills", "demo", "agents", "openai.yaml"), "policy:\n  allow_implicit_invocation: false\n");
			await writeFile(path.join(project, ".pi", "settings.json"), JSON.stringify({ skills: ["-skills/demo"] }));
			await writeFile(path.join(project, ".pi", "extensions", "backing-skill-commands.ts"), "export {};\n");
			await writeFile(path.join(project, "ts", "packages", "pi-extensions", "src", "backing-skill-commands.ts"), "export {};\n");
			await symlink(path.join("..", "..", "skills", "demo"), path.join(project, ".agents", "skills", "demo"));

			const gateway = new RealAregProjectGateway();
			const base = await gateway.inspectProjectBase({ cwd: root, projectPath: "project", env: {} });
			const piArtifacts = await gateway.inspectPiArtifacts({ projectDir: base.projectDir, env: {} });
			const inventory = await gateway.inspectSkillNameInventory({ projectDir: base.projectDir, env: {} });
			const skill = await gateway.inspectLocalSkill({ projectDir: base.projectDir, skillName: "demo", env: {} });

			expect(base).toMatchObject({ projectDir: project, projectPathState: { type: "directory" } });
			expect(piArtifacts).toMatchObject({
				piDir: { type: "directory" },
				piSettings: { type: "file", text: JSON.stringify({ skills: ["-skills/demo"] }) },
				genericReplacement: { hasAdapter: true, hasPackageModule: true },
			});
			expect(inventory.localSkillKindNames).toEqual(["demo"]);
			expect(skill).toMatchObject({ name: "demo", skillDir: { type: "directory" }, skillMd: { type: "file", text: "---\nname: demo\n---\n" }, openaiPolicy: { type: "file" } });
			expect(await gateway.resolveLocalSkillSpec({ projectDir: project, spec: path.join(project, ".agents", "skills", "demo"), cwd: project, env: {} })).toEqual({ type: "ok", skillName: "demo" });
			expect(await gateway.resolveLocalSkillSpec({ projectDir: project, spec: path.join(project, "skills", "demo", "README.md"), cwd: project, env: {} })).toMatchObject({ type: "error", error: { code: "skill-kind-nested-spec" } });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("skill-kind apply writes and removes only planned managed paths", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-kind-apply."));
		try {
			const project = path.join(root, "project");
			await mkdir(path.join(project, "skills", "demo"), { recursive: true });
			await writeFile(path.join(project, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
			const gateway = new RealAregProjectGateway();

			const firstWrite = await gateway.writeTextFile({ projectDir: project, relativePath: "skills/demo/SKILL.md", content: "---\nname: demo\ndisable-model-invocation: true\n---\n", description: "SKILL.md", createParent: false, policy: "skill-kind", env: {} });
			const secondWrite = await gateway.writeTextFile({ projectDir: project, relativePath: "skills/demo/agents/openai.yaml", content: "policy:\n  allow_implicit_invocation: false\n", description: "Codex openai.yaml", createParent: true, policy: "skill-kind", env: {} });
			const thirdWrite = await gateway.writeTextFile({ projectDir: project, relativePath: ".pi/settings.json", content: "{\n  \"skills\": [\n    \"-skills/demo\"\n  ]\n}\n", description: "Pi settings", createParent: true, policy: "skill-kind", env: {} });

			expect([firstWrite, secondWrite, thirdWrite]).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
			expect(await readFile(path.join(project, "skills", "demo", "SKILL.md"), "utf8")).toContain("disable-model-invocation: true");
			expect(await readFile(path.join(project, ".pi", "settings.json"), "utf8")).toContain("-skills/demo");

			const deleted = await gateway.deleteFile({ projectDir: project, relativePath: "skills/demo/agents/openai.yaml", description: "Codex openai.yaml", policy: "skill-kind", env: {} });
			const removed = await gateway.removeEmptyDir({ projectDir: project, relativePath: "skills/demo/agents", description: "empty skill agents directory", policy: "skill-kind", env: {} });
			expect(deleted).toEqual({ ok: true });
			expect(removed).toEqual({ ok: true, removed: true });
			await expect(lstat(path.join(project, "skills", "demo", "agents"))).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("update project inspection reads only update inputs", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-update."));
		try {
			const project = path.join(root, "project");
			await mkdir(project);
			await writeFile(path.join(project, "skills-lock.json"), JSON.stringify({ version: 1, skills: {} }));
			await writeFile(path.join(project, "asdl.toml"), '[areg]\nagents = ["codex"]\n');

			const result = await new RealAregProjectGateway().inspectProjectBase({ cwd: root, projectPath: "project", env: {} });

			expect(result).toMatchObject({
				projectDir: project,
				projectPathState: { type: "directory" },
				lockfile: { type: "file", text: JSON.stringify({ version: 1, skills: {} }) },
				asdlToml: { type: "file", text: '[areg]\nagents = ["codex"]\n' },
				aregJson: { type: "missing" },
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("host gateway resolves executables from supplied PATH", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-host."));
		try {
			const bin = path.join(root, "bin");
			await mkdir(bin);
			const executable = path.join(bin, "gh");
			await writeFile(executable, "#!/bin/sh\n");
			await chmod(executable, 0o755);
			const host = new RealAregHostGateway();

			expect(await host.checkTool({ tool: "gh", cwd: root, env: { PATH: bin } })).toEqual({ type: "found", tool: "gh", path: executable });
			expect(await host.checkTool({ tool: "npx", cwd: root, env: { PATH: "" } })).toMatchObject({ type: "missing", tool: "npx" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("github gateway parses success and classifies gh failures", async () => {
		const success = new ScriptedCommandRunner([step("gh", ["api", "repos/owner/repo/contents/skills", "--jq", ".[].name"], { stdout: "zeta\nalpha\n" })]);
		expect(await new RealAregGithubGateway({ runner: success.runner }).listSkillDirectoryNames({ repo: "owner/repo", env: {} })).toEqual({
			type: "ok",
			skillNames: ["zeta", "alpha"],
		});
		success.assertDone();

		const missing = new ScriptedCommandRunner([step("gh", ["api", "repos/owner/repo/contents/skills", "--jq", ".[].name"], { exitCode: 1, stderr: "HTTP 404" })]);
		expect(await new RealAregGithubGateway({ runner: missing.runner }).listSkillDirectoryNames({ repo: "owner/repo", env: {} })).toMatchObject({ type: "missing" });

		const auth = new ScriptedCommandRunner([step("gh", ["api", "repos/owner/repo/contents/skills", "--jq", ".[].name"], { exitCode: 1, stderr: "HTTP 403" })]);
		expect(await new RealAregGithubGateway({ runner: auth.runner }).listSkillDirectoryNames({ repo: "owner/repo", env: {} })).toMatchObject({ type: "auth-error" });

		const generic = new ScriptedCommandRunner([step("gh", ["api", "repos/owner/repo/contents/skills", "--jq", ".[].name"], { exitCode: 2, stderr: "network down" })]);
		expect(await new RealAregGithubGateway({ runner: generic.runner }).listSkillDirectoryNames({ repo: "owner/repo", env: {} })).toMatchObject({
			type: "error",
			error: { code: "gh-failed", displayCommand: "gh api repos/owner/repo/contents/skills --jq '.[].name'" },
		});
	});

	test("npx gateway builds selected-skill and install-all commands", async () => {
		expect(buildNpxSkillsAddArgs({ sourceRepo: "owner/repo", skillNames: [], targetAgents: ["codex"], cwd: "/repo", env: {} })).toEqual([
			"skills",
			"add",
			"owner/repo",
			"--agent",
			"codex",
			"-y",
		]);
		const runner = new ScriptedCommandRunner([step("npx", ["skills", "add", "owner/repo", "--skill", "a", "--skill", "b", "--agent", "codex", "-y"], { stdout: "ok\n" })]);
		const gateway = new RealAregNpxSkillsGateway({ runner: runner.runner });
		expect(await gateway.addSkills({ sourceRepo: "owner/repo", skillNames: ["a", "b"], targetAgents: ["codex"], cwd: "/repo", env: {} })).toEqual({ type: "ok" });
		runner.assertDone();

		const failing = new ScriptedCommandRunner([step("npx", ["skills", "add", "owner/repo", "--agent", "codex", "-y"], { exitCode: 1, stderr: "failed" })]);
		expect(await new RealAregNpxSkillsGateway({ runner: failing.runner }).addSkills({ sourceRepo: "owner/repo", skillNames: [], targetAgents: ["codex"], cwd: "/repo", env: {} })).toMatchObject({
			type: "error",
			error: { code: "npx-failed" },
		});
	});

	test("skillx workspace gateway installs, inspects sorted files, and cleans malformed installs", async () => {
		const npx = new MutatingNpxSkillsGateway({ skillsToCreate: ["demo"] });
		const gateway = new RealAregSkillxWorkspaceGateway({ npxSkills: npx });
		const install = await gateway.installIntoWorkspace({ sourceRepo: "owner/repo", skillName: "demo", cwd: "/repo", env: {} });
		expect(install).toMatchObject({ type: "ok" });
		if (install.type !== "ok") return;
		expect(path.basename(install.workspace.workspaceRoot).startsWith("skillx.")).toBe(true);
		expect(install.workspace.installedSkills).toEqual([
			{
				name: "demo",
				directory: path.join(install.workspace.workspaceRoot, ".agents", "skills", "demo"),
				skillFile: path.join(install.workspace.workspaceRoot, ".agents", "skills", "demo", "SKILL.md"),
				relativeFiles: ["SKILL.md", "nested/a.txt", "z.txt"],
			},
		]);
		expect(await gateway.cleanupWorkspace({ workspaceRoot: install.workspace.workspaceRoot, cwd: "/repo", env: {} })).toEqual({ type: "ok" });

		const malformedGateway = new RealAregSkillxWorkspaceGateway({ npxSkills: new MutatingNpxSkillsGateway({ skillsToCreate: [] }) });
		const malformed = await malformedGateway.installIntoWorkspace({ sourceRepo: "owner/repo", cwd: "/repo", env: {} });
		expect(malformed).toMatchObject({ type: "error", error: { code: "skillx-no-skills" } });
	});

	test("skillx cleanup refuses unsafe paths and removes valid temp workspaces", async () => {
		const gateway = new RealAregSkillxWorkspaceGateway({ npxSkills: new MutatingNpxSkillsGateway({ skillsToCreate: [] }) });
		expect(await gateway.cleanupWorkspace({ workspaceRoot: path.join(os.tmpdir(), "not-skillx-demo"), cwd: "/repo", env: {} })).toMatchObject({
			type: "error",
			error: { code: "skillx-cleanup-refused" },
		});
		expect(await gateway.cleanupWorkspace({ workspaceRoot: path.join(os.tmpdir(), "skillx.missing-demo"), cwd: "/repo", env: {} })).toMatchObject({
			type: "error",
			error: { code: "skillx-cleanup-missing" },
		});

		const nonDirectory = path.join(os.tmpdir(), `skillx.file-${randomUUID()}`);
		await writeFile(nonDirectory, "not a directory");
		try {
			expect(await gateway.cleanupWorkspace({ workspaceRoot: nonDirectory, cwd: "/repo", env: {} })).toMatchObject({ type: "error", error: { code: "skillx-cleanup-not-directory" } });
		} finally {
			await rm(nonDirectory, { force: true });
		}

		const symlinkPath = path.join(os.tmpdir(), `skillx.symlink-${randomUUID()}`);
		await symlink(os.tmpdir(), symlinkPath);
		try {
			expect(await gateway.cleanupWorkspace({ workspaceRoot: symlinkPath, cwd: "/repo", env: {} })).toMatchObject({ type: "error", error: { code: "skillx-cleanup-symlink" } });
		} finally {
			await rm(symlinkPath, { force: true });
		}

		const outside = path.join(process.cwd(), `skillx.outside-${randomUUID()}`);
		await mkdir(outside);
		try {
			expect(await gateway.cleanupWorkspace({ workspaceRoot: outside, cwd: "/repo", env: {} })).toMatchObject({ type: "error", error: { code: "skillx-cleanup-outside-temp" } });
		} finally {
			await rm(outside, { recursive: true, force: true });
		}

		const removable = await mkdtemp(path.join(os.tmpdir(), "skillx.cleanup."));
		expect(await gateway.cleanupWorkspace({ workspaceRoot: removable, cwd: "/repo", env: {} })).toEqual({ type: "ok" });
		await expect(lstat(removable)).rejects.toMatchObject({ code: "ENOENT" });
	});

	test("init project inspection and apply preserve path safety", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-init."));
		try {
			const project = path.join(root, "project");
			await mkdir(project);
			await writeFile(path.join(project, "AGENTS.md"), "# Agents\n");
			await symlink("outside.md", path.join(project, "CLAUDE.md"));
			await mkdir(path.join(project, ".claude"));
			await writeFile(path.join(project, ".claude", "settings.local.json"), "custom\n");
			const gateway = new RealAregProjectGateway();

			const base = await gateway.inspectProjectBase({ cwd: root, projectPath: "project", env: {} });
			const inspection = await gateway.inspectInstructionFiles({ projectDir: base.projectDir, env: {} });

			expect({ ...base, ...inspection }).toMatchObject({
				projectDir: project,
				projectPathState: { type: "directory" },
				agentsMd: { type: "file", text: "# Agents\n" },
				claudeMd: { type: "symlink", target: "outside.md" },
				claudeSettings: { type: "file", text: "custom\n" },
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("init apply refuses traversal targets and symlinked parents after external mutation", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-init-apply."));
		try {
			const project = path.join(root, "project");
			const outside = path.join(root, "outside");
			await mkdir(project);
			await mkdir(outside);
			const gateway = new RealAregProjectGateway();

			const refused = await gateway.writeTextFile({
				projectDir: project,
				relativePath: "../escape",
				content: "bad",
				description: "bad",
				createParent: false,
				policy: "init",
				env: {},
			});
			expect(refused).toMatchObject({ ok: false, error: { code: "init-write-target-refused" } });

			await symlink(outside, path.join(project, ".claude"), "dir");
			const symlinkedParent = await gateway.writeTextFile({
				projectDir: project,
				relativePath: ".claude/settings.local.json",
				content: "{}\n",
				description: "settings.local.json",
				createParent: true,
				policy: "init",
				env: {},
			});
			expect(symlinkedParent).toMatchObject({ ok: false, error: { code: "init-parent-symlink" } });
			await expect(lstat(path.join(outside, "settings.local.json"))).rejects.toMatchObject({ code: "ENOENT" });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("init apply creates settings parent under the project root", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-init-create."));
		try {
			const project = path.join(root, "project");
			await mkdir(project);
			const gateway = new RealAregProjectGateway();

			const result = await gateway.writeTextFile({
				projectDir: project,
				relativePath: ".claude/settings.local.json",
				content: "{}\n",
				description: "settings.local.json",
				createParent: true,
				policy: "init",
				env: {},
			});

			expect(result).toEqual({ ok: true });
			expect(await lstat(path.join(project, ".claude", "settings.local.json"))).toMatchObject({});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

class MutatingNpxSkillsGateway implements AregNpxSkillsGateway {
	private readonly skillsToCreate: readonly string[];
	private readonly failure: boolean;

	constructor(options: { skillsToCreate: readonly string[]; failure?: boolean | undefined }) {
		this.skillsToCreate = [...options.skillsToCreate];
		this.failure = options.failure === true;
	}

	async addSkills(request: AregNpxSkillsAddRequest): Promise<AregNpxSkillsAddResult> {
		if (this.failure) return { type: "error", error: { code: "npx-failed", message: "npx failed" } };
		for (const skillName of this.skillsToCreate) {
			const skillRoot = path.join(request.cwd, ".agents", "skills", skillName);
			await mkdir(path.join(skillRoot, "nested"), { recursive: true });
			await writeFile(path.join(skillRoot, "SKILL.md"), "---\nname: demo\n---\n");
			await writeFile(path.join(skillRoot, "z.txt"), "z");
			await writeFile(path.join(skillRoot, "nested", "a.txt"), "a");
		}
		return { type: "ok" };
	}
}
