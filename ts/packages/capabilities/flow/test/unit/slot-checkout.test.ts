import type { ExecResult } from "@nseng-ai/foundation/command";
import { describe, expect, it } from "vitest";

import {
	buildSlotCheckoutArgs,
	checkoutSlot,
	parseSlotCheckoutResult,
} from "../../src/autoslot/slot-checkout.ts";

const target = {
	slotName: "slot-02",
	branchName: "feature/demo",
	worktreePath: "/slots/repo/slot-02",
};

const checkoutData = {
	...target,
	cdDirectiveStatus: "written" as const,
	cdDirectivePath: "/tmp/slot-cd",
	cdDirectiveFailureDetail: null,
};

describe("Flow slot checkout", () => {
	it("builds current and named-branch commands with clipboard copying disabled", () => {
		expect(buildSlotCheckoutArgs({ kind: "current" })).toEqual([
			"slot",
			"checkout",
			"--current",
			"--no-clipboard",
			"--format",
			"json",
		]);
		expect(buildSlotCheckoutArgs({ kind: "branch", branchName: "feature/demo" })).toEqual([
			"slot",
			"checkout",
			"feature/demo",
			"--no-clipboard",
			"--format",
			"json",
		]);
	});

	it("executes both checkout modes through the injected command seam", async () => {
		const calls: Array<{ command: string; args: string[]; timeoutMs: number }> = [];
		const exec = async (command: string, args: string[], timeoutMs: number) => {
			calls.push({ command, args, timeoutMs });
			return exited({ status: "ok", exitCode: 0, data: checkoutData });
		};

		await expect(checkoutSlot(exec, { kind: "current" })).resolves.toEqual({
			ok: true,
			target,
			warnings: [],
		});
		await expect(
			checkoutSlot(exec, { kind: "branch", branchName: "feature/demo" }),
		).resolves.toEqual({ ok: true, target, warnings: [] });
		expect(calls).toEqual([
			{ command: "ns", args: buildSlotCheckoutArgs({ kind: "current" }), timeoutMs: 120_000 },
			{
				command: "ns",
				args: buildSlotCheckoutArgs({ kind: "branch", branchName: "feature/demo" }),
				timeoutMs: 120_000,
			},
		]);
	});

	it.each([
		["written", checkoutData],
		[
			"inactive",
			{
				...checkoutData,
				cdDirectiveStatus: "inactive",
				cdDirectivePath: null,
			},
		],
	] as const)("keeps checkout successful when directive status is %s", async (_status, data) => {
		await expect(
			checkoutSlot(async () => exited({ status: "ok", exitCode: 0, data }), { kind: "current" }),
		).resolves.toEqual({ ok: true, target, warnings: [] });
	});

	it("preserves a valid Slots domain failure", async () => {
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

		await expect(checkoutSlot(exec, { kind: "current" })).resolves.toEqual({
			ok: false,
			failure: { errorType: "branch-in-use", message: "Branch is checked out elsewhere." },
		});
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
			"missing directive evidence",
			exited({
				status: "ok",
				exitCode: 0,
				data: { ...checkoutData, cdDirectiveStatus: undefined },
			}),
			"slot-checkout-invalid-envelope",
		],
		[
			"process/envelope mismatch",
			exited({ status: "ok", exitCode: 0, data: checkoutData }, 2),
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

	it("keeps checkout successful and warns when Slots reports directive writing failed", async () => {
		const failedData = {
			...checkoutData,
			cdDirectiveStatus: "failed" as const,
			cdDirectiveFailureDetail: "permission denied",
		};

		await expect(
			checkoutSlot(async () => exited({ status: "ok", exitCode: 0, data: failedData }), {
				kind: "current",
			}),
		).resolves.toEqual({
			ok: true,
			target,
			warnings: [
				{
					type: "cd-directive-write-failed",
					message:
						"Slot checkout succeeded, but the parent-shell navigation directive could not be written to /tmp/slot-cd: permission denied",
				},
			],
		});
	});
});

function exited(data: unknown, code = 0): ExecResult {
	return exitedText(JSON.stringify(data), code);
}

function exitedText(stdout: string, code = 0): ExecResult {
	return { type: "exited", stdout, stderr: "", code, signal: null };
}
