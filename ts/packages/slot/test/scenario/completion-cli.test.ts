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

describe("slot completion CLI", () => {
	it("shows zsh static completion script", async () => {
		const run = runScenario(["completion", "show", "--shell", "zsh"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("#compdef slot");
		expect(output).toContain("compdef _slot_completion slot");
		expect(output).toContain("shell:Show or install parent-shell integration");
		expect(output).not.toContain("_SLOT_COMPLETE");
	});

	it("shows bash static completion script", async () => {
		const run = runScenario(["completion", "show", "--shell", "bash"]);
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("complete -F _slot_completion slot");
		expect(output).toContain("commands=\"list ls checkout co goto claim free gc init resize shell completion gt\"");
		expect(output).not.toContain("_SLOT_COMPLETE");
	});

	it("rejects unsupported explicit shells", async () => {
		const run = runScenario(["completion", "show", "--shell", "fish", "--format", "json"]);
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "unsupported_shell", message: "Shell 'fish' is not supported. Supported shells: zsh, bash." });
	});

	it("installs zsh completion into redirected HOME", async () => {
		const home = await makeHome();
		const run = runScenario(["completion", "install", "--shell", "zsh", "--format", "json"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { shell: "zsh", rc_path: join(home, ".zshrc"), is_already_installed: false } });
		const rc = await readFile(join(home, ".zshrc"), "utf8");
		expect(rc).toContain(completionBeginMarker);
		expect(rc).toContain("compdef _slot_completion slot");
		expect(rc).toContain(completionEndMarker);
	});

	it("installs bash completion into redirected HOME", async () => {
		const home = await makeHome();
		const run = runScenario(["completion", "install", "--shell", "bash", "--format", "json"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { shell: "bash", rc_path: join(home, ".bashrc"), is_already_installed: false } });
		await expect(readFile(join(home, ".bashrc"), "utf8")).resolves.toContain("complete -F _slot_completion slot");
	});

	it("is idempotent and does not duplicate the completion marker", async () => {
		const home = await makeHome();
		const first = runScenario(["completion", "install", "--shell", "zsh", "--format", "json"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await first.exit).toBe(0);
		const second = runScenario(["completion", "install", "--shell", "zsh", "--format", "json"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await second.exit).toBe(0);
		expect(parseJsonOutput(second)).toMatchObject({ data: { is_already_installed: true } });
		const rc = await readFile(join(home, ".zshrc"), "utf8");
		expect(countOccurrences(rc, completionBeginMarker)).toBe(1);
	});

	it("does not disturb an existing shell integration block", async () => {
		const home = await makeHome();
		await writeFile(join(home, ".zshrc"), `${shellIntegrationBeginMarker}\nslot wrapper\n${shellIntegrationEndMarker}\n`, "utf8");
		const run = runScenario(["completion", "install", "--shell", "zsh"], { env: { PATH: "/fake/bin", HOME: home } });
		expect(await run.exit).toBe(0);
		const rc = await readFile(join(home, ".zshrc"), "utf8");
		expect(rc).toContain(shellIntegrationBeginMarker);
		expect(rc).toContain(completionBeginMarker);
	});

	it("shell and completion marker blocks coexist in either order", async () => {
		const firstHome = await makeHome();
		const shellFirst = runScenario(["shell", "install", "--shell", "zsh"], { env: { PATH: "/fake/bin", HOME: firstHome } });
		expect(await shellFirst.exit).toBe(0);
		const completionSecond = runScenario(["completion", "install", "--shell", "zsh"], { env: { PATH: "/fake/bin", HOME: firstHome } });
		expect(await completionSecond.exit).toBe(0);
		const shellFirstRc = await readFile(join(firstHome, ".zshrc"), "utf8");
		expect(shellFirstRc.indexOf(shellIntegrationBeginMarker)).toBeLessThan(shellFirstRc.indexOf(completionBeginMarker));

		const secondHome = await makeHome();
		const completionFirst = runScenario(["completion", "install", "--shell", "zsh"], { env: { PATH: "/fake/bin", HOME: secondHome } });
		expect(await completionFirst.exit).toBe(0);
		const shellSecond = runScenario(["shell", "install", "--shell", "zsh"], { env: { PATH: "/fake/bin", HOME: secondHome } });
		expect(await shellSecond.exit).toBe(0);
		const completionFirstRc = await readFile(join(secondHome, ".zshrc"), "utf8");
		expect(completionFirstRc.indexOf(completionBeginMarker)).toBeLessThan(completionFirstRc.indexOf(shellIntegrationBeginMarker));
	});
});

async function makeHome(): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "slot-completion-home-"));
	tempHomes.push(home);
	return home;
}

function countOccurrences(value: string, needle: string): number {
	return value.split(needle).length - 1;
}
