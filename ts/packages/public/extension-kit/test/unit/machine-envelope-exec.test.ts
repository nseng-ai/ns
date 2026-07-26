import { runJsonExecCommand } from "@nseng-ai/extension-kit/machine-envelope-exec";
import type { CommandExecApi, ExecOptions, ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, test } from "vitest";

class FakeCommands implements CommandExecApi {
	readonly calls: Array<{ command: string; args: string[]; options?: ExecOptions }> = [];
	private readonly behavior: () => Promise<ExecResult>;

	constructor(behavior: () => Promise<ExecResult>) {
		this.behavior = behavior;
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.calls.push({ command, args: [...args], ...(options === undefined ? {} : { options }) });
		return this.behavior();
	}
}

function exited(stdout: string, code = 0, stderr = ""): ExecResult {
	return { type: "exited", stdout, stderr, code, signal: null };
}

function commandOptions(pi: CommandExecApi) {
	return {
		pi,
		cwd: "/repo",
		command: "ns",
		args: ["objective", "exec", "read-objective", "demo", "--format", "json"],
		timeoutMs: 30_000,
		summary: "Could not read Objective.",
		label: "objective read JSON",
	};
}

describe("runJsonExecCommand", () => {
	test("returns the parsed envelope data on success", async () => {
		const pi = new FakeCommands(async () =>
			exited(JSON.stringify({ exitCode: 0, data: { status: "ok", slug: "demo" } })),
		);

		const parsed = await runJsonExecCommand(commandOptions(pi));

		expect(parsed).toEqual({ type: "valid", data: { status: "ok", slug: "demo" } });
		expect(pi.calls[0]?.options).toEqual({ cwd: "/repo", timeout: 30_000 });
	});

	test("reports startup failures with the summary and command line", async () => {
		const pi = new FakeCommands(async () => {
			throw new Error("spawn ns ENOENT");
		});

		const parsed = await runJsonExecCommand(commandOptions(pi));

		expect(parsed.type).toBe("failed");
		if (parsed.type !== "failed") throw new Error("Expected a failure.");
		expect(parsed.message).toContain("Could not read Objective.");
		expect(parsed.message).toContain("Command: ns objective exec read-objective demo");
		expect(parsed.message).toContain("spawn ns ENOENT");
	});

	test("prefers the failed envelope message on non-zero exits with stdout", async () => {
		const failedEnvelope = JSON.stringify({
			exitCode: 3,
			error: { type: "not_found", message: "Objective demo not found." },
		});
		const pi = new FakeCommands(async () => exited(failedEnvelope, 3));

		const parsed = await runJsonExecCommand(commandOptions(pi));

		expect(parsed.type).toBe("failed");
		if (parsed.type !== "failed") throw new Error("Expected a failure.");
		expect(parsed.message).toContain("Could not read Objective.");
		expect(parsed.message).toContain("Objective demo not found.");
	});

	test("falls back to the exec failure for non-zero exits without stdout", async () => {
		const pi = new FakeCommands(async () => exited("", 1, "boom"));

		const parsed = await runJsonExecCommand(commandOptions(pi));

		expect(parsed.type).toBe("failed");
		if (parsed.type !== "failed") throw new Error("Expected a failure.");
		expect(parsed.message).toContain("Could not read Objective.");
		expect(parsed.message).toContain("boom");
	});

	test("rejects invalid envelopes on successful exits", async () => {
		const pi = new FakeCommands(async () => exited("not json"));

		const parsed = await runJsonExecCommand(commandOptions(pi));

		expect(parsed.type).toBe("failed");
		if (parsed.type !== "failed") throw new Error("Expected a failure.");
		expect(parsed.message).toContain("objective read JSON");
	});
});
