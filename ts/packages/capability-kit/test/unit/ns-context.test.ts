import { describe, expect, test } from "vitest";

import { noopNsCommandIo, noopNsProgress } from "@nseng-ai/kernel/sdk";
import type { ExecResult } from "@nseng-ai/foundation/exec";
import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";

import {
	createNsClinkrInteraction,
	createNsCwdEnvStdinContext,
} from "@nseng-ai/capability-kit/ns-context";

describe("ns context adapters", () => {
	test("creates a non-interactive aborting Clinkr interaction when confirm is unavailable", async () => {
		const interaction = createNsClinkrInteraction(fakeApi(), { title: "Confirm" });

		expect(interaction.isInteractive()).toBe(false);
		await expect(
			interaction.confirm({ message: "Continue?", defaultAnswer: "no" }),
		).resolves.toEqual({ type: "aborted" });
	});

	test("maps ns confirm approval to confirmed", async () => {
		const prompts: Array<{ title: string; message: string; defaultAnswer: "yes" | "no" }> = [];
		const interaction = createNsClinkrInteraction(
			fakeApi({
				confirm: async (title, message, options) => {
					prompts.push({ title, message, defaultAnswer: options?.defaultAnswer ?? "no" });
					return true;
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
		const interaction = createNsClinkrInteraction(fakeApi({ confirm: async () => false }), {
			title: "Confirm",
		});

		await expect(
			interaction.confirm({ message: "Continue?", defaultAnswer: "no" }),
		).resolves.toEqual({ type: "declined" });
	});

	test("uses the request message when no formatter is supplied", async () => {
		let capturedMessage = "";
		const interaction = createNsClinkrInteraction(
			fakeApi({
				confirm: (_title, message) => {
					capturedMessage = message;
					return true;
				},
			}),
			{ title: "Confirm" },
		);

		await interaction.confirm({ message: "Use original", defaultAnswer: "yes" });

		expect(capturedMessage).toBe("Use original");
	});

	test("creates cwd/env/stdin context from ns host context", async () => {
		const env = { NS_TEST: "1" };
		const context = createNsCwdEnvStdinContext(fakeApi({ env }));

		expect(context.cwd).toBe("/repo");
		expect(context.env).toBe(env);
		await expect(context.stdin()).resolves.toBe("");
	});
});

function fakeApi(overrides: Partial<NsExtensionApi> = {}): NsExtensionApi {
	return {
		cwd: "/repo",
		env: {},
		commandIo: noopNsCommandIo,
		progress: noopNsProgress,
		renderCapabilities: { canEmitAnsi: false },
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

function makeExecResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: "",
		stderr: "",
		code: 0,
		killed: false,
		...overrides,
	};
}
