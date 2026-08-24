import { describe, expect, test } from "vitest";

import registerBranchContextExtension, { buildWritePlanPrompt } from "../src/extension.ts";

import {
	FakePi,
	createContext,
	gitRootStep,
	makeRepoPrompt,
	makeRepoPromptDirectory,
	makeRepoPromptSymlink,
	step,
} from "./branch-context-extension-support.ts";

describe("enriched-plan-commands", () => {
	test("registers plans write commands, branch-context workflow commands, and write tool", () => {
		const pi = new FakePi();
		registerBranchContextExtension(pi);

		expect([...pi.commands.keys()].sort()).toEqual([
			"ns:branch-context:from-plan",
			"ns:branch-context:impl-attached-plan",
			"ns:branch-context:upstack-impl-from-plan",
			"ns:plan:impl-saved-plan",
			"ns:plan:save",
		]);
		expect([...pi.commands.keys()].filter((name) => name.startsWith("ns:plan:"))).toEqual([
			"ns:plan:save",
			"ns:plan:impl-saved-plan",
		]);
		expect(pi.commands.has("ns:plan:impl-current")).toBe(false);
		expect([...pi.commands.keys()].some((name) => name.startsWith("enriched-plan:"))).toBe(false);
		expect([...pi.commands.keys()].some((name) => name.startsWith("branch-context:"))).toBe(false);
		expect(pi.tools.has("write_saved_plan_file")).toBe(true);
		expect([...pi.tools.keys()]).toEqual(["write_saved_plan_file"]);
	});

	test("ns:plan:save waits for idle, reads repo prompt, and dispatches the generated prompt", async () => {
		const events: string[] = [];
		const repoRoot = await makeRepoPrompt();
		const pi = new FakePi([gitRootStep(repoRoot)], events);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ns:plan:save");
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
				options: { cwd: repoRoot, signal: expect.any(AbortSignal) },
			},
		]);
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toBe(
			buildWritePlanPrompt("add a tiny docs note plan for testing"),
		);
		expect(pi.sentUserMessages[0]).toContain("write_saved_plan_file");
		expect(pi.sentUserMessages[0]).toContain(
			"$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<slug>.md",
		);
		expect(pi.sentUserMessages[0]).toContain("No fallback path is read or written");
		expect(pi.sentUserMessages[0]).toContain("completely fresh downstream implementation session");
		expect(pi.sentUserMessages[0]).toContain("External research/context contract");
		expect(pi.sentUserMessages[0]).not.toContain("create_brmem_plan_branch_from_file");
		expect(pi.sentUserMessages[0]).not.toContain("branchCreation");
		expect(context.notifications).toEqual([
			{ message: "Starting /ns:plan:save planning turn…", level: "info" },
		]);
	});

	test("ns:plan:save with empty args still sends a prompt with none steering", async () => {
		const repoRoot = await makeRepoPrompt();
		const pi = new FakePi([gitRootStep(repoRoot)]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ns:plan:save");
		const context = createContext([], { cwd: repoRoot });

		await command?.handler("   ", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toHaveLength(1);
		expect(pi.sentUserMessages[0]).toContain("User steering for this planning request: (none)");
	});

	test("ns:plan:save uses custom checked-in prompt body", async () => {
		const repoRoot = await makeRepoPrompt("Custom plan body\n");
		const pi = new FakePi([gitRootStep(repoRoot)]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ns:plan:save");
		const context = createContext([], { cwd: repoRoot });

		await command?.handler("customize this", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([
			buildWritePlanPrompt("customize this", "Custom plan body\n"),
		]);
		expect(context.notifications).toEqual([
			{ message: "Starting /ns:plan:save planning turn…", level: "info" },
		]);
	});

	test("ns:plan:save falls back and warns when git root discovery fails", async () => {
		const pi = new FakePi([
			step("git", ["rev-parse", "--show-toplevel"], {
				code: 128,
				stdout: "",
				stderr: "fatal: not a git repository",
			}),
		]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ns:plan:save");
		const context = createContext();

		await command?.handler("fallback please", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("fallback please")]);
		expect(context.notifications).toEqual([
			{ message: "Starting /ns:plan:save planning turn…", level: "info" },
			{
				message:
					"Falling back to built-in /ns:plan:save prompt body because git rev-parse --show-toplevel failed (exit code 128).\n\nCommand: git rev-parse --show-toplevel\n\n----- stdout tail -----\n(empty)\n\n----- stderr tail -----\nfatal: not a git repository",
				level: "warning",
			},
		]);
	});

	test("ns:plan:save falls back and warns on a whitespace-only repo prompt", async () => {
		const repoRoot = await makeRepoPrompt(" \n\t");
		const pi = new FakePi([gitRootStep(repoRoot)]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ns:plan:save");
		const context = createContext([], { cwd: repoRoot });

		await command?.handler("whitespace prompt", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("whitespace prompt")]);
		expect(context.notifications).toHaveLength(2);
		expect(context.notifications[1]).toMatchObject({ level: "warning" });
		expect(context.notifications[1]?.message).toContain(
			"Falling back to built-in /ns:plan:save prompt body because",
		);
		expect(context.notifications[1]?.message).toContain("is empty");
	});

	test("ns:plan:save falls back and warns when the repo prompt is not a regular file", async () => {
		const repoRoot = await makeRepoPromptDirectory();
		const pi = new FakePi([gitRootStep(repoRoot)]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ns:plan:save");
		const context = createContext([], { cwd: repoRoot });

		await command?.handler("directory prompt", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("directory prompt")]);
		expect(context.notifications).toHaveLength(2);
		expect(context.notifications[1]).toMatchObject({ level: "warning" });
		expect(context.notifications[1]?.message).toContain("is not a regular file");
	});

	test("ns:plan:save rejects symlinked repo prompt and falls back without UI warning", async () => {
		const repoRoot = await makeRepoPromptSymlink();
		const pi = new FakePi([gitRootStep(repoRoot)]);
		registerBranchContextExtension(pi);
		const command = pi.commands.get("ns:plan:save");
		const context = createContext([], { cwd: repoRoot, hasUI: false });

		await command?.handler("symlink", context.ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([buildWritePlanPrompt("symlink")]);
		expect(context.notifications).toEqual([
			{ message: "Starting /ns:plan:save planning turn…", level: "info" },
		]);
	});
});
