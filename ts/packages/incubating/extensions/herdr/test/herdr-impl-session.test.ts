import { describe, expect, test } from "vitest";

import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";

import {
	createPrivateSessionPromptGenerator,
	registerHerdrSessionSpaceImplCommand,
	type PrivatePromptFileGateway,
	type PrivateSessionPromptGenerator,
} from "../src/pi/impl-session.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	ROOT,
	SOURCE_BRANCH,
	step,
} from "./herdr-test-harness.ts";

const COMMAND_NAME = "ns:herdr:impl:session:space";
const PRIVATE_PROMPT =
	"private secret prompt with $shell, `markdown`, quotes ' \" and\nlarge context";

function registrationContext(pi: FakePi) {
	return {
		commands: createHerdrPiCommandApi(pi),
		git: new InMemoryGitGateway({ currentBranch: SOURCE_BRANCH }),
		trunkBranch: "master",
		herdr: new FakeHerdrGateway(),
	};
}

class CapturingPromptFiles implements PrivatePromptFileGateway {
	readonly path = "/private/request.md";
	contents: string[] = [];

	async withUtf8Prompt<T>(content: string, useFile: (filePath: string) => Promise<T>): Promise<T> {
		this.contents.push(content);
		return useFile(this.path);
	}
}

describe(COMMAND_NAME, () => {
	test("generates privately from active branch entries through a prompt file, not argv", async () => {
		const files = new CapturingPromptFiles();
		const pi = new FakePi({
			script: [
				step(
					"pi",
					[
						"--print",
						"--no-session",
						"--no-tools",
						"--provider",
						"anthropic",
						"--model",
						"claude-sonnet",
						"--thinking",
						"high",
						"@/private/request.md",
					],
					{ stdout: PRIVATE_PROMPT },
				),
			],
		});
		const generator = createPrivateSessionPromptGenerator(createHerdrPiCommandApi(pi), files);
		const branchEntries = [
			{ type: "message", message: { role: "user", content: "sensitive session context" } },
		];

		const result = await generator.generate({
			cwd: ROOT,
			focus: "focus with --flag and $shell",
			branchEntries,
			model: { provider: "anthropic", id: "claude-sonnet" },
			thinking: "high",
		});

		pi.assertDone();
		expect(result).toEqual({ ok: true, prompt: PRIVATE_PROMPT });
		expect(files.contents).toHaveLength(1);
		expect(files.contents[0]).toContain(JSON.stringify(branchEntries, null, 2));
		expect(files.contents[0]).toContain("focus with --flag and $shell");
		expect(pi.execCalls[0]?.args.join(" ")).not.toContain("sensitive session context");
		expect(pi.execCalls[0]?.args.join(" ")).not.toContain("focus with --flag");
	});

	test("does not send a parent turn or prefill the editor and passes generated text directly onward", async () => {
		const pi = new FakePi();
		const calls: Parameters<PrivateSessionPromptGenerator["generate"]>[0][] = [];
		const generator: PrivateSessionPromptGenerator = {
			async generate(options) {
				calls.push(options);
				return { ok: true, prompt: PRIVATE_PROMPT };
			},
		};
		registerHerdrSessionSpaceImplCommand(registrationContext(pi), { generator });
		const branchEntries = [{ type: "message", message: { role: "user", content: "context" } }];
		const ctx = new FakeCommandContext({
			cwd: ROOT,
			branchEntries,
			shouldCancelSelect: true,
		});

		await pi.commands.get(COMMAND_NAME)?.handler("continue privately", ctx);

		expect(calls).toEqual([
			expect.objectContaining({
				cwd: ROOT,
				focus: "continue privately",
				branchEntries,
			}),
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.editorTexts).toEqual([]);
		expect(ctx.waitCount).toBe(2);
		expect(ctx.notifications.map((notification) => notification.message).join("\n")).not.toContain(
			PRIVATE_PROMPT,
		);
		expect(ctx.notifications.at(-1)).toEqual({
			message: "Herdr implementation cancelled.",
			level: "info",
		});
	});

	test("generation failure is concise, does not leak output, and prevents launch", async () => {
		const leaked = "secret partial model output";
		const pi = new FakePi();
		const herdr = new FakeHerdrGateway();
		const generator: PrivateSessionPromptGenerator = {
			async generate() {
				return { ok: false, message: "The private model operation failed." };
			},
		};
		registerHerdrSessionSpaceImplCommand({ ...registrationContext(pi), herdr }, { generator });
		const ctx = new FakeCommandContext();

		await pi.commands.get(COMMAND_NAME)?.handler("do not expose this", ctx);

		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.editorTexts).toEqual([]);
		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(herdr.paneRunCalls).toEqual([]);
		expect(ctx.notifications.at(-1)).toEqual({
			message:
				"Could not prepare the private implementation prompt. The private model operation failed.",
			level: "error",
		});
		expect(JSON.stringify(ctx.notifications)).not.toContain(leaked);
	});
});
