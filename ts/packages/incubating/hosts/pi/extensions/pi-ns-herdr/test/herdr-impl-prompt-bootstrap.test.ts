import { describe, expect, test } from "vitest";

import { InMemoryGitGateway, type InMemoryGitGatewayState } from "@nseng-ai/foundation/git/testing";

import {
	buildHerdrImplPromptLaunchCommand,
	HERDR_IMPL_PROMPT_BRANCH_ENV,
} from "../src/core/impl-prompt-launch.ts";
import {
	buildDestinationImplementationPrompt,
	registerHerdrImplPromptBootstrap,
} from "../src/pi/impl-prompt-bootstrap.ts";
import { createHerdrPiCommandApi } from "../src/pi/pi-command-api.ts";
import {
	FakeCommandContext,
	FakeHerdrGateway,
	FakePi,
	ROOT,
	step,
	type ScriptedExec,
} from "./herdr-test-harness.ts";

const BRANCH = "herdr-launch-feature";
const PROMPT = 'Implement `cache` with Unicode λ, quotes "\'", $shell, and\nmultiple lines.';

const BRMEM_GET_ARGS = [
	"get",
	"prompt.md",
	"--namespace",
	"ns-impl",
	"--branch",
	BRANCH,
	"--format",
	"json",
];

function brmemGetStep(result: { stdout?: string; stderr?: string; code?: number }): ScriptedExec {
	return step("brmem", BRMEM_GET_ARGS, result);
}

function bootstrapHarness(options: {
	script?: ScriptedExec[];
	env?: Record<string, string | undefined>;
	currentBranch?: InMemoryGitGatewayState["currentBranch"];
}) {
	const pi = new FakePi({ script: options.script ?? [] });
	const git = new InMemoryGitGateway(
		options.currentBranch === undefined ? {} : { currentBranch: options.currentBranch },
	);
	const env = options.env ?? { [HERDR_IMPL_PROMPT_BRANCH_ENV]: BRANCH };
	registerHerdrImplPromptBootstrap(
		{
			commands: createHerdrPiCommandApi(pi),
			git,
			projectConfig: {
				readTextFile: () => ({ type: "missing" }),
				pathExists: () => ({ type: "missing" }),
			},
			herdr: new FakeHerdrGateway(),
		},
		{ env },
	);
	return { pi, git, env };
}

describe("herdr implementation prompt startup bootstrap", () => {
	test("builds a marker-only prompt-free pane launch command", () => {
		const command = buildHerdrImplPromptLaunchCommand("feature/demo", {
			model: { provider: "anthropic", id: "claude-sonnet" },
			thinkingLevel: "high",
		});

		expect(command).toBe(
			`${HERDR_IMPL_PROMPT_BRANCH_ENV}=feature/demo exec pi --provider anthropic --model claude-sonnet --thinking high`,
		);
		expect(command).not.toContain("brmem");
		expect(command).not.toContain("mktemp");
		expect(command).not.toContain("payload_dir");
		expect(command).not.toContain("@");
		expect(command).not.toContain("--fork");
	});

	test("shell-quotes the branch marker and omits flags when unset", () => {
		expect(buildHerdrImplPromptLaunchCommand("branch name", { thinkingLevel: "off" })).toBe(
			`${HERDR_IMPL_PROMPT_BRANCH_ENV}='branch name' exec pi`,
		);
	});

	test("prepends destination execution context to the complete stored prompt once", async () => {
		const { pi, env } = bootstrapHarness({
			script: [
				brmemGetStep({ stdout: JSON.stringify({ exitCode: 0, data: { content: PROMPT } }) }),
			],
			currentBranch: BRANCH,
		});
		const ctx = new FakeCommandContext();

		expect(env[HERDR_IMPL_PROMPT_BRANCH_ENV]).toBeUndefined();
		await pi.emitSessionStart({ reason: "startup" }, ctx);

		pi.assertDone();
		expect(pi.sentUserMessages).toEqual([
			buildDestinationImplementationPrompt({
				cwd: ROOT,
				expectedBranch: BRANCH,
				implementationPrompt: PROMPT,
			}),
		]);
		const firstPrompt = pi.sentUserMessages[0] ?? "";
		expect(firstPrompt).toContain(`Destination session cwd: ${ROOT}`);
		expect(firstPrompt).toContain(`Expected implementation branch: ${BRANCH}`);
		expect(firstPrompt).toContain("interpret and rebase repository paths");
		expect(firstPrompt).toContain("Do not edit the source or old Slot");
		expect(firstPrompt.indexOf("## Herdr destination execution context")).toBeLessThan(
			firstPrompt.indexOf("## Implementation prompt"),
		);
		expect(firstPrompt.endsWith(PROMPT)).toBe(true);
		expect(ctx.notifications).toEqual([]);
	});

	test.each(["reload", "new", "resume", "fork"] as const)(
		"does not replay the prompt for the %s session-start reason",
		async (reason) => {
			const { pi } = bootstrapHarness({ currentBranch: BRANCH });
			const ctx = new FakeCommandContext();

			await pi.emitSessionStart({ reason }, ctx);

			expect(pi.execCalls).toEqual([]);
			expect(pi.sentUserMessages).toEqual([]);
			expect(ctx.notifications).toEqual([]);
		},
	);

	test.each([undefined, "", "   "])(
		"is a no-op for ordinary sessions when the marker is %j",
		async (marker) => {
			const { pi } = bootstrapHarness({
				env: marker === undefined ? {} : { [HERDR_IMPL_PROMPT_BRANCH_ENV]: marker },
				currentBranch: BRANCH,
			});
			const ctx = new FakeCommandContext();

			await pi.emitSessionStart({ reason: "startup" }, ctx);

			expect(pi.execCalls).toEqual([]);
			expect(pi.sentUserMessages).toEqual([]);
			expect(ctx.notifications).toEqual([]);
		},
	);

	test("consumes the marker so nested Pi processes cannot inherit it", () => {
		const env = { [HERDR_IMPL_PROMPT_BRANCH_ENV]: BRANCH, OTHER: "kept" };
		bootstrapHarness({ env, currentBranch: BRANCH });

		expect(HERDR_IMPL_PROMPT_BRANCH_ENV in env).toBe(false);
		expect(env.OTHER).toBe("kept");
	});

	test("stops before loading when the current branch does not match the marker", async () => {
		const { pi } = bootstrapHarness({ currentBranch: "some/other-branch" });
		const ctx = new FakeCommandContext();

		await pi.emitSessionStart({ reason: "startup" }, ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications).toEqual([
			{
				message: `Herdr expected branch ${BRANCH} to load the stored implementation prompt, but the current branch is some/other-branch. Not loading the prompt.`,
				level: "error",
			},
		]);
	});

	test("stops before loading on detached HEAD", async () => {
		const { pi } = bootstrapHarness({ currentBranch: { type: "detached" } });
		const ctx = new FakeCommandContext();

		await pi.emitSessionStart({ reason: "startup" }, ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.level).toBe("error");
		expect(ctx.notifications.at(-1)?.message).toContain("HEAD is detached");
	});

	test("stops before loading when the current branch cannot be resolved", async () => {
		const { pi } = bootstrapHarness({
			currentBranch: { type: "failure", error: { code: "boom", message: "git broke" } },
		});
		const ctx = new FakeCommandContext();

		await pi.emitSessionStart({ reason: "startup" }, ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(ctx.notifications.at(-1)?.message).toContain("git broke");
	});

	test.each([
		["command failure", { code: 1, stderr: "brmem exploded" }],
		[
			"missing entry",
			{
				code: 1,
				stdout: JSON.stringify({ exitCode: 1, error: { message: `secret: ${PROMPT}` } }),
			},
		],
		["malformed machine output", { stdout: `not json ${PROMPT}` }],
		["schema mismatch", { stdout: JSON.stringify({ exitCode: 0, data: { content: 42 } }) }],
	] as const)(
		"reports a payload-free diagnostic on %s without sending a prompt",
		async (_label, result) => {
			const { pi } = bootstrapHarness({
				script: [brmemGetStep(result)],
				currentBranch: BRANCH,
			});
			const ctx = new FakeCommandContext();

			await pi.emitSessionStart({ reason: "startup" }, ctx);

			pi.assertDone();
			expect(pi.sentUserMessages).toEqual([]);
			const notification = ctx.notifications.at(-1);
			expect(notification?.level).toBe("error");
			expect(notification?.message).toContain(
				`Branch Memory ns-impl/prompt.md on branch ${BRANCH}`,
			);
			expect(notification?.message).not.toContain(PROMPT.split("\n")[0]);
			expect(notification?.message).not.toContain("brmem exploded");
		},
	);
});
