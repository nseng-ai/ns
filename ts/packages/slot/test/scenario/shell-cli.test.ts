import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { completionBeginMarker, completionEndMarker } from "../../src/operations/completion.ts";
import { shellIntegrationBeginMarker, shellIntegrationEndMarker } from "../../src/operations/shell.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

const tempHomes: string[] = [];

afterEach(async () => {
	await Promise.all(tempHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("slot shell CLI", () => {
	it("shows the zsh parent-shell wrapper", async () => {
		const run = runScenario(["shell", "show", "--shell", "zsh"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("SLOT_CD_DIRECTIVE_FILE");
		expect(output).toContain("command slot \"$@\"");
		expect(output).toContain("cd -- \"$_slot_destination\"");
		expect(output).toContain("rm -f \"$_slot_cd_directive_file\"");
	});

	it("shows the same wrapper for bash", async () => {
		const zsh = runScenario(["shell", "show", "--shell", "zsh"]);
		const bash = runScenario(["shell", "show", "--shell", "bash"]);
		expect(await zsh.exit).toBe(0);
		expect(await bash.exit).toBe(0);
		expect(bash.stdout.join("")).toBe(zsh.stdout.join(""));
	});

	it("rejects unsupported explicit shells", async () => {
		const run = runScenario(["shell", "show", "--shell", "fish", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "unsupported_shell", message: "Shell 'fish' is not supported. Supported shells: zsh, bash." });
	});

	it("installs the zsh marker block into redirected HOME", async () => {
		const home = await makeHome();
		const run = runScenario(["shell", "install", "--shell", "zsh", "--format", "json"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { shell: "zsh", rc_path: join(home, ".zshrc"), is_already_installed: false } });
		const rc = await readFile(join(home, ".zshrc"), "utf8");
		expect(rc).toContain(shellIntegrationBeginMarker);
		expect(rc).toContain("SLOT_CD_DIRECTIVE_FILE");
		expect(rc).toContain(shellIntegrationEndMarker);
	});

	it("installs the bash marker block into redirected HOME", async () => {
		const home = await makeHome();
		const run = runScenario(["shell", "install", "--shell", "bash", "--format", "json"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { shell: "bash", rc_path: join(home, ".bashrc"), is_already_installed: false } });
		await expect(readFile(join(home, ".bashrc"), "utf8")).resolves.toContain(shellIntegrationBeginMarker);
	});

	it("is idempotent and does not duplicate the shell marker", async () => {
		const home = await makeHome();
		const first = runScenario(["shell", "install", "--shell", "zsh", "--format", "json"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await first.exit).toBe(0);
		const second = runScenario(["shell", "install", "--shell", "zsh", "--format", "json"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await second.exit).toBe(0);
		expect(parseJsonOutput(second)).toMatchObject({ data: { is_already_installed: true } });
		const rc = await readFile(join(home, ".zshrc"), "utf8");
		expect(countOccurrences(rc, shellIntegrationBeginMarker)).toBe(1);
	});

	it("adds a separating newline when existing rc content has no trailing newline", async () => {
		const home = await makeHome();
		await writeFile(join(home, ".zshrc"), "existing", "utf8");
		const run = runScenario(["shell", "install", "--shell", "zsh"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await run.exit).toBe(0);
		await expect(readFile(join(home, ".zshrc"), "utf8")).resolves.toMatch(/^existing\n\n# >>> slot shell integration >>>/);
	});

	it("does not disturb an existing completion block", async () => {
		const home = await makeHome();
		await writeFile(join(home, ".zshrc"), `${completionBeginMarker}\ncomplete me\n${completionEndMarker}\n`, "utf8");
		const run = runScenario(["shell", "install", "--shell", "zsh"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await run.exit).toBe(0);
		const rc = await readFile(join(home, ".zshrc"), "utf8");
		expect(rc).toContain(completionBeginMarker);
		expect(rc).toContain(shellIntegrationBeginMarker);
	});
});

async function makeHome(): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "slot-shell-home-"));
	tempHomes.push(home);
	return home;
}

function countOccurrences(value: string, needle: string): number {
	return value.split(needle).length - 1;
}
