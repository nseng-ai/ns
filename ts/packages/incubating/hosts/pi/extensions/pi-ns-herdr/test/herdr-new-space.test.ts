import { describe, expect, test } from "vitest";

import type { CustomMessage } from "@nseng-ai/extension-kit/pi-types";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { handleHerdrNewSpace, type HerdrResourceLabelDeriver } from "../src/core/new-space.ts";
import { registerHerdrNewSpaceCommand } from "../src/pi/new-space.ts";
import {
	createHerdrResourceLabelDeriver,
	resolveHerdrSlotLabelInput,
} from "../src/pi/resource-label.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	notificationMessages,
	ROOT,
	step,
} from "./herdr-test-harness.ts";

function labelDeriver(label = "review-brmem-contract"): HerdrResourceLabelDeriver {
	return {
		deriveLabel: async () => ({
			ok: true,
			value: { slug: label, rawOutput: label, provider: "test", model: "test" },
		}),
	};
}

describe("Herdr new space", () => {
	test("opens a focused space at ctx.cwd without a label when no description is supplied", async () => {
		const ctx = new FakeCommandContext({ cwd: "/repo/package" });
		const herdr = new FakeHerdrGateway();

		await handleHerdrNewSpace({
			herdr,
			labelDeriver: labelDeriver(),
			resolveSlotLabelInput: async () => ({}),
			args: "",
			ctx,
			notifyProgress: () => {},
		});

		expect(herdr.createWorkspaceCalls).toEqual([
			{ options: { cwd: "/repo/package", shouldFocus: true } },
		]);
		expect(notificationMessages(ctx)).toContain("Opened Herdr space at /repo/package.");
	});

	test("derives a slot-prefixed semantic label from an optional description", async () => {
		const nestedCwd = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-04/ts/packages";
		const ctx = new FakeCommandContext({ cwd: nestedCwd });
		const herdr = new FakeHerdrGateway();
		const derivations: Array<{ description: string; cwd: string }> = [];
		const progress: string[] = [];

		await handleHerdrNewSpace({
			herdr,
			labelDeriver: {
				async deriveLabel(input) {
					derivations.push(input);
					return {
						ok: true,
						value: {
							slug: "review-brmem-contract",
							rawOutput: "review-brmem-contract",
							provider: "test",
							model: "test",
						},
					};
				},
			},
			resolveSlotLabelInput: async () => ({ slotSlug: "slot-04" }),
			args: "  review the public brmem API  ",
			ctx,
			notifyProgress: (message) => progress.push(message),
		});

		expect(derivations).toEqual([
			{
				description: "review the public brmem API",
				cwd: nestedCwd,
			},
		]);
		expect(progress).toEqual(["Deriving a semantic label for the new Herdr space…"]);
		expect(herdr.createWorkspaceCalls).toEqual([
			{
				options: {
					cwd: nestedCwd,
					shouldFocus: true,
					label: "s4:review-brmem-contract",
				},
			},
		]);
	});

	test("the Pi deriver uses the deep policy and strips a trailing resource word", async () => {
		const pi = new FakePi({
			script: [step("pi", undefined, { stdout: "review public brmem api tab" })],
			shouldRequireExpectedArgs: false,
		});
		const commands = createHerdrPiCommandApi(pi);
		const deriver = createHerdrResourceLabelDeriver({
			commands,
			git: new InMemoryGitGateway({ optionalRepoRoot: ROOT }),
			projectConfig: {
				readTextFile: () => ({
					type: "found" as const,
					text: '[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
				}),
				pathExists: () => ({ type: "missing" as const }),
			},
		});

		await expect(
			deriver.deriveLabel({ description: "review the public brmem API tab", cwd: ROOT }),
		).resolves.toMatchObject({ ok: true, value: { slug: "review-public-brmem-api" } });
		expect(pi.execCalls[0]?.args.at(-1)).toContain("description or goal");
		pi.assertDone();
	});

	test("does not create a space when label derivation fails", async () => {
		const ctx = new FakeCommandContext();
		const herdr = new FakeHerdrGateway();

		await handleHerdrNewSpace({
			herdr,
			labelDeriver: {
				async deriveLabel() {
					return {
						ok: false,
						error: { code: "content-slug-failed", message: "model unavailable" },
					};
				},
			},
			resolveSlotLabelInput: async () => ({}),
			args: "review the public brmem API",
			ctx,
			notifyProgress: () => {},
		});

		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain("No space was created");
		expect(notificationMessages(ctx).join("\n")).toContain("model unavailable");
	});

	test("registered command resolves a nested cwd through Git before prefixing its label", async () => {
		const worktreeRoot = "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-04";
		const nestedCwd = `${worktreeRoot}/ts/packages/incubating`;
		const pi = new FakePi({
			script: [step("pi", undefined, { stdout: "review-brmem-contract" })],
			shouldRequireExpectedArgs: false,
		});
		const git = new InMemoryGitGateway({ optionalRepoRoot: worktreeRoot });
		const herdr = new FakeHerdrGateway();
		registerHerdrNewSpaceCommand({
			commands: createHerdrPiCommandApi(pi),
			git,
			projectConfig: {
				readTextFile: () => ({
					type: "found" as const,
					text: '[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
				}),
				pathExists: () => ({ type: "missing" as const }),
			},
			herdr,
			resolveSlotLabelInput: resolveHerdrSlotLabelInput.bind(undefined, git),
		});
		const ctx = new FakeCommandContext({ cwd: nestedCwd });

		await pi.commands.get("ns:herdr:space:new")?.handler("review brmem contract", ctx);

		pi.assertDone();
		expect(git.optionalRepoRootCalls).toEqual([{ cwd: nestedCwd }, { cwd: nestedCwd }]);
		expect(herdr.createWorkspaceCalls).toEqual([
			{
				options: {
					cwd: nestedCwd,
					shouldFocus: true,
					label: "s4:review-brmem-contract",
				},
			},
		]);
	});

	test("Slot decoration fails closed without a Git root or with a deceptive ordinary root", async () => {
		const deceptiveCwd = "/repo/worktrees/slot-04/ts/packages";
		const missingGit = new InMemoryGitGateway({ optionalRepoRoot: { type: "missing" } });
		const failedGit = new InMemoryGitGateway({
			optionalRepoRoot: {
				type: "failure",
				error: { code: "repo_root_failed", message: "git probe failed" },
			},
		});
		const ordinaryGit = new InMemoryGitGateway({ optionalRepoRoot: "/repo" });

		await expect(resolveHerdrSlotLabelInput(missingGit, deceptiveCwd)).resolves.toEqual({});
		await expect(resolveHerdrSlotLabelInput(failedGit, deceptiveCwd)).resolves.toEqual({});
		await expect(resolveHerdrSlotLabelInput(ordinaryGit, deceptiveCwd)).resolves.toEqual({});
	});

	test("registered command acknowledges before idle wait and uses the composed gateway", async () => {
		const pi = new FakePi();
		const sentMessages: CustomMessage[] = [];
		const renderedPi = Object.create(pi) as FakePi & {
			sendMessage(message: CustomMessage): void;
		};
		renderedPi.sendMessage = (message): void => {
			sentMessages.push(message);
		};
		const ctx = new FakeCommandContext({
			onWaitForIdle: () => {
				expect(sentMessages[0]?.customType).toBe("ns-command-ack");
			},
		});
		const herdr = new FakeHerdrGateway();
		const dependencies = {
			commands: createHerdrPiCommandApi(renderedPi),
			git: new InMemoryGitGateway({ optionalRepoRoot: ROOT }),
			projectConfig: {
				readTextFile: () => ({
					type: "found" as const,
					text: '[models.profiles.fast]\nmodel = "openai-codex/gpt-5.6-luna"\nthinking = "minimal"\n',
				}),
				pathExists: () => ({ type: "missing" as const }),
			},
			herdr,
			resolveSlotLabelInput: async () => ({}),
		};
		registerHerdrNewSpaceCommand(dependencies);
		const command = pi.commands.get("ns:herdr:space:new");

		await command?.handler("", ctx);

		pi.assertDone();
		expect(sentMessages[0]?.customType).toBe("ns-command-ack");
		expect(ctx.events[0]).toBe("wait-for-idle");
		expect(herdr.createWorkspaceCalls).toEqual([{ options: { cwd: ROOT, shouldFocus: true } }]);
		expect(notificationMessages(ctx)).toContain(`Opened Herdr space at ${ROOT}.`);
	});
});
