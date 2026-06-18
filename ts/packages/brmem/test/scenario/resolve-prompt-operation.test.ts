import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

const repoRoot = "/workspace/repo";
const homeRoot = "/home/tester";

function projectPrompt(name: string): string {
	return join(repoRoot, ".brmem", "prompts", `${name}.md`);
}

function globalPrompt(name: string): string {
	return join(homeRoot, ".brmem", "prompts", `${name}.md`);
}

describe("brmem exec resolve-prompt", () => {
	it("resolves project-local prompt in JSON mode", async () => {
		const run = runScenario(["exec", "resolve-prompt", "foo", "--format", "json"], {
			repoRoot,
			homeRoot,
			promptFiles: [projectPrompt("foo")],
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: { path: projectPrompt("foo"), tier: "project" },
		});
	});

	it("falls back to global prompt", async () => {
		const run = runScenario(["exec", "resolve-prompt", "foo", "--format", "json"], {
			repoRoot,
			homeRoot,
			promptFiles: [globalPrompt("foo")],
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			exit_code: 0,
			data: { path: globalPrompt("foo"), tier: "global" },
		});
	});

	it("prefers project prompt over global prompt", async () => {
		const run = runScenario(["exec", "resolve-prompt", "foo", "--format", "json"], {
			repoRoot,
			homeRoot,
			promptFiles: [projectPrompt("foo"), globalPrompt("foo")],
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({
			data: { path: projectPrompt("foo"), tier: "project" },
		});
	});

	it("returns prompt-not-found when neither tier has the prompt", async () => {
		const run = runScenario(["exec", "resolve-prompt", "foo", "--format", "json"], {
			repoRoot,
			homeRoot,
		});

		expect(await run.exit).toBe(2);
		const payload = parseJsonOutput(run) as {
			exit_code: number;
			error_type: string;
			message: string;
		};
		expect(payload.exit_code).toBe(2);
		expect(payload.error_type).toBe("prompt-not-found");
		expect(payload.message).toContain(projectPrompt("foo"));
		expect(payload.message).toContain(globalPrompt("foo"));
		expect(payload.message).toContain("just install-tools");
	});

	it("requires a git repo before considering global fallback", async () => {
		const run = runScenario(["exec", "resolve-prompt", "foo", "--format", "json"], {
			repoRoot,
			homeRoot,
			isInGitRepo: false,
			promptFiles: [globalPrompt("foo")],
		});

		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			exit_code: 2,
			error_type: "not-a-git-repo",
		});
		const payload = parseJsonOutput(run) as { message: string };
		expect(payload.message).toContain("Not inside a git repository");
	});

	it("prints the resolved path in human mode", async () => {
		const run = runScenario(["exec", "resolve-prompt", "foo"], {
			repoRoot,
			homeRoot,
			promptFiles: [projectPrompt("foo")],
		});

		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`${projectPrompt("foo")}\n`);
		// Current TypeScript Clinkr renderHuman has no stderr channel; JSON parity still exposes the tier.
		expect(run.stderr.join("")).toBe("");
	});
});
