import { describe, expect, test } from "vitest";

import type {
	FakeAregProjectGatewayOptions,
	FakeAregCheckSkillOptions,
} from "../../src/fake-gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

const VALID_LOCAL_HASH = "a".repeat(64);
const VALID_REMOTE_HASH = "b".repeat(64);
const VALID_SKILL_MD = "---\nname: demo\ndescription: Demo skill\n---\n";

function localEntry(name: string, computedHash = VALID_LOCAL_HASH): object {
	return { source: `skills/${name}`, sourceType: "local", computedHash };
}

function remoteEntry(computedHash = VALID_REMOTE_HASH): object {
	return { source: "org/repo", sourceType: "github", computedHash };
}

function localSkill(
	name: string,
	options: Partial<FakeAregCheckSkillOptions> = {},
): FakeAregCheckSkillOptions {
	return {
		name,
		skillsPath: { type: "directory" },
		agentsPath: { type: "symlink", target: `../../skills/${name}` },
		claudePath: { type: "symlink", target: `../../.agents/skills/${name}` },
		localSkillMd: { type: "file", text: VALID_SKILL_MD },
		...options,
	};
}

function remoteSkill(
	name: string,
	options: Partial<FakeAregCheckSkillOptions> = {},
): FakeAregCheckSkillOptions {
	return {
		name,
		skillsPath: { type: "missing" },
		agentsPath: { type: "directory" },
		claudePath: { type: "symlink", target: `../../.agents/skills/${name}` },
		remoteSkillMd: { type: "file", text: VALID_SKILL_MD },
		...options,
	};
}

function project(options: FakeAregProjectGatewayOptions): FakeAregProjectGatewayOptions {
	return { projectDir: "/repo", ...options };
}

describe("areg check CLI", () => {
	test("succeeds for a representative local project and renders exact human success", async () => {
		const run = runScenario(["check", "--path", "."], {
			project: project({
				lockfile: { version: 1, skills: { demo: localEntry("demo") } },
				checkSkills: [localSkill("demo")],
			}),
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("All skills OK.\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("recognizes a present manifest-provisioned skill without requiring a lockfile entry", async () => {
		const run = runScenario(["check", "--format", "json"], {
			project: project({
				manifestSkillSources: [
					{ skillName: "manifest-skill", targetSkillRelativePath: "skills/manifest-skill" },
				],
				checkSkills: [localSkill("manifest-skill")],
			}),
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join("")).data).toMatchObject({ ok: true, issues: [] });
	});

	test("reports missing manifest-provisioned skill targets", async () => {
		const run = runScenario(["check", "--format", "json"], {
			project: project({
				manifestSkillSources: [
					{
						skillName: "manifest-skill",
						targetSkillRelativePath: ".pi/skills/manifest-skill",
						skillDir: { type: "missing" },
					},
				],
			}),
		});

		expect(await run.exit).toBe(1);
		expect(JSON.parse(run.stdout.join("")).data.issues).toContainEqual(
			expect.objectContaining({
				code: "manifest-skill-target-missing",
				skill: "manifest-skill",
			}),
		);
	});

	test("success JSON uses a Clinkr envelope with structured check data", async () => {
		const run = runScenario(["check", "--format", "json"], {
			project: project({
				lockfile: { version: 1, skills: { demo: localEntry("demo") } },
				checkSkills: [localSkill("demo")],
			}),
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			status: "ok",
			exitCode: 0,
			data: { ok: true, projectDir: "/repo", issueCount: 0, issues: [] },
		});
	});

	test("missing and malformed lockfiles are command errors with accepted messages", async () => {
		const missing = runScenario(["check"], { project: project({ lockfile: { type: "missing" } }) });
		expect(await missing.exit).toBe(2);
		expect(missing.stderr.join("")).toContain(
			"skills-lock.json not found in /repo. Is this an areg project?",
		);

		const malformed = runScenario(["check"], { project: project({ lockfile: "{" }) });
		expect(await malformed.exit).toBe(2);
		expect(malformed.stderr.join("")).toContain("Invalid JSON in skills-lock.json:");
	});

	test("reports invalid hashes with Python issue codes in JSON", async () => {
		const run = runScenario(["check", "--format", "json"], {
			project: project({
				lockfile: {
					version: 1,
					skills: {
						demo: localEntry("demo", "PENDING_REGEN"),
						short: localEntry("short", "abc123"),
					},
				},
				checkSkills: [localSkill("demo"), localSkill("short")],
			}),
		});

		expect(await run.exit).toBe(1);
		const body = JSON.parse(run.stdout.join(""));
		expect(body.exitCode).toBe(1);
		expect(body.data.issues).toEqual([
			expect.objectContaining({
				skill: "demo",
				code: "invalid-lock-hash",
				message: expect.stringContaining("placeholder computedHash PENDING_REGEN"),
			}),
			expect.objectContaining({
				skill: "short",
				code: "invalid-lock-hash",
				message: expect.stringContaining("invalid computedHash 'abc123'"),
			}),
		]);
	});

	test("reports representative local and remote layout failures", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { local: localEntry("local"), remote: remoteEntry() } },
				checkSkills: [
					localSkill("local", {
						skillsPath: { type: "missing" },
						agentsPath: { type: "directory" },
					}),
					remoteSkill("remote", {
						agentsPath: { type: "symlink", target: "../../skills/remote" },
						skillsPath: { type: "directory" },
					}),
				],
			}),
		});

		expect(await run.exit).toBe(1);
		const stderr = run.stderr.join("");
		expect(stderr).toContain("skills/local/ does not exist");
		expect(stderr).toContain(".agents/skills/local is a real directory, expected symlink");
		expect(stderr).toContain(".agents/skills/remote is a symlink but should be a real directory");
		expect(stderr).toContain("GitHub-sourced skill should not have skills/remote/ entry");
	});

	test("reports SKILL.md frontmatter and invoke-only conversion failures", async () => {
		const longDescription = "x".repeat(1025);
		const run = runScenario(["check"], {
			project: project({
				lockfile: {
					version: 1,
					skills: {
						bad: localEntry("bad"),
						invoke: localEntry("invoke"),
						sidecar: localEntry("sidecar"),
					},
				},
				checkSkills: [
					localSkill("bad", {
						localSkillMd: {
							type: "file",
							text: `---\nname: bad\ndescription: "${longDescription}"\n---\n`,
						},
					}),
					localSkill("invoke", {
						localSkillMd: {
							type: "file",
							text: "---\nname: invoke\ndisable-model-invocation: true\n---\n",
						},
					}),
					localSkill("sidecar", {
						openaiPolicy: { type: "file", text: "policy:\n  allow_implicit_invocation: false\n" },
					}),
				],
			}),
		});

		expect(await run.exit).toBe(1);
		const stderr = run.stderr.join("");
		expect(stderr).toContain("invalid description: exceeds maximum length of 1024 characters");
		expect(stderr).toContain("skills/invoke/agents/openai.yaml missing for invoke-only skill");
		expect(stderr).not.toContain(".pi/settings.json missing -skills/invoke");
		expect(stderr).toContain("exists but SKILL.md does not set disable-model-invocation: true");
	});

	test("reports non-managed skill invocation sidecars", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: {
					version: 1,
					skills: { local: localEntry("local"), remote: remoteEntry() },
				},
				checkSkills: [
					localSkill("local", {
						localSkillMd: {
							type: "file",
							text: "---\nname: local\ndisable-model-invocation: true\n---\n",
						},
						openaiPolicy: { type: "file", text: "allow_implicit_invocation: false\n" },
					}),
					remoteSkill("remote", {
						remoteSkillMd: {
							type: "file",
							text: "---\nname: remote\ndisable-model-invocation: true\n---\n",
						},
						openaiPolicy: { type: "file", text: "allow_implicit_invocation: false\n" },
					}),
				],
			}),
		});

		expect(await run.exit).toBe(1);
		const stderr = run.stderr.join("");
		expect(stderr).toContain("skills/local/agents/openai.yaml exists with non-managed content");
		expect(stderr).toContain(
			".agents/skills/remote/agents/openai.yaml exists with non-managed content",
		);
	});

	test("reports missing Pi exclusion for command-backed skill-kind facts", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { "code-workflows": localEntry("code-workflows") } },
				replacementSurfaces: ["code:workflows"],
				checkSkills: [
					localSkill("code-workflows", {
						localSkillMd: {
							type: "file",
							text: "---\nname: code-workflows\ndisable-model-invocation: true\n---\n",
						},
						openaiPolicy: { type: "file", text: "policy:\n  allow_implicit_invocation: false\n" },
					}),
				],
			}),
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(
			".pi/settings.json missing -skills/code-workflows for command-backed skill",
		);
	});

	test("malformed Pi settings are hard command errors when managed skills need conversion checks", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { demo: localEntry("demo") } },
				piSettings: "not json",
				checkSkills: [localSkill("demo")],
			}),
		});

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Invalid JSON in .pi/settings.json:");
	});

	test("refuses symlinked Pi directory when managed skills make Pi settings relevant", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { demo: localEntry("demo") } },
				piDir: { type: "symlink", target: "../outside" },
				checkSkills: [localSkill("demo")],
			}),
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(".pi is a symlink; refusing to inspect Pi settings.");
	});

	test("refuses symlinked Pi settings when managed skills make Pi settings relevant", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { demo: localEntry("demo") } },
				piSettings: { type: "symlink", target: "../settings.json" },
				checkSkills: [localSkill("demo")],
			}),
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(
			".pi/settings.json is a symlink; refusing to inspect Pi settings.",
		);
	});

	test("refuses non-file Pi settings when managed skills make Pi settings relevant", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { demo: localEntry("demo") } },
				piSettings: { type: "directory" },
				checkSkills: [localSkill("demo")],
			}),
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain(".pi/settings.json exists but is not a file.");
	});

	test("validates invocation metadata for remote-only lockfiles", async () => {
		const malformedSettings = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { remote: remoteEntry() } },
				piSettings: "not json",
				checkSkills: [remoteSkill("remote")],
			}),
		});
		expect(await malformedSettings.exit).toBe(2);
		expect(malformedSettings.stderr.join("")).toContain("Invalid JSON in .pi/settings.json:");

		const missingSidecar = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { remote: remoteEntry() } },
				checkSkills: [
					remoteSkill("remote", {
						remoteSkillMd: {
							type: "file",
							text: "---\nname: remote\ndisable-model-invocation: true\n---\n",
						},
					}),
				],
			}),
		});
		expect(await missingSidecar.exit).toBe(1);
		expect(missingSidecar.stderr.join("")).toContain(
			".agents/skills/remote/agents/openai.yaml missing for invoke-only skill",
		);
	});

	test("reports missing Pi replacement for excluded command-backed skills", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { "code-workflows": localEntry("code-workflows") } },
				piSettings: { skills: ["-skills/code-workflows"] },
				checkSkills: [
					localSkill("code-workflows", {
						localSkillMd: {
							type: "file",
							text: "---\nname: code-workflows\ndisable-model-invocation: true\n---\n",
						},
						openaiPolicy: { type: "file", text: "policy:\n  allow_implicit_invocation: false\n" },
					}),
				],
			}),
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("expected /code:workflows");
	});

	test("reports mirrors-present drift for excluded unlisted-candidate skill", async () => {
		const run = runScenario(["check", "--format", "json"], {
			project: project({
				lockfile: { version: 1, skills: { "custom-command": localEntry("custom-command") } },
				piSettings: { skills: ["-skills/custom-command"] },
				checkSkills: [
					localSkill("custom-command", {
						localSkillMd: {
							type: "file",
							text: "---\nname: custom-command\ndisable-model-invocation: true\n---\n",
						},
						openaiPolicy: { type: "file", text: "policy:\n  allow_implicit_invocation: false\n" },
					}),
				],
			}),
		});

		expect(await run.exit).toBe(1);
		const body = JSON.parse(run.stdout.join(""));
		expect(body.data.issues).toEqual([
			expect.objectContaining({
				skill: "custom-command",
				code: "unlisted-mirrors-present",
				message: expect.stringContaining(
					".agents/skills/custom-command and .claude/skills/custom-command still exist(s)",
				),
			}),
		]);
		expect(body.data.issues[0].message).toContain("areg skill apply unlisted custom-command");
		expect(body.data.issues[0].message).toContain("COMMAND_BACKED_SKILL_REGISTRY");
	});

	test("healthy unlisted skill passes without mirror assertions", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { "setup-hidden": localEntry("setup-hidden") } },
				piSettings: { skills: ["-skills/setup-hidden"] },
				checkSkills: [
					localSkill("setup-hidden", {
						agentsPath: { type: "missing" },
						claudePath: { type: "missing" },
						localSkillMd: {
							type: "file",
							text: "---\nname: setup-hidden\ndisable-model-invocation: true\n---\n",
						},
						openaiPolicy: { type: "file", text: "policy:\n  allow_implicit_invocation: false\n" },
					}),
				],
			}),
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("All skills OK.\n");
	});

	test("degraded unlisted states stay red on every single failure", async () => {
		// Missing sidecar: mirror assertions still fire alongside the invoke-only issue.
		const missingSidecar = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { "setup-hidden": localEntry("setup-hidden") } },
				piSettings: { skills: ["-skills/setup-hidden"] },
				checkSkills: [
					localSkill("setup-hidden", {
						agentsPath: { type: "missing" },
						claudePath: { type: "missing" },
						localSkillMd: {
							type: "file",
							text: "---\nname: setup-hidden\ndisable-model-invocation: true\n---\n",
						},
					}),
				],
			}),
		});
		expect(await missingSidecar.exit).toBe(1);
		const missingSidecarErrors = missingSidecar.stderr.join("");
		expect(missingSidecarErrors).toContain(
			"skills/setup-hidden/agents/openai.yaml missing for invoke-only skill",
		);
		expect(missingSidecarErrors).toContain(".agents/skills/setup-hidden does not exist");
		expect(missingSidecarErrors).toContain(".claude/skills/setup-hidden does not exist");

		// One mirror present: mirror assertions run and the drift issue fires.
		const oneMirror = runScenario(["check", "--format", "json"], {
			project: project({
				lockfile: { version: 1, skills: { "setup-hidden": localEntry("setup-hidden") } },
				piSettings: { skills: ["-skills/setup-hidden"] },
				checkSkills: [
					localSkill("setup-hidden", {
						agentsPath: { type: "missing" },
						localSkillMd: {
							type: "file",
							text: "---\nname: setup-hidden\ndisable-model-invocation: true\n---\n",
						},
						openaiPolicy: { type: "file", text: "policy:\n  allow_implicit_invocation: false\n" },
					}),
				],
			}),
		});
		expect(await oneMirror.exit).toBe(1);
		const oneMirrorIssues = JSON.parse(oneMirror.stdout.join("")).data.issues;
		expect(oneMirrorIssues).toEqual([
			expect.objectContaining({ code: "agents-missing" }),
			expect.objectContaining({
				code: "unlisted-mirrors-present",
				message: expect.stringContaining(".claude/skills/setup-hidden still exist(s)"),
			}),
		]);
	});

	test("reports orphan, dangling, and AGENTS/CLAUDE pairing failures", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { ghost: remoteEntry() } },
				skillsDirectoryNames: ["orphan-local"],
				agentsSkillNames: ["orphan-remote"],
				checkSkills: [],
				pairingDirectories: [
					{ relativeDir: "", hasAgents: true, hasClaude: true, claudeText: "missing ref" },
					{ relativeDir: "pkg", hasAgents: false, hasClaude: true, claudeText: "@AGENTS.md" },
				],
			}),
		});

		expect(await run.exit).toBe(1);
		const stderr = run.stderr.join("");
		expect(stderr).toContain("Orphaned directory skills/orphan-local/");
		expect(stderr).toContain("Orphaned directory .agents/skills/orphan-remote/");
		expect(stderr).toContain("Dangling lockfile entry: no directories found on disk for ghost");
		expect(stderr).toContain("CLAUDE.md at CLAUDE.md does not include peer AGENTS.md");
		expect(stderr).toContain("CLAUDE.md at pkg/CLAUDE.md has no peer AGENTS.md");
	});
});
