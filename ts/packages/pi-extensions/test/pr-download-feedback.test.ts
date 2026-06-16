import { describe, expect, test } from "vitest";

import prExtension, { PR_DOWNLOAD_FEEDBACK_COMMAND_NAME, type ExtensionAPI, type ExtensionContext, type ExecResult, type RegisteredCommand } from "../src/pr.ts";

const ROOT = "/repo";

interface ExecCall {
	command: string;
	args: string[];
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly calls: ExecCall[] = [];
	readonly userMessages: string[] = [];
	private readonly result: ExecResult;

	constructor(result: ExecResult = execResult({ stdout: envelope({ markdown: "# Prompt" }) })) {
		this.result = result;
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(command: string, args: string[]): Promise<ExecResult> {
		this.calls.push({ command, args });
		return this.result;
	}

	sendUserMessage(content: string): void {
		this.userMessages.push(content);
	}
}

class FakeContext implements ExtensionContext {
	readonly cwd = ROOT;
	readonly hasUI = true;
	readonly notifications: Array<{ message: string; level: string | undefined }> = [];
	readonly statuses: Array<{ key: string; value: string | undefined }> = [];
	readonly editorTexts: string[] = [];
	readonly ui = {
		notify: (message: string, level?: "info" | "warning" | "error") => {
			this.notifications.push({ message, level });
		},
		setStatus: (key: string, value: string | undefined) => {
			this.statuses.push({ key, value });
		},
		setEditorText: (text: string) => {
			this.editorTexts.push(text);
		},
	};
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return { stdout: overrides.stdout ?? "", stderr: overrides.stderr ?? "", code: overrides.code ?? 0, killed: overrides.killed ?? false };
}

function envelope(data: object): string {
	return JSON.stringify({ exit_code: 0, data });
}

function negativeEnvelope(data: object): string {
	return JSON.stringify({ exit_code: 1, message: "No PR found", data });
}

async function runCommand(pi: FakePi, rawArgs = ""): Promise<FakeContext> {
	prExtension(pi);
	const command = pi.commands.get(PR_DOWNLOAD_FEEDBACK_COMMAND_NAME);
	expect(command).toBeDefined();
	const ctx = new FakeContext();
	await command?.handler(rawArgs, ctx);
	return ctx;
}

describe("/pr:download-feedback", () => {
	test("registers the command", () => {
		const pi = new FakePi();

		prExtension(pi);

		expect([...pi.commands.keys()]).toEqual([PR_DOWNLOAD_FEEDBACK_COMMAND_NAME]);
	});

	test("downloads feedback and pre-fills the editor without sending a user message", async () => {
		const markdown = "# PR feedback triage request\n\nDo not edit files yet.";
		const pi = new FakePi(execResult({ stdout: envelope({ markdown }) }));

		const ctx = await runCommand(pi);

		expect(pi.calls).toEqual([{ command: "pr-address", args: ["exec", "download-feedback", "--format", "json"] }]);
		expect(ctx.editorTexts).toEqual([markdown]);
		expect(ctx.notifications.at(-1)).toEqual({ message: "Downloaded PR feedback into the editor. Review/edit, then press Enter.", level: "info" });
		expect(ctx.statuses).toEqual([
			{ key: PR_DOWNLOAD_FEEDBACK_COMMAND_NAME, value: "PR feedback: downloading…" },
			{ key: PR_DOWNLOAD_FEEDBACK_COMMAND_NAME, value: undefined },
		]);
		expect(pi.userMessages).toEqual([]);
	});

	test("forwards a numeric argument as --pr-number", async () => {
		const pi = new FakePi(execResult({ stdout: envelope({ markdown: "# Prompt" }) }));

		await runCommand(pi, "123");

		expect(pi.calls).toEqual([{ command: "pr-address", args: ["exec", "download-feedback", "--pr-number", "123", "--format", "json"] }]);
	});

	test("prefills returned markdown for a negative no-PR envelope", async () => {
		const markdown = "# PR feedback triage request\n\nNo PR found.";
		const pi = new FakePi(execResult({ stdout: negativeEnvelope({ markdown }), code: 1 }));

		const ctx = await runCommand(pi);

		expect(ctx.editorTexts).toEqual([markdown]);
		expect(ctx.notifications.at(-1)?.level).toBe("info");
		expect(pi.userMessages).toEqual([]);
	});

	test("malformed output reports an error and leaves editor text unchanged", async () => {
		const pi = new FakePi(execResult({ stdout: "not json", stderr: "boom", code: 2 }));

		const ctx = await runCommand(pi);

		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("Malformed pr-address download-feedback");
		expect(pi.userMessages).toEqual([]);
	});

	test("rejects unsupported arguments without running the CLI", async () => {
		const pi = new FakePi();

		const ctx = await runCommand(pi, "--bad");

		expect(pi.calls).toEqual([]);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.notifications).toEqual([{ message: "Usage: /pr:download-feedback [pr-number]", level: "error" }]);
	});
});
