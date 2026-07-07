import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/capability-kit/git/testing";
import {
	buildInstallManifestData,
	INSTALL_MANIFEST_FILE_NAME,
} from "@nseng-ai/harness-artifacts/api";
import type { InstallManifestEntryData } from "@nseng-ai/harness-artifacts/api";

import { RealAregProjectGateway } from "../../src/real-gateways.ts";

describe("real areg gateways", () => {
	test("check project inspection resolves relative path, symlink targets, excludes, and prunes pairing traversal", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-check."));
		try {
			const project = path.join(root, "project");
			await mkdir(path.join(project, "skills", "demo", "agents"), { recursive: true });
			await mkdir(path.join(project, ".agents", "skills"), { recursive: true });
			await mkdir(path.join(project, ".claude", "skills"), { recursive: true });
			await mkdir(path.join(project, ".git", "info"), { recursive: true });
			await writeFile(
				path.join(project, "skills-lock.json"),
				JSON.stringify({
					version: 1,
					skills: {
						demo: { source: "skills/demo", sourceType: "local", computedHash: "a".repeat(64) },
					},
				}),
			);
			await writeFile(path.join(project, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
			await writeFile(path.join(project, "skills", "demo", "agents", "openai.yaml"), "policy:\n");
			await writeFile(path.join(project, ".git", "info", "exclude"), ".agents/skills/local-only\n");
			await symlink(
				path.join("..", "..", "skills", "demo"),
				path.join(project, ".agents", "skills", "demo"),
			);
			await symlink(
				path.join("..", "..", ".agents", "skills", "demo"),
				path.join(project, ".claude", "skills", "demo"),
			);
			await writeFile(path.join(project, "AGENTS.md"), "# Agents\n");
			await writeFile(path.join(project, "CLAUDE.md"), "# Claude\n\n@AGENTS.md\n");
			await mkdir(path.join(project, ".agents", "skills", "ignored"), { recursive: true });
			await writeFile(
				path.join(project, ".agents", "skills", "ignored", "CLAUDE.md"),
				"# ignored\n",
			);

			const git = new InMemoryGitGateway({
				gitPaths: { "info/exclude": path.join(project, ".git", "info", "exclude") },
			});
			const gateway = new RealAregProjectGateway({ git });
			const base = await gateway.inspectProjectBase({ cwd: root, projectPath: "project", env: {} });
			const inventory = await gateway.inspectSkillNameInventory({
				projectDir: base.projectDir,
				env: {},
			});
			const excludedSkillNames = await gateway.readLocallyExcludedSkillNames({
				projectDir: base.projectDir,
				env: {},
			});
			const skill = await gateway.inspectCheckSkill({
				projectDir: base.projectDir,
				skillName: "demo",
				env: {},
			});
			const pairingDirectories = await gateway.inspectPairingDirectories({
				projectDir: base.projectDir,
				env: {},
			});

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
			expect(pairingDirectories).toEqual([
				{
					relativeDir: "",
					hasAgents: true,
					hasClaude: true,
					claudeText: "# Claude\n\n@AGENTS.md\n",
				},
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("project gateway inspects shared harness artifact manifests", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-manifest."));
		try {
			const project = path.join(root, "project");
			const targetRoot = path.join(project, ".pi", "skills");
			const skillRoot = path.join(targetRoot, "manifest-skill");
			await mkdir(skillRoot, { recursive: true });
			await writeFile(path.join(skillRoot, "SKILL.md"), "---\nname: manifest-skill\n---\n");
			const entry: InstallManifestEntryData = {
				artifactId: "manifest-skill",
				kind: "skill",
				provisionName: "manifest-skill",
				harness: "pi",
				scope: "project",
				targetRoot,
				targetArtifactPath: skillRoot,
				source: {
					type: "npm-module",
					packageName: "@example/skills",
					relativePath: "skills/manifest-skill",
					version: "1.2.3",
				},
				files: {
					"SKILL.md": {
						sourcePath: "/source/SKILL.md",
						targetPath: path.join(skillRoot, "SKILL.md"),
						contentHash: "a".repeat(64),
					},
				},
			};
			await writeFile(
				path.join(targetRoot, INSTALL_MANIFEST_FILE_NAME),
				`${JSON.stringify(buildInstallManifestData([entry]), null, 2)}\n`,
			);

			const gateway = new RealAregProjectGateway();
			const manifest = await gateway.inspectManifestSkillSources({ projectDir: project, env: {} });

			expect(manifest.errors).toEqual([]);
			expect(manifest.sources).toEqual([
				expect.objectContaining({
					skillName: "manifest-skill",
					harness: "pi",
					scope: "project",
					manifestPath: path.join(targetRoot, INSTALL_MANIFEST_FILE_NAME),
					source: expect.objectContaining({ packageName: "@example/skills", version: "1.2.3" }),
					targetSkillRelativePath: path.join(".pi", "skills", "manifest-skill"),
					skillDir: { type: "directory" },
					skillMd: { type: "file", text: "---\nname: manifest-skill\n---\n" },
				}),
			]);
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
			await writeFile(
				excludePath,
				"# local excludes\n.claude/skills/linked-only\n.agents/skills/agents-only\n\n",
			);
			const git = new InMemoryGitGateway({ gitPaths: { "info/exclude": excludePath } });
			const gateway = new RealAregProjectGateway({ git });

			expect(await gateway.readLocallyExcludedSkillNames({ projectDir: project, env: {} })).toEqual(
				["agents-only", "linked-only"],
			);
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

			expect(await gateway.readLocallyExcludedSkillNames({ projectDir: project, env: {} })).toEqual(
				[],
			);
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
			await mkdir(path.join(project, ".agents", "skills", "vendored", "agents"), {
				recursive: true,
			});
			await mkdir(path.join(project, ".claude", "skills", "claude-only"), { recursive: true });
			await mkdir(path.join(project, ".pi", "extensions"), { recursive: true });
			await mkdir(
				path.join(
					project,
					"ts",
					"packages",
					"internal",
					"pi-tools",
					"src",
					"backing-skill-commands",
				),
				{
					recursive: true,
				},
			);
			await writeFile(path.join(project, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
			await writeFile(path.join(project, "skills", "demo", "README.md"), "nested docs\n");
			await writeFile(
				path.join(project, "skills", "demo", "agents", "openai.yaml"),
				"policy:\n  allow_implicit_invocation: false\n",
			);
			await writeFile(
				path.join(project, ".agents", "skills", "vendored", "SKILL.md"),
				"---\nname: vendored\n---\n",
			);
			await writeFile(
				path.join(project, ".agents", "skills", "vendored", "agents", "openai.yaml"),
				"policy:\n  allow_implicit_invocation: false\n",
			);
			await writeFile(
				path.join(project, ".claude", "skills", "claude-only", "SKILL.md"),
				"---\nname: claude-only\n---\n",
			);
			await writeFile(
				path.join(project, ".pi", "settings.json"),
				JSON.stringify({ skills: ["-skills/demo"] }),
			);
			await writeFile(
				path.join(project, ".pi", "extensions", "backing-skill-commands.ts"),
				"export {};\n",
			);
			await writeFile(
				path.join(
					project,
					"ts",
					"packages",
					"internal",
					"pi-tools",
					"src",
					"backing-skill-commands",
					"extension.ts",
				),
				"export {};\n",
			);
			await symlink(
				path.join("..", "..", "skills", "demo"),
				path.join(project, ".agents", "skills", "demo"),
			);

			const gateway = new RealAregProjectGateway();
			const base = await gateway.inspectProjectBase({ cwd: root, projectPath: "project", env: {} });
			const piArtifacts = await gateway.inspectPiArtifacts({
				projectDir: base.projectDir,
				env: {},
			});
			const inventory = await gateway.inspectSkillNameInventory({
				projectDir: base.projectDir,
				env: {},
			});
			const skill = await gateway.inspectSkillKindSkill({
				projectDir: base.projectDir,
				skillName: "demo",
				env: {},
			});
			const vendored = await gateway.inspectSkillKindSkill({
				projectDir: base.projectDir,
				skillName: "vendored",
				env: {},
			});
			const findRoots = await gateway.inspectSkillFindRoots({
				projectDir: base.projectDir,
				env: {},
			});

			expect(base).toMatchObject({ projectDir: project, projectPathState: { type: "directory" } });
			expect(piArtifacts).toMatchObject({
				piDir: { type: "directory" },
				piSettings: { type: "file", text: JSON.stringify({ skills: ["-skills/demo"] }) },
				replacement: {
					verifiedSurfaces: expect.arrayContaining([
						"ns:objective:next",
						"code:just-fix",
						"ns:branch-context:from-plan",
						"ns:branch-context:impl-attached-plan",
						"ns:plan:save",
						"ns:flow:submit",
					]),
				},
			});
			expect(inventory.skillKindNames).toEqual(["demo", "vendored"]);
			expect(skill).toMatchObject({
				name: "demo",
				sourceType: "repo",
				baseRelativePath: "skills/demo",
				skillDir: { type: "directory" },
				skillMd: { type: "file", text: "---\nname: demo\n---\n" },
				openaiPolicy: { type: "file" },
			});
			expect(vendored).toMatchObject({
				name: "vendored",
				sourceType: "vendored",
				baseRelativePath: ".agents/skills/vendored",
				skillDir: { type: "directory" },
				skillMd: { type: "file", text: "---\nname: vendored\n---\n" },
				openaiPolicy: { type: "file" },
			});
			expect(findRoots.skills).toMatchObject([
				{ name: "demo", root: "skills", sourceType: "repo" },
				{ name: "vendored", root: ".agents/skills", sourceType: "vendored" },
				{ name: "claude-only", root: ".claude/skills", sourceType: "claude" },
			]);
			expect(
				await gateway.resolveSkillKindSpec({
					projectDir: project,
					spec: path.join(project, ".agents", "skills", "demo"),
					cwd: project,
					env: {},
				}),
			).toEqual({ type: "ok", skillName: "demo" });
			expect(
				await gateway.resolveSkillKindSpec({
					projectDir: project,
					spec: path.join(project, ".agents", "skills", "vendored", "SKILL.md"),
					cwd: project,
					env: {},
				}),
			).toEqual({ type: "ok", skillName: "vendored" });
			expect(
				await gateway.resolveSkillKindSpec({
					projectDir: project,
					spec: path.join(project, "skills", "demo", "README.md"),
					cwd: project,
					env: {},
				}),
			).toMatchObject({ type: "error", error: { code: "skill-kind-nested-spec" } });
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("skill-kind apply writes and removes only planned managed paths", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-kind-apply."));
		try {
			const project = path.join(root, "project");
			await mkdir(path.join(project, "skills", "demo"), { recursive: true });
			await mkdir(path.join(project, ".agents", "skills", "vendored"), { recursive: true });
			await writeFile(path.join(project, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
			await writeFile(
				path.join(project, ".agents", "skills", "vendored", "SKILL.md"),
				"---\nname: vendored\n---\n",
			);
			const gateway = new RealAregProjectGateway();

			const firstWrite = await gateway.writeTextFile({
				projectDir: project,
				relativePath: "skills/demo/SKILL.md",
				content: "---\nname: demo\ndisable-model-invocation: true\n---\n",
				description: "SKILL.md",
				createParent: false,
				env: {},
			});
			const secondWrite = await gateway.writeTextFile({
				projectDir: project,
				relativePath: "skills/demo/agents/openai.yaml",
				content: "policy:\n  allow_implicit_invocation: false\n",
				description: "Codex openai.yaml",
				createParent: true,
				env: {},
			});
			const thirdWrite = await gateway.writeTextFile({
				projectDir: project,
				relativePath: ".pi/settings.json",
				content: '{\n  "skills": [\n    "-skills/demo"\n  ]\n}\n',
				description: "Pi settings",
				createParent: true,
				env: {},
			});
			const vendoredWrite = await gateway.writeTextFile({
				projectDir: project,
				relativePath: ".agents/skills/vendored/agents/openai.yaml",
				content: "policy:\n  allow_implicit_invocation: false\n",
				description: "Codex openai.yaml",
				createParent: true,
				env: {},
			});

			expect([firstWrite, secondWrite, thirdWrite, vendoredWrite]).toEqual([
				{ ok: true },
				{ ok: true },
				{ ok: true },
				{ ok: true },
			]);
			expect(await readFile(path.join(project, "skills", "demo", "SKILL.md"), "utf8")).toContain(
				"disable-model-invocation: true",
			);
			expect(await readFile(path.join(project, ".pi", "settings.json"), "utf8")).toContain(
				"-skills/demo",
			);

			const deleted = await gateway.deleteFile({
				projectDir: project,
				relativePath: "skills/demo/agents/openai.yaml",
				description: "Codex openai.yaml",
				env: {},
			});
			const removed = await gateway.removeEmptyDir({
				projectDir: project,
				relativePath: "skills/demo/agents",
				description: "empty skill agents directory",
				env: {},
			});
			expect(deleted).toEqual({ ok: true });
			expect(removed).toEqual({ ok: true, removed: true });
			await expect(lstat(path.join(project, "skills", "demo", "agents"))).rejects.toMatchObject({
				code: "ENOENT",
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("skill-kind gateway inspects mirrors and deletes convention mirror symlinks", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-kind-symlink."));
		try {
			const project = path.join(root, "project");
			await mkdir(path.join(project, "skills", "demo"), { recursive: true });
			await mkdir(path.join(project, ".agents", "skills"), { recursive: true });
			await mkdir(path.join(project, ".claude", "skills"), { recursive: true });
			await writeFile(path.join(project, "skills", "demo", "SKILL.md"), "---\nname: demo\n---\n");
			await symlink(
				path.join("..", "..", "skills", "demo"),
				path.join(project, ".agents", "skills", "demo"),
			);
			await symlink(
				path.join("..", "..", ".agents", "skills", "demo"),
				path.join(project, ".claude", "skills", "demo"),
			);
			const gateway = new RealAregProjectGateway();

			const inspected = await gateway.inspectSkillKindSkill({
				projectDir: project,
				skillName: "demo",
				env: {},
			});
			expect(inspected).toMatchObject({
				agentsPath: { type: "symlink", target: "../../skills/demo" },
				claudePath: { type: "symlink", target: "../../.agents/skills/demo" },
			});

			// Refusals before any deletion happens.
			expect(
				await gateway.deleteSymlink({
					projectDir: project,
					relativePath: "skills/demo",
					description: "skill directory",
					env: {},
				}),
			).toMatchObject({ ok: false, error: { code: "skill-kind-delete-symlink-refused" } });
			expect(
				await gateway.deleteSymlink({
					projectDir: project,
					relativePath: "../outside",
					description: "outside path",
					env: {},
				}),
			).toMatchObject({ ok: false, error: { code: "skill-kind-delete-symlink-refused" } });
			expect(
				await gateway.preflightDeleteSymlink({
					projectDir: project,
					relativePath: ".agents/skills/missing",
					description: "agents skill mirror symlink",
					env: {},
				}),
			).toMatchObject({ ok: false, error: { code: "skill-kind-delete-symlink-missing" } });

			await mkdir(path.join(project, ".agents", "skills", "real-dir"), { recursive: true });
			expect(
				await gateway.deleteSymlink({
					projectDir: project,
					relativePath: ".agents/skills/real-dir",
					description: "agents skill mirror symlink",
					env: {},
				}),
			).toMatchObject({ ok: false, error: { code: "skill-kind-delete-symlink-not-symlink" } });

			await symlink(
				path.join("..", "..", "elsewhere", "demo"),
				path.join(project, ".claude", "skills", "wrong-target"),
			);
			expect(
				await gateway.deleteSymlink({
					projectDir: project,
					relativePath: ".claude/skills/wrong-target",
					description: "Claude skill mirror symlink",
					env: {},
				}),
			).toMatchObject({ ok: false, error: { code: "skill-kind-delete-symlink-wrong-target" } });
			expect(await lstat(path.join(project, ".claude", "skills", "wrong-target"))).toBeDefined();

			// Happy path: preflight then delete both convention mirrors.
			expect(
				await gateway.preflightDeleteSymlink({
					projectDir: project,
					relativePath: ".claude/skills/demo",
					description: "Claude skill mirror symlink",
					env: {},
				}),
			).toEqual({ ok: true });
			expect(
				await gateway.deleteSymlink({
					projectDir: project,
					relativePath: ".claude/skills/demo",
					description: "Claude skill mirror symlink",
					env: {},
				}),
			).toEqual({ ok: true });
			expect(
				await gateway.deleteSymlink({
					projectDir: project,
					relativePath: ".agents/skills/demo",
					description: "agents skill mirror symlink",
					env: {},
				}),
			).toEqual({ ok: true });
			await expect(lstat(path.join(project, ".claude", "skills", "demo"))).rejects.toMatchObject({
				code: "ENOENT",
			});
			await expect(lstat(path.join(project, ".agents", "skills", "demo"))).rejects.toMatchObject({
				code: "ENOENT",
			});
			// The canonical skill directory is untouched.
			expect(await lstat(path.join(project, "skills", "demo"))).toBeDefined();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("update project inspection reads only update inputs", async () => {
		const root = await mkdtemp(path.join(os.tmpdir(), "areg-update."));
		try {
			const project = path.join(root, "project");
			await mkdir(project);
			await writeFile(
				path.join(project, "skills-lock.json"),
				JSON.stringify({ version: 1, skills: {} }),
			);
			await writeFile(path.join(project, "ns.toml"), '[areg]\nagents = ["codex"]\n');

			const result = await new RealAregProjectGateway().inspectProjectBase({
				cwd: root,
				projectPath: "project",
				env: {},
			});

			expect(result).toMatchObject({
				projectDir: project,
				projectPathState: { type: "directory" },
				lockfile: { type: "file", text: JSON.stringify({ version: 1, skills: {} }) },
				nsToml: { type: "file", text: '[areg]\nagents = ["codex"]\n' },
				aregJson: { type: "missing" },
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
