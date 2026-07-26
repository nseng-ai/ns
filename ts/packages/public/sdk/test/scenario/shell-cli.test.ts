import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "@nseng-ai/sdk/cli";
import { createRealNsCommandContext } from "@nseng-ai/sdk/context";

import { nsShellIntegrationBeginMarker, nsShellIntegrationEndMarker } from "../../src/cli/shell.ts";

const tempHomes: string[] = [];

afterEach(async () => {
	await Promise.all(tempHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("ns shell CLI", () => {
	it("shows the zsh parent-shell wrapper", async () => {
		const run = runScenario(["shell", "show", "--shell", "zsh"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("NS_CD_DIRECTIVE_FILE");
		expect(output).toContain('command ns "$@"');
		expect(output).toContain('IFS= read -r _ns_destination < "$_ns_cd_directive_file" || true');
		expect(output).toContain('cd -- "$_ns_destination"');
		expect(output).toContain('rm -f "$_ns_cd_directive_file"');
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
		expect(rc).toMatch(/^existing\n\n# >>> ns shell integration >>>/);
		expect(rc).toContain("NS_CD_DIRECTIVE_FILE");
		expect(rc).toContain(nsShellIntegrationEndMarker);
		expect(countOccurrences(rc, nsShellIntegrationBeginMarker)).toBe(1);
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
	const cwd = process.cwd();
	const env = { ...process.env, ...(options.env ?? {}) };
	const context = createRealNsCommandContext({
		cwd,
		env,
		textGenerator: { generateText: async () => ({ ok: false, error: "not used" }) },
	});
	return {
		exit: runCli(args, {
			context,
			cwd,
			env,
			stdout: (text) => stdout.push(text),
			stderr: (text) => stderr.push(text),
		}),
		stdout,
		stderr,
	};
}

async function makeHome(): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "ns-shell-home-"));
	tempHomes.push(home);
	return home;
}

function countOccurrences(value: string, needle: string): number {
	return value.split(needle).length - 1;
}
