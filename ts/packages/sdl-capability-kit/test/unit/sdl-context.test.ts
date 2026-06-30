import { describe, expect, test } from "vitest";

import { noopSdlCommandIo, noopSdlProgress } from "sdl-sdk";
import type { ExecResult } from "@sdl/exec";
import type { SdlExtensionApi } from "sdl-sdk";

import {
	createSdlClinkrInteraction,
	createSdlCwdEnvStdinContext,
} from "@sdl/capability-kit/sdl-context";

describe("SDL context adapters", () => {
	test("creates a non-interactive aborting Clinkr interaction when confirm is unavailable", async () => {
		const interaction = createSdlClinkrInteraction(fakeApi(), { title: "Confirm" });

		expect(interaction.isInteractive()).toBe(false);
		await expect(
			interaction.confirm({ message: "Continue?", defaultAnswer: "no" }),
		).resolves.toEqual({ type: "aborted" });
	});

	test("maps SDL confirm approval to confirmed", async () => {
		const prompts: Array<{ title: string; message: string }> = [];
		const interaction = createSdlClinkrInteraction(
			fakeApi({
				confirm: async (title, message) => {
					prompts.push({ title, message });
					return true;
				},
			}),
			{ title: "Deploy", formatMessage: (request) => `Formatted: ${request.message}` },
		);

		expect(interaction.isInteractive()).toBe(true);
		await expect(
			interaction.confirm({ message: "Continue?", defaultAnswer: "yes" }),
		).resolves.toEqual({ type: "confirmed" });
		expect(prompts).toEqual([{ title: "Deploy", message: "Formatted: Continue?" }]);
	});

	test("maps SDL confirm rejection to declined", async () => {
		const interaction = createSdlClinkrInteraction(fakeApi({ confirm: async () => false }), {
			title: "Confirm",
		});

		await expect(
			interaction.confirm({ message: "Continue?", defaultAnswer: "no" }),
		).resolves.toEqual({ type: "declined" });
	});

	test("uses the request message when no formatter is supplied", async () => {
		let capturedMessage = "";
		const interaction = createSdlClinkrInteraction(
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

	test("creates cwd/env/stdin context from SDL host context", async () => {
		const env = { SDL_TEST: "1" };
		const context = createSdlCwdEnvStdinContext(fakeApi({ env }));

		expect(context.cwd).toBe("/repo");
		expect(context.env).toBe(env);
		await expect(context.stdin()).resolves.toBe("");
	});
});

function fakeApi(overrides: Partial<SdlExtensionApi> = {}): SdlExtensionApi {
	return {
		cwd: "/repo",
		env: {},
		commandIo: noopSdlCommandIo,
		progress: noopSdlProgress,
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
