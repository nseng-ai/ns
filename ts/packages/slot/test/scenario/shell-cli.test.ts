import { describe, expect, it } from "vitest";

import { renderWrapperScript, SLOT_SHELL_MARKER_BEGIN, SLOT_SHELL_MARKER_END } from "../../src/operations/shell.ts";
import { FakeRcFilesystem } from "../support/fake-rc-filesystem.ts";
import { parseJsonOutput, runScenario } from "../support/run-scenario.ts";

const EXPECTED_WRAPPER = `slot() {
  local _slot_cd_directive_file
  local _slot_status
  local _slot_destination

  _slot_cd_directive_file="$(mktemp "\${TMPDIR:-/tmp}/slot-cd.XXXXXX")" || return 1
  SLOT_CD_DIRECTIVE_FILE="$_slot_cd_directive_file" command slot "$@"
  _slot_status=$?

  if [ $_slot_status -eq 0 ] && [ -s "$_slot_cd_directive_file" ]; then
    IFS= read -r _slot_destination < "$_slot_cd_directive_file"
    rm -f "$_slot_cd_directive_file"
    cd -- "$_slot_destination"
    return $?
  fi

  rm -f "$_slot_cd_directive_file"
  return $_slot_status
}`;

describe("slot shell CLI", () => {
	it("shows the parent-shell wrapper as human output", async () => {
		const run = runScenario(["shell", "show", "--shell", "zsh"], { env: { HOME: "/tmp/home", SHELL: "/bin/bash" } });
		expect(await run.exit).toBe(0);
		expect(run.stdout.join("")).toBe(`${EXPECTED_WRAPPER}\n`);
		expect(renderWrapperScript()).toBe(EXPECTED_WRAPPER);
	});

	it("shows JSON result for explicit bash", async () => {
		const run = runScenario(["shell", "show", "--shell", "bash", "--format", "json"], { env: { HOME: "/tmp/home", SHELL: "/bin/zsh" } });
		expect(await run.exit).toBe(0);
		expect(parseJsonOutput(run)).toMatchObject({ data: { shell: "bash", script: EXPECTED_WRAPPER } });
	});

	it("rejects unsupported explicit shells", async () => {
		const run = runScenario(["shell", "show", "--shell", "fish", "--format", "json"], { env: { HOME: "/tmp/home" } });
		expect(await run.exit).toBe(2);
		expect(parseJsonOutput(run)).toMatchObject({ error_type: "unsupported_shell" });
	});

	it("installs idempotently into redirected HOME rc files", async () => {
		const rc = new FakeRcFilesystem({ "/tmp/home/.zshrc": "export A=1" });
		const first = runScenario(["shell", "install", "--shell", "zsh", "--format", "json"], { env: { HOME: "/tmp/home" }, rc });
		expect(await first.exit).toBe(0);
		expect(parseJsonOutput(first)).toMatchObject({ data: { shell: "zsh", rc_path: "/tmp/home/.zshrc", already_installed: false } });
		expect(rc.mkdirs()).toEqual(["/tmp/home"]);
		expect(rc.readFile("/tmp/home/.zshrc")).toBe(`export A=1\n\n${SLOT_SHELL_MARKER_BEGIN}\n${EXPECTED_WRAPPER}\n${SLOT_SHELL_MARKER_END}\n`);

		const second = runScenario(["shell", "install", "--shell", "zsh", "--format", "json"], { env: { HOME: "/tmp/home" }, rc });
		expect(await second.exit).toBe(0);
		expect(parseJsonOutput(second)).toMatchObject({ data: { already_installed: true } });
		expect(rc.writes()).toHaveLength(1);
	});
});
