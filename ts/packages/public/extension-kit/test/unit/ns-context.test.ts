import { describe, expect, test } from "vitest";

import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/sdk";
import type { ExecResult } from "@nseng-ai/foundation/exec";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import {
	createNsClinkrInteraction,
	createNsCwdEnvJsonInputContext,
} from "@nseng-ai/extension-kit/ns-context";

describe("ns context adapters", () => {
	test("maps ns confirm approval to confirmed", async () => {
		const prompts: Array<{ title: string; message: string; defaultAnswer: "yes" | "no" }> = [];
		const interaction = createNsClinkrInteraction(
			fakeApi({
				confirm: async (title, message, options) => {
					prompts.push({ title, message, defaultAnswer: options?.defaultAnswer ?? "no" });
					return { type: "confirmed" };
				},
			}),
			{ title: "Deploy", formatMessage: (request) => `Formatted: ${request.message}` },
		);

		expect(interaction.isInteractive()).toBe(true);
		await expect(
			interaction.confirm({ message: "Continue?", defaultAnswer: "yes" }),
		).resolves.toEqual({ type: "confirmed" });
		expect(prompts).toEqual([
			{ title: "Deploy", message: "Formatted: Continue?", defaultAnswer: "yes" },
		]);
	});

	test("maps ns confirm rejection to declined", async () => {
		const interaction = createNsClinkrInteraction(
			fakeApi({ confirm: async () => ({ type: "declined" }) }),
			{
				title: "Confirm",
			},
		);

		await expect(
			interaction.confirm({ message: "Continue?", defaultAnswer: "no" }),
		).resolves.toEqual({ type: "declined" });
	});

	test("maps ns confirmation cancellation to Clinkr abort", async () => {
		const interaction = createNsClinkrInteraction(
			fakeApi({ confirm: async () => ({ type: "cancelled" }) }),
			{ title: "Confirm" },
		);

		await expect(
			interaction.confirm({ message: "Continue?", defaultAnswer: "no" }),
		).resolves.toEqual({ type: "aborted" });
	});

	test("uses the request message when no formatter is supplied", async () => {
		let capturedMessage = "";
		const interaction = createNsClinkrInteraction(
			fakeApi({
				confirm: (_title, message) => {
					capturedMessage = message;
					return { type: "confirmed" };
				},
			}),
			{ title: "Confirm" },
		);

		await interaction.confirm({ message: "Use original", defaultAnswer: "yes" });

		expect(capturedMessage).toBe("Use original");
	});

	test("creates cwd/env/request context from ns host context", async () => {
		const env = { NS_TEST: "1" };
		const context = createNsCwdEnvJsonInputContext(
			fakeApi({ env, readJsonInput: async () => '{"request":true}' }),
		);

		expect(context.cwd).toBe("/repo");
		expect(context.env).toBe(env);
		await expect(context.readJsonInput()).resolves.toBe('{"request":true}');
	});

	test("rejects an ns host without a JSON input reader", () => {
		expect(() => createNsCwdEnvJsonInputContext(fakeApi())).toThrow(
			"ns JSON input context requires readJsonInput",
		);
	});
});

function fakeApi(overrides: Partial<NsExtensionApi> = {}): NsExtensionApi {
	return {
		cwd: "/repo",
		env: {},
		commandIo: noopNsCommandIo,
		progress: noopNsProgress,
		renderCapabilities: { canEmitAnsi: false },
		hasExtension: () => false,
		confirm: () => {
			throw new Error("Unexpected confirmation prompt in Extension Kit test.");
		},
		select: () => {
			throw new Error("Unexpected selection prompt in Extension Kit test.");
		},
		textGenerator: {
			async generateText() {
				return { ok: false, error: "unexpected model call" };
			},
		},
		async exec() {
			return makeExecResult();
		},
		...overrides,
	};
}

function makeExecResult(
	overrides: Partial<Extract<ExecResult, { type: "exited" }>> = {},
): ExecResult {
	return {
		stdout: "",
		stderr: "",
		code: 0,
		type: "exited",
		signal: null,
		...overrides,
	};
}
