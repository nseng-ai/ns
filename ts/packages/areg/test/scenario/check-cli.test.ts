import { describe, expect, test } from "vitest";

import type { FakeAregCheckProjectInspectionGatewayOptions, FakeAregCheckSkillOptions } from "../../src/fake-gateways.ts";
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

function localSkill(name: string, options: Partial<FakeAregCheckSkillOptions> = {}): FakeAregCheckSkillOptions {
	return {
		name,
		skillsPath: { type: "directory" },
		agentsPath: { type: "symlink", target: `../../skills/${name}` },
		claudePath: { type: "symlink", target: `../../.agents/skills/${name}` },
		localSkillMd: { type: "file", text: VALID_SKILL_MD },
		...options,
	};
}

function remoteSkill(name: string, options: Partial<FakeAregCheckSkillOptions> = {}): FakeAregCheckSkillOptions {
	return {
		name,
		skillsPath: { type: "missing" },
		agentsPath: { type: "directory" },
		claudePath: { type: "symlink", target: `../../.agents/skills/${name}` },
		remoteSkillMd: { type: "file", text: VALID_SKILL_MD },
		...options,
	};
}

function project(options: FakeAregCheckProjectInspectionGatewayOptions): FakeAregCheckProjectInspectionGatewayOptions {
	return { projectDir: "/repo", ...options };
}

describe("areg check CLI", () => {
	test("succeeds for a representative local project and renders exact human success", async () => {
		const run = runScenario(["check", "--path", "."], {
			projectInspection: project({ lockfile: { version: 1, skills: { demo: localEntry("demo") } }, skills: [localSkill("demo")] }),
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("All skills OK.\n");
		expect(run.stderr.join("")).toBe("");
	});

	test("success JSON uses a Clinkr envelope with structured check data", async () => {
		const run = runScenario(["check", "--format", "json"], {
			projectInspection: project({ lockfile: { version: 1, skills: { demo: localEntry("demo") } }, skills: [localSkill("demo")] }),
		});

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			exit_code: 0,
			data: { ok: true, project_dir: "/repo", issue_count: 0, issues: [] },
		});
	});

	test("missing and malformed lockfiles are command errors with accepted messages", async () => {
		const missing = runScenario(["check"], { projectInspection: project({ lockfile: { type: "missing" } }) });
		expect(await missing.exit).toBe(1);
		expect(missing.stderr.join("")).toContain("skills-lock.json not found in /repo. Is this an areg project?");

		const malformed = runScenario(["check"], { projectInspection: project({ lockfile: "{" }) });
		expect(await malformed.exit).toBe(1);
		expect(malformed.stderr.join("")).toContain("Invalid JSON in skills-lock.json:");
	});

	test("reports invalid hashes with Python issue codes in JSON", async () => {
		const run = runScenario(["check", "--format", "json"], {
			projectInspection: project({
				lockfile: { version: 1, skills: { demo: localEntry("demo", "PENDING_REGEN"), short: localEntry("short", "abc123") } },
				skills: [localSkill("demo"), localSkill("short")],
			}),
		});

		expect(await run.exit).toBe(1);
		const body = JSON.parse(run.stdout.join(""));
		expect(body.data.issues).toEqual([
			expect.objectContaining({ skill: "demo", code: "invalid_lock_hash", message: expect.stringContaining("placeholder computedHash PENDING_REGEN") }),
			expect.objectContaining({ skill: "short", code: "invalid_lock_hash", message: expect.stringContaining("invalid computedHash 'abc123'") }),
		]);
	});

	test("reports representative local and remote layout failures", async () => {
		const run = runScenario(["check"], {
			projectInspection: project({
				lockfile: { version: 1, skills: { local: localEntry("local"), remote: remoteEntry() } },
				skills: [
					localSkill("local", { skillsPath: { type: "missing" }, agentsPath: { type: "directory" } }),
					remoteSkill("remote", { agentsPath: { type: "symlink", target: "../../skills/remote" }, skillsPath: { type: "directory" } }),
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
			projectInspection: project({
				lockfile: { version: 1, skills: { bad: localEntry("bad"), invoke: localEntry("invoke"), sidecar: localEntry("sidecar") } },
				skills: [
					localSkill("bad", { localSkillMd: { type: "file", text: `---\nname: bad\ndescription: \"${longDescription}\"\n---\n` } }),
					localSkill("invoke", { localSkillMd: { type: "file", text: "---\nname: invoke\ndisable-model-invocation: true\n---\n" } }),
					localSkill("sidecar", { openaiPolicy: { type: "file", text: "policy:\n  allow_implicit_invocation: false\n" } }),
				],
			}),
		});

		expect(await run.exit).toBe(1);
		const stderr = run.stderr.join("");
		expect(stderr).toContain("invalid description: exceeds maximum length of 1024 characters");
		expect(stderr).toContain("skills/invoke/agents/openai.yaml missing for invoke-only skill");
		expect(stderr).toContain(".pi/settings.json missing -skills/invoke");
		expect(stderr).toContain("exists but SKILL.md does not set disable-model-invocation: true");
	});

	test("malformed Pi settings are hard command errors when local skills need conversion checks", async () => {
		const run = runScenario(["check"], {
			projectInspection: project({
				lockfile: { version: 1, skills: { demo: localEntry("demo") } },
				piSettings: "not json",
				skills: [localSkill("demo")],
			}),
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("Invalid JSON in .pi/settings.json:");
	});

	test("reports missing Pi replacement for excluded derived skills", async () => {
		const run = runScenario(["check"], {
			projectInspection: project({
				lockfile: { version: 1, skills: { "custom-command": localEntry("custom-command") } },
				piSettings: { skills: ["-skills/custom-command"] },
				skills: [localSkill("custom-command")],
			}),
		});

		expect(await run.exit).toBe(1);
		expect(run.stderr.join("")).toContain("expected /custom:command");
	});

	test("reports orphan, dangling, and AGENTS/CLAUDE pairing failures", async () => {
		const run = runScenario(["check"], {
			projectInspection: project({
				lockfile: { version: 1, skills: { ghost: remoteEntry() } },
				skillsDirectoryNames: ["orphan-local"],
				agentsSkillNames: ["orphan-remote"],
				skills: [],
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
