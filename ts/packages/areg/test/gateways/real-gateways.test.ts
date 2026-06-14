import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import type { AregNpxSkillsAddRequest, AregNpxSkillsAddResult, AregNpxSkillsGateway } from "../../src/gateways.ts";
import {
	buildNpxSkillsAddArgs,
	RealAregCheckProjectInspectionGateway,
	RealAregGithubGateway,
	RealAregHostGateway,
	RealAregNpxSkillsGateway,
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

			const result = await new RealAregCheckProjectInspectionGateway().inspectProjectForCheck({ cwd: root, projectPath: "project", env: {} });

			expect(result.projectDir).toBe(project);
			expect(result.lockfile).toMatchObject({ type: "file" });
			expect(result.excludedSkillNames).toEqual(["local-only"]);
			expect(result.skillsDirectoryNames).toEqual(["demo"]);
			expect(result.agentsSkillNames).toEqual(["demo", "ignored"]);
			expect(result.skills[0]).toMatchObject({
				name: "demo",
				agentsPath: { type: "symlink", target: "../../skills/demo" },
				claudePath: { type: "symlink", target: "../../.agents/skills/demo" },
				openaiPolicy: { type: "file", text: "policy:\n" },
			});
			expect(result.pairingDirectories).toEqual([{ relativeDir: "", hasAgents: true, hasClaude: true, claudeText: "# Claude\n\n@AGENTS.md\n" }]);
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
		const success = new ScriptedCommandRunner([step("gh", ["api", "repos/owner/repo/contents/skills", "--jq", ".[].name"], "zeta\nalpha\n")]);
		expect(await new RealAregGithubGateway({ runner: success.runner }).listSkillDirectoryNames({ repo: "owner/repo", env: {} })).toEqual({
			type: "ok",
			skillNames: ["zeta", "alpha"],
		});
		success.assertDone();

		const missing = new ScriptedCommandRunner([step("gh", ["api", "repos/owner/repo/contents/skills", "--jq", ".[].name"], "", 1, "HTTP 404")]);
		expect(await new RealAregGithubGateway({ runner: missing.runner }).listSkillDirectoryNames({ repo: "owner/repo", env: {} })).toMatchObject({ type: "missing" });

		const auth = new ScriptedCommandRunner([step("gh", ["api", "repos/owner/repo/contents/skills", "--jq", ".[].name"], "", 1, "HTTP 403")]);
		expect(await new RealAregGithubGateway({ runner: auth.runner }).listSkillDirectoryNames({ repo: "owner/repo", env: {} })).toMatchObject({ type: "auth-error" });

		const generic = new ScriptedCommandRunner([step("gh", ["api", "repos/owner/repo/contents/skills", "--jq", ".[].name"], "", 2, "network down")]);
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
		const runner = new ScriptedCommandRunner([step("npx", ["skills", "add", "owner/repo", "--skill", "a", "--skill", "b", "--agent", "codex", "-y"], "ok\n")]);
		const gateway = new RealAregNpxSkillsGateway({ runner: runner.runner });
		expect(await gateway.addSkills({ sourceRepo: "owner/repo", skillNames: ["a", "b"], targetAgents: ["codex"], cwd: "/repo", env: {} })).toEqual({ type: "ok" });
		runner.assertDone();

		const failing = new ScriptedCommandRunner([step("npx", ["skills", "add", "owner/repo", "--agent", "codex", "-y"], "", 1, "failed")]);
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
		expect(await gateway.cleanupWorkspace({ workspaceRoot: install.workspace.workspaceRoot, cwd: "/repo", env: {} })).toEqual({ ok: true });

		const malformedGateway = new RealAregSkillxWorkspaceGateway({ npxSkills: new MutatingNpxSkillsGateway({ skillsToCreate: [] }) });
		const malformed = await malformedGateway.installIntoWorkspace({ sourceRepo: "owner/repo", cwd: "/repo", env: {} });
		expect(malformed).toMatchObject({ type: "error", error: { code: "skillx-no-skills" } });
	});

	test("skillx cleanup refuses unsafe paths and removes valid temp workspaces", async () => {
		const gateway = new RealAregSkillxWorkspaceGateway({ npxSkills: new MutatingNpxSkillsGateway({ skillsToCreate: [] }) });
		expect(await gateway.cleanupWorkspace({ workspaceRoot: path.join(os.tmpdir(), "not-skillx-demo"), cwd: "/repo", env: {} })).toMatchObject({
			ok: false,
			error: { code: "skillx-cleanup-refused" },
		});
		expect(await gateway.cleanupWorkspace({ workspaceRoot: path.join(os.tmpdir(), "skillx.missing-demo"), cwd: "/repo", env: {} })).toMatchObject({
			ok: false,
			error: { code: "skillx-cleanup-missing" },
		});

		const nonDirectory = path.join(os.tmpdir(), `skillx.file-${randomUUID()}`);
		await writeFile(nonDirectory, "not a directory");
		try {
			expect(await gateway.cleanupWorkspace({ workspaceRoot: nonDirectory, cwd: "/repo", env: {} })).toMatchObject({ ok: false, error: { code: "skillx-cleanup-not-directory" } });
		} finally {
			await rm(nonDirectory, { force: true });
		}

		const symlinkPath = path.join(os.tmpdir(), `skillx.symlink-${randomUUID()}`);
		await symlink(os.tmpdir(), symlinkPath);
		try {
			expect(await gateway.cleanupWorkspace({ workspaceRoot: symlinkPath, cwd: "/repo", env: {} })).toMatchObject({ ok: false, error: { code: "skillx-cleanup-symlink" } });
		} finally {
			await rm(symlinkPath, { force: true });
		}

		const outside = path.join(process.cwd(), `skillx.outside-${randomUUID()}`);
		await mkdir(outside);
		try {
			expect(await gateway.cleanupWorkspace({ workspaceRoot: outside, cwd: "/repo", env: {} })).toMatchObject({ ok: false, error: { code: "skillx-cleanup-outside-temp" } });
		} finally {
			await rm(outside, { recursive: true, force: true });
		}

		const removable = await mkdtemp(path.join(os.tmpdir(), "skillx.cleanup."));
		expect(await gateway.cleanupWorkspace({ workspaceRoot: removable, cwd: "/repo", env: {} })).toEqual({ ok: true });
		await expect(lstat(removable)).rejects.toMatchObject({ code: "ENOENT" });
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
