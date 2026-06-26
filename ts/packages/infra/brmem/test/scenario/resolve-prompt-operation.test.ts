import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

const repoRoot = "/workspace/repo";
const homeRoot = "/home/tester";

function projectPrompt(name: string): string {
	return join(repoRoot, ".sdl", "prompts", `${name}.md`);
}

function xdgGlobalPrompt(name: string): string {
	return join(homeRoot, ".config", "sdl", "brmem", "prompts", `${name}.md`);
}

function legacyProjectPrompt(name: string): string {
	return join(repoRoot, ".brmem", "prompts", `${name}.md`);
}

function legacyGlobalPrompt(name: string): string {
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
			status: "ok",
			exitCode: 0,
			data: { path: projectPrompt("foo"), tier: "project" },
		});
	});

	it("falls back to XDG global prompt", async () => {
		const run = runScenario(["exec", "resolve-prompt", "foo", "--format", "json"], {
			repoRoot,
			homeRoot,
			promptFiles: [xdgGlobalPrompt("foo")],
		});

		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toEqual({
			status: "ok",
			exitCode: 0,
			data: { path: xdgGlobalPrompt("foo"), tier: "global" },
		});
	});

	it("does not resolve legacy project or global prompt paths", async () => {
		const run = runScenario(["exec", "resolve-prompt", "foo", "--format", "json"], {
			repoRoot,
			homeRoot,
			promptFiles: [legacyProjectPrompt("foo"), legacyGlobalPrompt("foo")],
		});

		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "prompt-not-found",
		});
	});

	it("prefers project prompt over global prompt", async () => {
		const run = runScenario(["exec", "resolve-prompt", "foo", "--format", "json"], {
			repoRoot,
			homeRoot,
			promptFiles: [projectPrompt("foo"), xdgGlobalPrompt("foo")],
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
			exitCode: number;
			errorType: string;
			message: string;
		};
		expect(payload.exitCode).toBe(2);
		expect(payload.errorType).toBe("prompt-not-found");
		expect(payload.message).toContain(projectPrompt("foo"));
		expect(payload.message).toContain(xdgGlobalPrompt("foo"));
		expect(payload.message).not.toContain(legacyProjectPrompt("foo"));
		expect(payload.message).not.toContain(legacyGlobalPrompt("foo"));
		expect(payload.message).toContain("just install-tools");
	});

	it("requires a git repo before considering global fallback", async () => {
		const run = runScenario(["exec", "resolve-prompt", "foo", "--format", "json"], {
			repoRoot,
			homeRoot,
			isInGitRepo: false,
			promptFiles: [xdgGlobalPrompt("foo")],
		});

		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({
			status: "failure",
			exitCode: 2,
			errorType: "not-a-git-repo",
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
