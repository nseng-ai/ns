import { describe, expect, it } from "vitest";

import {
	createRealPiCodingAgentGateway,
	extractPiAgentRunResult,
	prependWorkspacePiBinToPath,
	type PiAgentSdkSession,
	type PiAgentSessionSdk,
} from "../../src/pi-runner/real-pi-coding-agent-gateway.ts";

function assistantMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		role: "assistant",
		content: [{ type: "text", text: "All done." }],
		stopReason: "stop",
		...overrides,
	};
}

interface FakeSessionBehavior {
	readonly messages?: readonly unknown[];
	readonly promptThrows?: boolean;
	readonly createThrows?: boolean;
}

function createFakeSdk(behavior: FakeSessionBehavior = {}) {
	const events: string[] = [];
	const prompts: string[] = [];
	const cwds: string[] = [];
	const sdk: PiAgentSessionSdk = {
		async createSession(options) {
			cwds.push(options.cwd);
			if (behavior.createThrows === true) throw new Error("no usable model");
			const session: PiAgentSdkSession = {
				async initialize() {
					events.push("initialize");
				},
				async prompt(text) {
					events.push("prompt");
					prompts.push(text);
					if (behavior.promptThrows === true) throw new Error("stream aborted");
				},
				messages: () => behavior.messages ?? [assistantMessage()],
				dispose: () => {
					events.push("dispose");
				},
			};
			return session;
		},
	};
	return { sdk, events, prompts, cwds };
}

describe("createRealPiCodingAgentGateway", () => {
	it("runs the prompt over the checkout and extracts the final assistant text", async () => {
		const { sdk, prompts, cwds, events } = createFakeSdk();
		const gateway = createRealPiCodingAgentGateway({ cwd: "/checkout", sdk });

		const result = await gateway.runPromptToCompletion({ prompt: "Do the thing." });

		expect(result).toEqual({ ok: true, finalAssistantText: "All done." });
		expect(cwds).toEqual(["/checkout"]);
		expect(prompts).toEqual(["Do the thing."]);
		expect(events).toEqual(["initialize", "prompt", "dispose"]);
	});

	it("maps a session-creation throw to a failure value", async () => {
		const { sdk } = createFakeSdk({ createThrows: true });
		const gateway = createRealPiCodingAgentGateway({ cwd: "/checkout", sdk });

		const result = await gateway.runPromptToCompletion({ prompt: "Do the thing." });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.message).toContain("no usable model");
	});

	it("maps a prompt throw to a failure value and still disposes the session", async () => {
		const { sdk, events } = createFakeSdk({ promptThrows: true });
		const gateway = createRealPiCodingAgentGateway({ cwd: "/checkout", sdk });

		const result = await gateway.runPromptToCompletion({ prompt: "Do the thing." });

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.message).toContain("stream aborted");
		expect(events).toEqual(["initialize", "prompt", "dispose"]);
	});
});

describe("prependWorkspacePiBinToPath", () => {
	it("makes the checkout-local Pi executable discoverable by child processes", () => {
		const env: Record<string, string | undefined> = { PATH: "/usr/bin:/bin" };

		prependWorkspacePiBinToPath({ cwd: "/checkout", env, pathDelimiter: ":" });

		expect(env["PATH"]).toBe(
			"/checkout/ts/packages/capabilities/vercel/node_modules/.bin:/usr/bin:/bin",
		);
	});
});

describe("extractPiAgentRunResult", () => {
	it("takes the last assistant message's text as the run's final text", () => {
		const result = extractPiAgentRunResult([
			assistantMessage({ content: [{ type: "text", text: "First." }] }),
			{ role: "user", content: [{ type: "text", text: "Continue." }] },
			assistantMessage({
				content: [
					{ type: "thinking", thinking: "hmm" },
					{ type: "text", text: "Second." },
					{ type: "text", text: "Third." },
				],
			}),
		]);

		expect(result).toEqual({ ok: true, finalAssistantText: "Second.\nThird." });
	});

	it("fails when the session produced no assistant message", () => {
		const result = extractPiAgentRunResult([{ role: "user", content: [] }]);

		expect(result.ok).toBe(false);
	});

	it("maps a terminal error stop reason to a failure carrying the library's message", () => {
		const result = extractPiAgentRunResult([
			assistantMessage({ stopReason: "error", errorMessage: "401 invalid api key" }),
		]);

		expect(result).toEqual({ ok: false, message: "401 invalid api key" });
	});

	it("maps an aborted run to a failure even without an error message", () => {
		const result = extractPiAgentRunResult([assistantMessage({ stopReason: "aborted" })]);

		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("Expected a failure.");
		expect(result.message).toContain("aborted");
	});

	it("reports null final text when the last assistant message has no text blocks", () => {
		const result = extractPiAgentRunResult([assistantMessage({ content: [] })]);

		expect(result).toEqual({ ok: true, finalAssistantText: null });
	});

	it("tolerates malformed message shapes", () => {
		const result = extractPiAgentRunResult([null, 42, "text", { role: "assistant" }]);

		expect(result).toEqual({ ok: true, finalAssistantText: null });
	});
});
