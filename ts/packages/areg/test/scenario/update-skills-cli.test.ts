import { InMemoryGitGateway } from "@asdl/core/git/testing";
import { describe, expect, test } from "vitest";

import type { AregCliContext } from "../../src/context.ts";
import {
	FakeAregGithubGateway,
	FakeAregHostGateway,
	FakeAregNpxSkillsGateway,
	FakeAregProjectGateway,
	type FakeAregProjectGatewayOptions,
	FakeAregPromptGateway,
	FakeAregSkillxWorkspaceGateway,
} from "../../src/fake-gateways.ts";
import type { AregErrorInfo } from "../../src/gateways.ts";
import { runScenario } from "../support/run-scenario.ts";

const HASH = "a".repeat(64);

interface UpdateHarnessOptions {
	project?: FakeAregProjectGatewayOptions | undefined;
	npxFailures?: Readonly<Record<string, AregErrorInfo>> | undefined;
	npxFailure?: AregErrorInfo | undefined;
	npxMissing?: boolean | undefined;
}

interface UpdateRun {
	exit: Promise<number>;
	stdout: string[];
	stderr: string[];
	host: FakeAregHostGateway;
	npxSkills: FakeAregNpxSkillsGateway;
	projectGateway: FakeAregProjectGateway;
}

function runUpdate(args: readonly string[], options: UpdateHarnessOptions = {}): UpdateRun {
	const host = new FakeAregHostGateway({ tools: { npx: options.npxMissing === true ? null : "/fake/bin/npx" } });
	const npxSkills = new FakeAregNpxSkillsGateway({ failure: options.npxFailure, failures: options.npxFailures });
	const defaultUpdateProject = { lockfile: lockfile({ beta: github("other/repo"), alpha: github("owner/repo") }) };
	const projectGateway = new FakeAregProjectGateway({ ...defaultUpdateProject, ...options.project });
	const context: AregCliContext = {
		host,
		github: new FakeAregGithubGateway(),
		skillxWorkspace: new FakeAregSkillxWorkspaceGateway(),
		project: projectGateway,
		git: new InMemoryGitGateway(),
		npxSkills,
		prompt: new FakeAregPromptGateway(),
		cwd: "/repo",
		env: { PATH: "/fake/bin" },
	};
	const run = runScenario(["update-skills", ...args], { context });
	return { ...run, host, npxSkills, projectGateway };
}

function lockfile(skills: Record<string, object>): object {
	return { version: 1, skills };
}

function github(source = "owner/repo"): object {
	return { source, sourceType: "github", computedHash: HASH };
}

function local(name: string): object {
	return { source: `skills/${name}`, sourceType: "local", computedHash: HASH };
}

describe("areg update-skills CLI", () => {
	test("updates GitHub-sourced skills one at a time in sorted skill order", async () => {
		const run = runUpdate([], { project: { projectDir: "/repo/project", lockfile: lockfile({ zeta: github("owner/z"), local: local("local"), alpha: github("owner/a") }) } });

		expect(await run.exit).toBe(0);
		expect(run.stderr.join("")).toBe("");
		expect(run.stdout.join("")).toContain("Updated 2 skill(s).");
		expect(run.npxSkills.operations()).toEqual([
			{ type: "add-skills", sourceRepo: "owner/a", skillNames: ["alpha"], targetAgents: ["codex", "claude-code"], cwd: "/repo/project" },
			{ type: "add-skills", sourceRepo: "owner/z", skillNames: ["zeta"], targetAgents: ["codex", "claude-code"], cwd: "/repo/project" },
		]);
	});

	test("filters by skill and source", async () => {
		const bySkill = runUpdate(["--skill", "beta", "--skill", "alpha"]);
		expect(await bySkill.exit).toBe(0);
		expect(bySkill.npxSkills.operations().map((operation) => operation.skillNames[0])).toEqual(["alpha", "beta"]);

		const bySource = runUpdate(["--source", "owner/repo"]);
		expect(await bySource.exit).toBe(0);
		expect(bySource.npxSkills.operations()).toEqual([{ type: "add-skills", sourceRepo: "owner/repo", skillNames: ["alpha"], targetAgents: ["codex", "claude-code"], cwd: "/repo" }]);
	});

	test("unknown requested skills fail before npx preflight or update calls", async () => {
		const run = runUpdate(["--skill", "missing"]);

		expect(await run.exit).toBe(2);
		expect(run.stderr.join("")).toContain("Skill(s) not found in lockfile (or not github-sourced): missing");
		expect(run.host.operations()).toEqual([]);
		expect(run.npxSkills.operations()).toEqual([]);
	});

	test("no match succeeds without resolving invalid config or checking npx", async () => {
		const run = runUpdate([], { project: { lockfile: lockfile({ local: local("local") }), asdlToml: "[areg]\nagents = [1]\n" }, npxMissing: true });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe("No github-sourced skills match. Nothing to update.\n");
		expect(run.host.operations()).toEqual([]);
		expect(run.npxSkills.operations()).toEqual([]);
	});

	test("dry-run plans updates without checking host npx or calling npx skills", async () => {
		const run = runUpdate(["--dry-run"], { npxMissing: true });

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toContain("Updating 2 skill(s) with agents codex, claude-code [dry-run]:");
		expect(run.stdout.join("")).toContain("Planned: 2 skill(s). No changes made.");
		expect(run.host.operations()).toEqual([]);
		expect(run.npxSkills.operations()).toEqual([]);
	});

	test("resolves agents from config precedence and explicit overrides", async () => {
		const asdl = runUpdate([], { project: { asdlToml: '[areg]\nagents = ["cursor"]\n', aregJson: { agents: ["legacy"] } } });
		expect(await asdl.exit).toBe(0);
		expect(asdl.npxSkills.operations()[0]?.targetAgents).toEqual(["cursor"]);

		const legacy = runUpdate([], { project: { aregJson: { agents: ["legacy"] } } });
		expect(await legacy.exit).toBe(0);
		expect(legacy.npxSkills.operations()[0]?.targetAgents).toEqual(["legacy"]);

		const explicit = runUpdate(["--agent", "claude-code"], { project: { aregJson: "not json" } });
		expect(await explicit.exit).toBe(0);
		expect(explicit.npxSkills.operations()[0]?.targetAgents).toEqual(["claude-code"]);
	});

	test("selected updates fail on invalid config, missing lockfile, malformed lockfile, and missing npx before calls", async () => {
		const invalidConfig = runUpdate([], { project: { asdlToml: "[areg]\nagents = [1]\n" } });
		expect(await invalidConfig.exit).toBe(2);
		expect(invalidConfig.stderr.join("")).toContain("asdl.toml [areg].agents must be a non-empty string list");
		expect(invalidConfig.npxSkills.operations()).toEqual([]);

		const missingLockfile = runUpdate([], { project: { lockfile: { type: "missing" } } });
		expect(await missingLockfile.exit).toBe(2);
		expect(missingLockfile.stderr.join("")).toContain("skills-lock.json not found in /repo. Is this an areg project?");

		const malformed = runUpdate([], { project: { lockfile: "{" } });
		expect(await malformed.exit).toBe(2);
		expect(malformed.stderr.join("")).toContain("Invalid JSON in skills-lock.json:");

		const noNpx = runUpdate([], { npxMissing: true });
		expect(await noNpx.exit).toBe(2);
		expect(noNpx.stderr.join("")).toContain("Required host tool is missing: npx");
		expect(noNpx.npxSkills.operations()).toEqual([]);
	});

	test("partial failures attempt all selected skills and return structured JSON details", async () => {
		const run = runUpdate(["--format", "json"], { npxFailures: { "owner/repo:alpha": { code: "npx-failed", message: "alpha failed" } } });

		expect(await run.exit).toBe(2);
		expect(run.npxSkills.operations().map((operation) => operation.skillNames[0])).toEqual(["alpha", "beta"]);
		const body = JSON.parse(run.stdout.join(""));
		expect(body).toMatchObject({
			exit_code: 2,
			error_type: "skill_update_failed",
			message: expect.stringContaining("1 skill(s) failed to update: alpha"),
		});
	});

	test("success JSON returns the shared report shape", async () => {
		const run = runUpdate(["--dry-run", "--format", "json"]);

		expect(await run.exit).toBe(0);
		expect(JSON.parse(run.stdout.join(""))).toEqual({
			exit_code: 0,
			data: {
				ok: true,
				project_dir: "/repo",
				agents: ["codex", "claude-code"],
				dry_run: true,
				selected_updates: [
					{ skill: "alpha", source: "owner/repo" },
					{ skill: "beta", source: "other/repo" },
				],
				attempted_updates: [
					{ skill: "alpha", source: "owner/repo", status: "planned" },
					{ skill: "beta", source: "other/repo", status: "planned" },
				],
				failure_count: 0,
			},
		});
	});
});
