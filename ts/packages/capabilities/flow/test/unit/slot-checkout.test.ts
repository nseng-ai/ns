import type { ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, it } from "vitest";

import {
	buildSlotCheckoutArgs,
	checkoutSlot,
	createAutoslotDirectiveWriter,
	parseSlotCheckoutResult,
	type AutoslotDirectiveFilesystem,
} from "../../src/autoslot/slot-checkout.ts";

const target = {
	slotName: "slot-02",
	branchName: "feature/demo",
	worktreePath: "/slots/repo/slot-02",
};

class FakeDirectiveFilesystem implements AutoslotDirectiveFilesystem {
	readonly writes: Array<{ path: string; content: string }> = [];
	private readonly error: Error | undefined;

	constructor(error?: Error) {
		this.error = error;
	}

	async writeText(path: string, content: string): Promise<void> {
		if (this.error !== undefined) throw this.error;
		this.writes.push({ path, content });
	}
}

describe("Flow slot checkout", () => {
	it("builds current and named-branch commands with child side effects disabled", () => {
		expect(buildSlotCheckoutArgs({ kind: "current" })).toEqual([
			"slot",
			"checkout",
			"--current",
			"--no-clipboard",
			"--no-cd-directive",
			"--format",
			"json",
		]);
		expect(buildSlotCheckoutArgs({ kind: "branch", branchName: "feature/demo" })).toEqual([
			"slot",
			"checkout",
			"feature/demo",
			"--no-clipboard",
			"--no-cd-directive",
			"--format",
			"json",
		]);
	});

	it("executes both checkout modes and applies navigation after validated success", async () => {
		const calls: Array<{ command: string; args: string[]; timeoutMs: number }> = [];
		const exec = async (command: string, args: string[], timeoutMs: number) => {
			calls.push({ command, args, timeoutMs });
			return exited({ status: "ok", exitCode: 0, data: target });
		};
		const filesystem = new FakeDirectiveFilesystem();
		const directiveWriter = createAutoslotDirectiveWriter({
			env: { SLOT_CD_DIRECTIVE_FILE: "/tmp/slot-cd" },
			filesystem,
		});

		await expect(checkoutSlot(exec, directiveWriter, { kind: "current" })).resolves.toEqual({
			ok: true,
			target,
			warnings: [],
		});
		await expect(
			checkoutSlot(exec, directiveWriter, { kind: "branch", branchName: "feature/demo" }),
		).resolves.toEqual({ ok: true, target, warnings: [] });
		expect(calls).toEqual([
			{ command: "ns", args: buildSlotCheckoutArgs({ kind: "current" }), timeoutMs: 120_000 },
			{
				command: "ns",
				args: buildSlotCheckoutArgs({ kind: "branch", branchName: "feature/demo" }),
				timeoutMs: 120_000,
			},
		]);
		expect(filesystem.writes).toEqual([
			{ path: "/tmp/slot-cd", content: target.worktreePath },
			{ path: "/tmp/slot-cd", content: target.worktreePath },
		]);
	});

	it("supports an in-memory command seam", async () => {
		const filesystem = new FakeDirectiveFilesystem();
		const directiveWriter = createAutoslotDirectiveWriter({
			env: { SLOT_CD_DIRECTIVE_FILE: "/tmp/slot-cd" },
			filesystem,
		});

		await expect(
			checkoutSlot(
				async () => exited({ status: "ok", exitCode: 0, data: target }),
				directiveWriter,
				{ kind: "current" },
			),
		).resolves.toEqual({ ok: true, target, warnings: [] });
		expect(filesystem.writes).toEqual([{ path: "/tmp/slot-cd", content: target.worktreePath }]);
	});

	it("preserves a valid Slots domain failure and does not navigate", async () => {
		const filesystem = new FakeDirectiveFilesystem();
		const exec = async () =>
			exited(
				{
					status: "failure",
					exitCode: 2,
					errorType: "branch-in-use",
					message: "Branch is checked out elsewhere.",
				},
				2,
			);
		const directiveWriter = createAutoslotDirectiveWriter({
			env: { NS_CD_DIRECTIVE_FILE: "/tmp/ns-cd" },
			filesystem,
		});

		await expect(checkoutSlot(exec, directiveWriter, { kind: "current" })).resolves.toEqual({
			ok: false,
			failure: { errorType: "branch-in-use", message: "Branch is checked out elsewhere." },
		});
		expect(filesystem.writes).toEqual([]);
	});

	it.each([
		[
			"spawn failure",
			{ type: "spawn-failed", stdout: "", stderr: "", error: "ENOENT" } satisfies ExecResult,
			"slot-checkout-spawn-failed",
		],
		[
			"cancellation",
			{
				type: "cancelled",
				stdout: "",
				stderr: "",
				code: null,
				signal: "SIGTERM",
			} satisfies ExecResult,
			"slot-checkout-cancelled",
		],
		[
			"timeout",
			{
				type: "timed-out",
				stdout: "",
				stderr: "",
				code: null,
				signal: "SIGKILL",
			} satisfies ExecResult,
			"slot-checkout-timed-out",
		],
	] as const)("classifies %s", (_name, result, errorType) => {
		expect(parseSlotCheckoutResult(result)).toMatchObject({ ok: false, failure: { errorType } });
	});

	it.each([
		["failed process without an envelope", exitedText("", 2), "slot-checkout-process-failed"],
		["invalid JSON", exitedText("not-json"), "slot-checkout-invalid-json"],
		[
			"invalid envelope",
			exited({ status: "ok", exitCode: 0, data: { slotName: "slot-01" } }),
			"slot-checkout-invalid-envelope",
		],
		[
			"process/envelope mismatch",
			exited({ status: "ok", exitCode: 0, data: target }, 2),
			"slot-checkout-status-mismatch",
		],
		[
			"negative envelope",
			exited({ status: "negative", exitCode: 1, message: "declined" }, 1),
			"slot-checkout-unexpected-envelope",
		],
		[
			"usage envelope",
			exited(
				{ status: "usageError", exitCode: 2, errorType: "usageError", message: "bad args" },
				2,
			),
			"slot-checkout-unexpected-envelope",
		],
	] as const)("classifies %s as a protocol failure", (_name, result, errorType) => {
		expect(parseSlotCheckoutResult(result)).toMatchObject({ ok: false, failure: { errorType } });
	});

	it("keeps checkout successful and warns when directive writing fails", async () => {
		const exec = async () => exited({ status: "ok", exitCode: 0, data: target });
		const directiveWriter = createAutoslotDirectiveWriter({
			env: { SLOT_CD_DIRECTIVE_FILE: "/tmp/slot-cd", NS_CD_DIRECTIVE_FILE: "/tmp/ns-cd" },
			filesystem: new FakeDirectiveFilesystem(new Error("permission denied")),
		});

		await expect(checkoutSlot(exec, directiveWriter, { kind: "current" })).resolves.toMatchObject({
			ok: true,
			target,
			warnings: [
				{
					type: "cd-directive-write-failed",
					message: expect.stringContaining("/tmp/slot-cd: permission denied"),
				},
			],
		});
	});

	it.each([{}, { SLOT_CD_DIRECTIVE_FILE: "", NS_CD_DIRECTIVE_FILE: "" }])(
		"treats missing or empty directive paths as inactive",
		async (env) => {
			const filesystem = new FakeDirectiveFilesystem();
			const writer = createAutoslotDirectiveWriter({ env, filesystem });
			await expect(writer.write(target.worktreePath)).resolves.toEqual({ status: "inactive" });
			expect(filesystem.writes).toEqual([]);
		},
	);
});

function exited(data: unknown, code = 0): ExecResult {
	return exitedText(JSON.stringify(data), code);
}

function exitedText(stdout: string, code = 0): ExecResult {
	return { type: "exited", stdout, stderr: "", code, signal: null };
}
