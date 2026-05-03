import type { ExecOptions, ExecResult, ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { describe, expect, test } from "vitest";

import { runObjectiveNext } from "../../src/commands/next.ts";

type ExecCall = {
	command: string;
	args: string[];
	options: ExecOptions | undefined;
};

type NextContextFixture = {
	current_branch: string;
	trunk_branch: string;
	on_trunk: boolean;
	slug: string;
	files_present: string[];
	freshness: "fresh" | "stale" | null;
	freshness_advisory: string | null;
	notes_present: boolean;
	body_content: string;
	roadmap_content: string | null;
	notes_content: string | null;
};

type Harness = {
	pi: ExtensionAPI;
	ctx: ExtensionCommandContext;
	calls: ExecCall[];
	messages: Record<string, unknown>[];
};

type Responder = (command: string, args: string[], options: ExecOptions | undefined) => ExecResult | Promise<ExecResult>;

const BODY = `# Parent Objective

Status: in progress

## Description

Keep command context deterministic.
`;

const ROADMAP = `# Roadmap

## Slice 2

- [x] Preserve TypeScript markdown parsing
- [ ] Add next context schema guard
`;

function execResult(stdout: string, stderr = "", code = 0): ExecResult {
	return { stdout, stderr, code, killed: false };
}

function successEnvelope(data: unknown): string {
	return JSON.stringify({ exit_code: 0, data });
}

function failureEnvelope(errorType: string, message: string): string {
	return JSON.stringify({ exit_code: 2, error_type: errorType, message });
}

function makeNextContext(overrides: Partial<NextContextFixture> = {}): NextContextFixture {
	return {
		current_branch: "feat/objective",
		trunk_branch: "master",
		on_trunk: false,
		slug: "parent-objective",
		files_present: ["body.md", "roadmap.md", "notes.md"],
		freshness: "stale",
		freshness_advisory: "Snapshot is behind HEAD on feat/objective — consider running objective-update parent-objective first.",
		notes_present: true,
		body_content: BODY,
		roadmap_content: ROADMAP,
		notes_content: "- Durable note.\n",
		...overrides,
	};
}

function createHarness(responder: Responder): Harness {
	const calls: ExecCall[] = [];
	const messages: Record<string, unknown>[] = [];
	const ctx = {
		cwd: "/tmp/twerk-pi-objectives-test/no-project",
		hasUI: false,
	} as unknown as ExtensionCommandContext;
	const pi = {
		exec: async (command: string, args: string[], options?: ExecOptions) => {
			calls.push({ command, args: [...args], options });
			return responder(command, args, options);
		},
		sendMessage: (message: unknown) => {
			messages.push(message as Record<string, unknown>);
		},
	} as unknown as ExtensionAPI;

	return { pi, ctx, calls, messages };
}

function messageContent(messages: Record<string, unknown>[]): string {
	const content = messages[0]?.content;
	expect(typeof content).toBe("string");
	return content as string;
}

describe("objective-next", () => {
	test("loads next-context once and renders returned branch, files, and freshness data", async () => {
		const { pi, ctx, calls, messages } = createHarness((command, args) => {
			if (command === "objective" && args[0] === "exec" && args[1] === "next-context") {
				return execResult(successEnvelope(makeNextContext()));
			}
			if (command === "git") {
				return execResult("", "", 1);
			}
			if (command === "brmem") {
				return execResult("", "", 1);
			}
			throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
		});

		await runObjectiveNext(pi, ctx, "parent-objective");

		expect(calls.map((call) => call.command)).toEqual(["objective", "git", "brmem"]);
		expect(calls[0]?.args).toEqual(["exec", "next-context", "parent-objective", "--format", "json"]);
		expect(calls[1]?.args).toEqual(["rev-parse", "--verify", "--quiet", "refs/heads/add-next-context-schema-guard"]);
		expect(calls[2]?.args).toEqual([
			"check",
			"add-next-context-schema-guard/body.md",
			"--namespace",
			"objectives",
			"--branch",
			"master",
			"--format",
			"json",
		]);

		const content = messageContent(messages);
		expect(content).toContain("# Objective next: `parent-objective`");
		expect(content).toContain("Source: current branch `feat/objective`");
		expect(content).toContain("Trunk: `master`");
		expect(content).toContain("Files: body.md, roadmap.md, notes.md");
		expect(content).toContain("Freshness: stale");
		expect(content).toContain("Advisory: Snapshot is behind HEAD on feat/objective");
		expect(content).toContain("Suggested slug: `add-next-context-schema-guard`");
		expect(content).toContain("Collision check: clear");
		expect(messages[0]?.details).toMatchObject({
			status: "ok",
			slug: "parent-objective",
			suggestedSlug: "add-next-context-schema-guard",
			branch: "feat/objective",
			trunk: "master",
			freshness: "stale",
		});
	});

	test("surfaces nonzero next-context envelopes without falling back to old context commands", async () => {
		const { pi, ctx, calls, messages } = createHarness((command, args) => {
			if (command === "objective" && args[0] === "exec" && args[1] === "next-context") {
				return execResult(failureEnvelope("ambiguous_objective", "Multiple objectives on branch feat/objective: alpha, beta. Specify a SLUG."));
			}
			throw new Error(`unexpected fallback command: ${command} ${args.join(" ")}`);
		});

		await runObjectiveNext(pi, ctx, "");

		expect(calls).toHaveLength(1);
		expect(calls[0]?.command).toBe("objective");
		expect(calls[0]?.args).toEqual(["exec", "next-context", "--format", "json"]);
		expect(calls.some((call) => call.command === "git")).toBe(false);
		expect(calls.some((call) => call.command === "objective" && call.args.some((arg) => ["list", "show", "update-precheck"].includes(arg)))).toBe(false);

		const content = messageContent(messages);
		expect(content).toContain("Objective next failed: objective exec next-context failed: ambiguous_objective");
		expect(content).toContain("Multiple objectives on branch feat/objective: alpha, beta");
	});

	test("skips temporary direct collision checks when TypeScript cannot generate a suggested slug", async () => {
		const { pi, ctx, calls, messages } = createHarness((command, args) => {
			if (command === "objective" && args[0] === "exec" && args[1] === "next-context") {
				return execResult(
					successEnvelope(
						makeNextContext({
							slug: "parent",
							files_present: ["body.md"],
							freshness: "fresh",
							freshness_advisory: null,
							notes_present: false,
							body_content: "# parent\n\nStatus: open\n",
							roadmap_content: null,
							notes_content: null,
						}),
					),
				);
			}
			throw new Error(`unexpected collision command: ${command} ${args.join(" ")}`);
		});

		await runObjectiveNext(pi, ctx, "");

		expect(calls).toHaveLength(1);
		expect(calls[0]?.args).toEqual(["exec", "next-context", "--format", "json"]);
		const content = messageContent(messages);
		expect(content).toContain("Suggested slug: unable to generate a safe slug");
		expect(content).toContain("Collision check: not run");
	});
});
