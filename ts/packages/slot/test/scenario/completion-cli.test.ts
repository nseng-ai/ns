import { describe, expect, it } from "vitest";

import { SLOT_COMPLETION_MARKER_BEGIN, SLOT_COMPLETION_MARKER_END } from "../../src/operations/completion.ts";
import { SLOT_SHELL_MARKER_BEGIN } from "../../src/operations/shell.ts";
import { FakeRcFilesystem } from "../support/fake-rc-filesystem.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";


describe("slot completion CLI", () => {
	it("shows a Clinkr-backed zsh completion script", async () => {
		const run = runScenario(["completion", "show", "--shell", "zsh"], { env: { HOME: "/tmp/home" } });
		expect(await run.exit).toBe(0);
		const output = run.stdout.join("");
		expect(output).toContain("#compdef slot");
		expect(output).toContain("compdef _slot_completion slot");
		expect(output).toContain("shell");
		expect(output).toContain("completion");
		expect(output).not.toContain("_SLOT_COMPLETE");
	});

	it("shows a Clinkr-backed bash completion script as JSON", async () => {
		const run = runScenario(["completion", "show", "--shell", "bash", "--format", "json"], { env: { HOME: "/tmp/home" } });
		expect(await run.exit).toBe(0);
		const envelope = parseJsonOutput(run) as { data: { shell: string; script: string } };
		expect(envelope.data.shell).toBe("bash");
		expect(envelope.data.script).toContain("complete -F _slot_completion slot");
		expect(envelope.data.script).toContain("checkout co goto claim free gc init resize shell completion");
	});

	it("installs completion with distinct markers that coexist with shell integration", async () => {
		const existing = `\n${SLOT_SHELL_MARKER_BEGIN}\nwrapper\n# <<< slot shell integration <<<\n`;
		const rc = new FakeRcFilesystem({ "/tmp/home/.bashrc": existing });
		const first = runScenario(["completion", "install", "--shell", "bash", "--format", "json"], { env: { HOME: "/tmp/home" }, rc });
		expect(await first.exit).toBe(0);
		expect(parseJsonOutput(first)).toMatchObject({ data: { shell: "bash", rc_path: "/tmp/home/.bashrc", already_installed: false } });
		const text = rc.readFile("/tmp/home/.bashrc") ?? "";
		expect(text).toContain(SLOT_SHELL_MARKER_BEGIN);
		expect(text).toContain(SLOT_COMPLETION_MARKER_BEGIN);
		expect(text).toContain(SLOT_COMPLETION_MARKER_END);
		expect(text).toContain("complete -F _slot_completion slot");

		const second = runScenario(["completion", "install", "--shell", "bash", "--format", "json"], { env: { HOME: "/tmp/home" }, rc });
		expect(await second.exit).toBe(0);
		expect(parseJsonOutput(second)).toMatchObject({ data: { already_installed: true } });
		expect(rc.writes()).toHaveLength(1);
	});
});
