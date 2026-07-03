import { describe, expect, test } from "vitest";

import registerBranchContextExtension, {
	buildWriteGrilledPlanPrompt,
	buildWritePlanPrompt,
} from "../../src/pi/extension.ts";

import {
	FakePi,
	createContext,
	gitRootStep,
	makeRepoPrompt,
	makeRepoPromptSymlink,
	step,
} from "./branch-context-extension-support.ts";

describe("enriched-plan-commands", () => {
	test("registers plans write commands, branch-context workflow commands, and write tool", () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"ji:branch-context:from-plan",
			"ji:branch-context:impl-attached-plan",
			"ji:branch-context:upstack-impl-from-plan",
			"ji:plan:grill-and-save",
			"ji:plan:impl-current",
			"ji:plan:save",
		]);
		expect([...pi.commands.keys()].filter((name) => name.startsWith("ji:plan:"))).toEqual([
			"ji:plan:save",
			"ji:plan:grill-and-save",
			"ji:plan:impl-current",
		]);
		expect([...pi.commands.keys()].some((name) => name.startsWith("enriched-plan:"))).toBe(false);
		expect([...pi.commands.keys()].some((name) => name.startsWith("branch-context:"))).toBe(false);
		expect(pi.tools.has("write_saved_plan_file")).toBe(true);
		expect([...pi.tools.keys()]).toEqual(["write_saved_plan_file"]);
	});

	test("ji:plan:grill-and-save waits for idle and dispatches embedded prompt without prompt resolution", async () => {
		const events: string[] = [];
		const pi = new FakePi([], events);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ji:plan:grill-and-save");
		expect(command).toBeDefined();
		const context = createContext(events);

		await command?.handler("  plan the grilled command variant  ", context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(events).toContain("wait");
		expect(events.at(-1)).toBe("send");
		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([
			buildWriteGrilledPlanPrompt("plan the grilled command variant"),
		]);
		expect(pi.sentUserMessages[0]).toContain("grill_ask");
		expect(pi.sentUserMessages[0]).toContain("write_saved_plan_file");
		expect(context.notifications).toEqual([
			{ message: "Starting /ji:plan:grill-and-save planning grill…", level: "info" },
		]);
	});

	test("ji:plan:grill-and-save with empty args still sends a prompt with none steering", async () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ji:plan:grill-and-save");
		const context = createContext();

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWriteGrilledPlanPrompt("")]);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});

	test("ji:plan:save waits for idle, reads repo prompt, and dispatches the generated prompt", async () => {
		const events: string[] = [];
		const repoRoot = await makeRepoPrompt();
		const pi = new FakePi([gitRootStep(repoRoot)], events);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ji:plan:save");
		expect(command).toBeDefined();
		const context = createContext(events, { cwd: repoRoot });

		await command?.handler("  add a tiny docs note plan for testing  ", context.ctx);

		pi.assertDone();
		expect(context.waits()).toBe(1);
		expect(events).toContain("wait");
		expect(events.at(-1)).toBe("send");
		expect(pi.execCalls).toEqual([
			{
				command: "git",
				args: ["rev-parse", "--show-toplevel"],
				options: { cwd: repoRoot, timeout: 10_000 },
			},
		]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toBe(
			buildWritePlanPrompt("add a tiny docs note plan for testing"),
		);
		expect(pi.sentUserMessages[0]).toContain("write_saved_plan_file");
		expect(pi.sentUserMessages[0]).toContain(
			"$XDG_STATE_HOME/ji/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md",
		);
		expect(pi.sentUserMessages[0]).toContain(
			"No legacy ~/.ji/enriched-plan fallback is read or written",
		);
		expect(pi.sentUserMessages[0]).toContain("completely fresh downstream implementation session");
		expect(pi.sentUserMessages[0]).toContain("External research/context contract");
		expect(pi.sentUserMessages[0]).not.toContain("create_brmem_plan_branch_from_file");
		expect(pi.sentUserMessages[0]).not.toContain("branchCreation");
		expect(context.notifications).toEqual([
			{ message: "Starting /ji:plan:save planning turn…", level: "info" },
		]);
	});

	test("ji:plan:save with empty args still sends a prompt with none steering", async () => {
		const repoRoot = await makeRepoPrompt();
		const pi = new FakePi([gitRootStep(repoRoot)]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ji:plan:save");
		const context = createContext([], { cwd: repoRoot });

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});

	test("ji:plan:save uses custom checked-in prompt body", async () => {
		const repoRoot = await makeRepoPrompt("Custom plan body\n");
		const pi = new FakePi([gitRootStep(repoRoot)]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ji:plan:save");
		const context = createContext([], { cwd: repoRoot });

		await command?.handler("customize this", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([
			buildWritePlanPrompt("customize this", "Custom plan body\n"),
		]);
		expect(context.notifications).toEqual([
			{ message: "Starting /ji:plan:save planning turn…", level: "info" },
		]);
	});

	test("ji:plan:save falls back and warns when git root discovery fails", async () => {
		const pi = new FakePi([
			step("git", ["rev-parse", "--show-toplevel"], {
				code: 128,
				stdout: "",
				stderr: "fatal: not a git repository",
			}),
		]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ji:plan:save");
		const context = createContext();

		await command?.handler("fallback please", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("fallback please")]);
		expect(context.notifications).toEqual([
			{ message: "Starting /ji:plan:save planning turn…", level: "info" },
			{
				message:
					"Falling back to built-in /ji:plan:save prompt body because git rev-parse --show-toplevel failed (exit code 128).\n\nCommand: git rev-parse --show-toplevel\n\n----- stdout tail -----\n(empty)\n\n----- stderr tail -----\nfatal: not a git repository",
				level: "warning",
			},
		]);
	});

	test("ji:plan:save rejects symlinked repo prompt and falls back without UI warning", async () => {
		const repoRoot = await makeRepoPromptSymlink();
		const pi = new FakePi([gitRootStep(repoRoot)]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ji:plan:save");
		const context = createContext([], { cwd: repoRoot, hasUI: false });

		await command?.handler("symlink", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("symlink")]);
		expect(context.notifications).toEqual([
			{ message: "Starting /ji:plan:save planning turn…", level: "info" },
		]);
	});
});
