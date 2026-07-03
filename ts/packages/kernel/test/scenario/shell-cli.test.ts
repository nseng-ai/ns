import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "@sdl/kernel/cli";

import {
	sdlShellIntegrationBeginMarker,
	sdlShellIntegrationEndMarker,
} from "../../src/cli/shell.ts";

const tempHomes: string[] = [];

afterEach(async () => {
	await Promise.all(tempHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("sdl shell CLI", () => {
	it("shows the zsh parent-shell wrapper", async () => {
		const run = runScenario(["shell", "show", "--shell", "zsh"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("JI_CD_DIRECTIVE_FILE");
		expect(output).toContain('command ji "$@"');
		expect(output).toContain('IFS= read -r _ji_destination < "$_ji_cd_directive_file" || true');
		expect(output).toContain('cd -- "$_ji_destination"');
		expect(output).toContain('rm -f "$_ji_cd_directive_file"');
	});

	it("installs idempotently without disturbing unrelated rc content", async () => {
		const home = await makeHome();
		await writeFile(join(home, ".zshrc"), "existing", "utf8");
		const first = runScenario(["shell", "install", "--shell", "zsh", "--yes", "--format", "json"], {
			env: { HOME: home, PATH: "/fake/bin" },
		});
		expect(await first.exit).toBe(0);
		const second = runScenario(
			["shell", "install", "--shell", "zsh", "--yes", "--format", "json"],
			{
				env: { HOME: home, PATH: "/fake/bin" },
			},
		);
		expect(await second.exit).toBe(0);
		const rc = await readFile(join(home, ".zshrc"), "utf8");
		expect(rc).toMatch(/^existing\n\n# >>> ji shell integration >>>/);
		expect(rc).toContain("JI_CD_DIRECTIVE_FILE");
		expect(rc).toContain(sdlShellIntegrationEndMarker);
		expect(countOccurrences(rc, sdlShellIntegrationBeginMarker)).toBe(1);
		expect(second.stdout.join("")).toContain('"isAlreadyInstalled": true');
	});

	it("requires --yes before non-interactive install", async () => {
		const home = await makeHome();
		await writeFile(join(home, ".zshrc"), "existing", "utf8");
		const run = runScenario(["shell", "install", "--shell", "zsh", "--format", "json"], {
			env: { HOME: home, PATH: "/fake/bin" },
		});
		expect(await run.exit).toBe(2);
		expect(JSON.parse(run.stdout.join(""))).toMatchObject({
			status: "usageError",
			data: { missingFlag: "--yes" },
		});
		expect(await readFile(join(home, ".zshrc"), "utf8")).toBe("existing");
	});
});

function runScenario(
	args: readonly string[],
	options: { env?: Record<string, string | undefined> } = {},
): { exit: Promise<number>; stdout: string[]; stderr: string[] } {
	const stdout: string[] = [];
	const stderr: string[] = [];
	return {
		exit: runCli(args, {
			cwd: process.cwd(),
			env: { ...process.env, ...(options.env ?? {}) },
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}

async function makeHome(): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "ji-shell-home-"));
	tempHomes.push(home);
	return home;
}

function countOccurrences(value: string, needle: string): number {
	return value.split(needle).length - 1;
}
