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

	test("success JSON uses a Clinkr envelope with structured check data", async () => {
		const run = runScenario(["check", "--format", "json"], {
			project: project({
				lockfile: { version: 1, skills: { demo: localEntry("demo") } },
				checkSkills: [localSkill("demo")],
			}),
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			exit_code: 0,
			data: { ok: true, project_dir: "/repo", issue_count: 0, issues: [] },
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

		expect(await run.exit).toBe(0);
		const body = JSON.parse(run.stdout.join(""));
		expect(body.exit_code).toBe(1);
		expect(body.data.issues).toEqual([
			expect.objectContaining({
				skill: "demo",
				code: "invalid_lock_hash",
				message: expect.stringContaining("placeholder computedHash PENDING_REGEN"),
			}),
			expect.objectContaining({
				skill: "short",
				code: "invalid_lock_hash",
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

		expect(await run.exit).toBe(0);
		const stdout = run.stdout.join("");
		expect(stdout).toContain("skills/local/ does not exist");
		expect(stdout).toContain(".agents/skills/local is a real directory, expected symlink");
		expect(stdout).toContain(".agents/skills/remote is a symlink but should be a real directory");
		expect(stdout).toContain("GitHub-sourced skill should not have skills/remote/ entry");
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

		expect(await run.exit).toBe(0);
		const stdout = run.stdout.join("");
		expect(stdout).toContain("invalid description: exceeds maximum length of 1024 characters");
		expect(stdout).toContain("skills/invoke/agents/openai.yaml missing for invoke-only skill");
		expect(stdout).not.toContain(".pi/settings.json missing -skills/invoke");
		expect(stdout).toContain("exists but SKILL.md does not set disable-model-invocation: true");
	});

	test("reports missing Pi exclusion for command-backed skill-kind facts", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { "custom-command": localEntry("custom-command") } },
				replacementSurfaces: ["custom:command"],
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

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain(
			".pi/settings.json missing -skills/custom-command for command-backed skill",
		);
	});

	test("malformed Pi settings are hard command errors when local skills need conversion checks", async () => {
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

	test("refuses symlinked Pi directory when local skills make Pi settings relevant", async () => {
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

	test("refuses symlinked Pi settings when local skills make Pi settings relevant", async () => {
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

	test("refuses non-file Pi settings when local skills make Pi settings relevant", async () => {
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

	test("ignores malformed Pi settings for remote-only lockfiles", async () => {
		const run = runScenario(["check"], {
			project: project({
				lockfile: { version: 1, skills: { remote: remoteEntry() } },
				piSettings: "not json",
				checkSkills: [remoteSkill("remote")],
			}),
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("All skills OK.\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("reports missing Pi replacement for excluded command-backed skills", async () => {
		const run = runScenario(["check"], {
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

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("expected /custom:command");
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

		expect(await run.exit).toBe(0);
		const stdout = run.stdout.join("");
		expect(stdout).toContain("Orphaned directory skills/orphan-local/");
		expect(stdout).toContain("Orphaned directory .agents/skills/orphan-remote/");
		expect(stdout).toContain("Dangling lockfile entry: no directories found on disk for ghost");
		expect(stdout).toContain("CLAUDE.md at CLAUDE.md does not include peer AGENTS.md");
		expect(stdout).toContain("CLAUDE.md at pkg/CLAUDE.md has no peer AGENTS.md");
	});
});
