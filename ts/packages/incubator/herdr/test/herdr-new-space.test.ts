import { describe, expect, test } from "vitest";

import type { CustomMessage } from "@nseng-ai/extension-kit/pi-types";
import { InMemoryGitGateway } from "@nseng-ai/foundation/git/testing";
import { handleHerdrNewSpace, type HerdrResourceLabelDeriver } from "../src/core/new-space.ts";
import { registerHerdrNewSpaceCommand } from "../src/pi/new-space.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	notificationMessages,
	ROOT,
} from "./herdr-test-harness.ts";

function labelDeriver(label = "review-brmem-contract"): HerdrResourceLabelDeriver {
	return { deriveLabel: async () => label };
}

describe("Herdr new space", () => {
	test("opens a focused space at ctx.cwd without a label when no description is supplied", async () => {
		const ctx = new FakeCommandContext({ cwd: "/repo/package" });
		const herdr = new FakeHerdrGateway();

		await handleHerdrNewSpace({
			herdr,
			labelDeriver: labelDeriver(),
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
		const ctx = new FakeCommandContext({
			cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-4",
		});
		const herdr = new FakeHerdrGateway();
		const derivations: Array<{ description: string; cwd: string }> = [];
		const progress: string[] = [];

		await handleHerdrNewSpace({
			herdr,
			labelDeriver: {
				async deriveLabel(input) {
					derivations.push(input);
					return "review-brmem-contract";
				},
			},
			args: "  review the public brmem API  ",
			ctx,
			notifyProgress: (message) => progress.push(message),
		});

		expect(derivations).toEqual([
			{
				description: "review the public brmem API",
				cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-4",
			},
		]);
		expect(progress).toEqual(["Deriving a semantic label for the new Herdr space…"]);
		expect(herdr.createWorkspaceCalls).toEqual([
			{
				options: {
					cwd: "/Users/example/.local/state/ns/slots/repos/ns/worktrees/slot-4",
					shouldFocus: true,
					label: "s4:review-brmem-contract",
				},
			},
		]);
	});

	test("does not create a space when label derivation fails", async () => {
		const ctx = new FakeCommandContext();
		const herdr = new FakeHerdrGateway();

		await handleHerdrNewSpace({
			herdr,
			labelDeriver: {
				async deriveLabel() {
					throw new Error("model unavailable");
				},
			},
			args: "review the public brmem API",
			ctx,
			notifyProgress: () => {},
		});

		expect(herdr.createWorkspaceCalls).toEqual([]);
		expect(notificationMessages(ctx).join("\n")).toContain("No space was created");
		expect(notificationMessages(ctx).join("\n")).toContain("model unavailable");
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
			trunkBranch: "main",
			herdr,
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
