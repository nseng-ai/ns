import { describe, expect, test } from "vitest";

import type { RequiredEffectiveSkill } from "@nseng-ai/pi-runtime/skills/expansion";
import type { ProjectConfigGateway } from "@nseng-ai/sdk/project-config/points";
import {
	SESSION_PLAN_DISCOVERY_LIMITS,
	buildSessionPlanDiscoveryArgs,
	captureSessionPlanDiscoverySkill,
	createSessionPlanDiscoveryProcessGateway,
	discoverSessionPlan,
	parseSessionPlanDiscoveryOutput,
	sessionPlanDiscoverySchema,
	type SessionPlanDiscoveryProcessGateway,
	type SessionPlanDiscoveryProcessRequest,
	type SessionPlanDiscoveryProcessResult,
} from "../src/session-plan-discovery.ts";

const MODEL_POLICY = `[models.profiles.fast]
model = "acme/default"
thinking = "low"
[models.profiles.discovery]
model = "openai-codex/gpt-5.6-luna"
thinking = "minimal"
[models.operations]
"plans.session-discovery" = "discovery"
`;
const MODEL = { provider: "openai-codex", modelId: "gpt-5.6-luna", thinking: "minimal" as const };
const SKILL_PATH = "/global/skills/session-plan-discovery/SKILL.md";
const PLAN = "# Plan\n\nDo the exact work.\n";

const reference = {
	type: "saved-plan-reference" as const,
	filePath: "/plans/selected.md",
	basis: "The session explicitly selected this Saved Plan.",
	evidence: ["Selected Saved Plan: /plans/selected.md"],
};
const presented = {
	type: "presented-plan" as const,
	planMarkdown: PLAN,
	suggestedSlug: "implement-session-plan-discovery",
	basis: "The session presents this as the authoritative implementation plan.",
	evidence: ["Authoritative plan:"],
};
const ready = {
	type: "plan-ready" as const,
	focus: "Crystallize the settled discovery workflow.",
	basis: "The product decisions and implementation anchors are resolved.",
	missingElements: ["Order the settled changes into implementation steps."],
	evidence: ["No material product questions remain."],
};

function effectiveSkill(): RequiredEffectiveSkill {
	return {
		name: "session-plan-discovery",
		filePath: SKILL_PATH,
		baseDir: "/global/skills/session-plan-discovery",
		async load() {
			return {
				name: "session-plan-discovery",
				path: SKILL_PATH,
				baseDir: "/global",
				body: "",
				block: "",
			};
		},
	};
}

function modelPolicyGateway(source = MODEL_POLICY): ProjectConfigGateway {
	return {
		readTextFile: () => ({ type: "found", text: source }),
		pathExists: () => ({ type: "present" }),
	};
}

class FakeProcessGateway implements SessionPlanDiscoveryProcessGateway {
	readonly calls: SessionPlanDiscoveryProcessRequest[] = [];
	private readonly result: SessionPlanDiscoveryProcessResult | Error;
	constructor(result: SessionPlanDiscoveryProcessResult | Error) {
		this.result = result;
	}
	async run(
		request: SessionPlanDiscoveryProcessRequest,
	): Promise<SessionPlanDiscoveryProcessResult> {
		this.calls.push(request);
		if (this.result instanceof Error) throw this.result;
		return this.result;
	}
}

function successProcess(value: unknown): FakeProcessGateway {
	return new FakeProcessGateway({
		type: "exited",
		code: 0,
		stdout: JSON.stringify(value),
		stderr: "",
	});
}

async function run(
	process: FakeProcessGateway,
	overrides: Partial<Parameters<typeof discoverSessionPlan>[1]> = {},
) {
	return discoverSessionPlan(
		{ modelPolicy: modelPolicyGateway(), process },
		{
			repoRoot: "/repo",
			persistedSessionPath: "/sessions/source.jsonl",
			skill: effectiveSkill(),
			...overrides,
		},
	);
}

describe("session plan discovery schema", () => {
	test.each([
		reference,
		presented,
		ready,
		{ type: "ambiguous", basis: "Two plans remain plausible.", candidates: [reference, presented] },
		{ type: "not-found", reason: "No actionable plan is visible." },
	])("accepts and parses $type", (value) => {
		expect(sessionPlanDiscoverySchema.safeParse(value).success).toBe(true);
		expect(parseSessionPlanDiscoveryOutput(JSON.stringify(value))).toEqual({ ok: true, value });
	});

	test("preserves presented plan Markdown exactly after JSON unescaping", () => {
		const planMarkdown = "\n# Plan \\ paths\n\n  indented\n";
		const result = parseSessionPlanDiscoveryOutput(JSON.stringify({ ...presented, planMarkdown }));
		expect(
			result.ok && result.value.type === "presented-plan" ? result.value.planMarkdown : undefined,
		).toBe(planMarkdown);
	});

	test("rejects unknown fields, invalid paths and slugs, empty ambiguity, and every boundary excess", () => {
		expect(sessionPlanDiscoverySchema.safeParse({ ...reference, extra: true }).success).toBe(false);
		expect(
			sessionPlanDiscoverySchema.safeParse({ ...reference, filePath: "relative.md" }).success,
		).toBe(false);
		expect(
			sessionPlanDiscoverySchema.safeParse({ ...presented, suggestedSlug: "Plan" }).success,
		).toBe(false);
		expect(
			sessionPlanDiscoverySchema.safeParse({ type: "ambiguous", basis: "unclear", candidates: [] })
				.success,
		).toBe(false);
		expect(
			sessionPlanDiscoverySchema.safeParse({
				type: "ambiguous",
				basis: "unclear",
				candidates: Array.from({ length: 6 }, () => reference),
			}).success,
		).toBe(false);
		expect(
			sessionPlanDiscoverySchema.safeParse({
				...reference,
				evidence: Array.from({ length: 9 }, () => "e"),
			}).success,
		).toBe(false);
		expect(
			sessionPlanDiscoverySchema.safeParse({ type: "not-found", reason: "x".repeat(1_025) })
				.success,
		).toBe(false);
		expect(
			sessionPlanDiscoverySchema.safeParse({ ...reference, evidence: ["x".repeat(1_025)] }).success,
		).toBe(false);
		expect(
			sessionPlanDiscoverySchema.safeParse({
				...presented,
				planMarkdown: "x".repeat(SESSION_PLAN_DISCOVERY_LIMITS.maxPlanMarkdownBytes + 1),
			}).success,
		).toBe(false);
	});

	test("accepts prose/fenced JSON and rejects malformed or contradictory output", () => {
		expect(
			parseSessionPlanDiscoveryOutput(`preface ${JSON.stringify(reference)} trailing`),
		).toEqual({ ok: true, value: reference });
		expect(
			parseSessionPlanDiscoveryOutput(`\`\`\`json\n${JSON.stringify(reference)}\n\`\`\``),
		).toEqual({ ok: true, value: reference });
		expect(parseSessionPlanDiscoveryOutput("{bad")).toMatchObject({
			ok: false,
			error: { code: "invalid-output" },
		});
		expect(
			parseSessionPlanDiscoveryOutput(`${JSON.stringify(reference)}\n${JSON.stringify(presented)}`),
		).toMatchObject({ ok: false, error: { code: "invalid-output" } });
		expect(
			parseSessionPlanDiscoveryOutput("x".repeat(SESSION_PLAN_DISCOVERY_LIMITS.maxStdoutBytes + 1)),
		).toMatchObject({ ok: false, error: { code: "stdout-limit" } });
	});
});

describe("session plan discovery runner", () => {
	test("uses the exact isolated fork argv, configured operation, effective skill path, and bounds", async () => {
		const process = successProcess(presented);
		expect(await run(process)).toMatchObject({ ok: true, value: { type: "presented-plan" } });
		expect(process.calls).toEqual([
			{
				cwd: "/repo",
				args: buildSessionPlanDiscoveryArgs("/sessions/source.jsonl", SKILL_PATH, MODEL),
				timeoutMs: 120_000,
				maxStdoutBytes: 256 * 1_024,
			},
		]);
		expect(process.calls[0]?.args).toEqual([
			"--fork",
			"/sessions/source.jsonl",
			"--provider",
			"openai-codex",
			"--model",
			"gpt-5.6-luna",
			"--thinking",
			"minimal",
			"--no-tools",
			"--no-skills",
			"--no-extensions",
			"--no-prompt-templates",
			"--no-context-files",
			"--skill",
			SKILL_PATH,
			"--print",
			"/skill:session-plan-discovery",
		]);
	});

	test.each([
		[{ type: "spawn-failed", message: "missing pi" }, "process-unavailable"],
		[{ type: "exited", code: 2, stdout: "", stderr: "bad" }, "process-exit"],
		[{ type: "timed-out" }, "timeout"],
		[{ type: "cancelled" }, "cancelled"],
		[{ type: "stdout-limit-exceeded" }, "stdout-limit"],
	] as const)("returns process outcome %s as %s", async (processResult, code) => {
		expect(await run(new FakeProcessGateway(processResult))).toMatchObject({
			ok: false,
			error: { code },
		});
	});

	test("fails closed before process execution for invalid session, skill, config, and output", async () => {
		const process = successProcess(reference);
		expect(await run(process, { persistedSessionPath: "" })).toMatchObject({
			ok: false,
			error: { code: "session-unavailable" },
		});
		expect(await run(process, { skill: { ...effectiveSkill(), filePath: "" } })).toMatchObject({
			ok: false,
			error: { code: "skill-unavailable" },
		});
		const invalid = await discoverSessionPlan(
			{ modelPolicy: modelPolicyGateway("[models"), process },
			{ repoRoot: "/repo", persistedSessionPath: "/s", skill: effectiveSkill() },
		);
		expect(invalid).toMatchObject({ ok: false, error: { code: "model-policy" } });
		expect(process.calls).toEqual([]);
		expect(
			await run(
				new FakeProcessGateway({ type: "exited", code: 0, stdout: "not json", stderr: "" }),
			),
		).toMatchObject({ ok: false, error: { code: "invalid-output" } });
		expect(await run(new FakeProcessGateway(new Error("boom")))).toMatchObject({
			ok: false,
			error: { code: "process-unavailable" },
		});
	});
});

describe("process gateway", () => {
	test("maps execution and enforces streaming output and cancellation", async () => {
		const exited = createSessionPlanDiscoveryProcessGateway({
			async exec() {
				return { type: "exited", stdout: "ok", stderr: "", code: 0, signal: null };
			},
		});
		await expect(
			exited.run({ cwd: "/repo", args: [], timeoutMs: 120_000, maxStdoutBytes: 10 }),
		).resolves.toEqual({ type: "exited", stdout: "ok", stderr: "", code: 0 });
		const bounded = createSessionPlanDiscoveryProcessGateway({
			async exec(_command, _args, options) {
				options?.onStdout?.("123456");
				expect(options?.signal?.aborted).toBe(true);
				return { type: "cancelled", stdout: "123456", stderr: "", code: null, signal: "SIGTERM" };
			},
		});
		await expect(
			bounded.run({ cwd: "/repo", args: [], timeoutMs: 120_000, maxStdoutBytes: 5 }),
		).resolves.toEqual({ type: "stdout-limit-exceeded" });
		const abort = new AbortController();
		abort.abort();
		const cancelled = createSessionPlanDiscoveryProcessGateway({
			async exec(_command, _args, options) {
				expect(options?.signal?.aborted).toBe(true);
				return { type: "cancelled", stdout: "", stderr: "", code: null, signal: null };
			},
		});
		await expect(
			cancelled.run({
				cwd: "/repo",
				args: [],
				timeoutMs: 120_000,
				maxStdoutBytes: 5,
				signal: abort.signal,
			}),
		).resolves.toEqual({ type: "cancelled" });
	});
});

describe("effective skill capture", () => {
	test("retains an installed/global exact skill path", () => {
		const captured = captureSessionPlanDiscoverySkill({
			getSystemPromptOptions: () => ({
				skills: [
					{
						name: "session-plan-discovery",
						filePath: SKILL_PATH,
						baseDir: "/global/skills/session-plan-discovery",
					},
				],
			}),
		});
		expect(captured.ok ? captured.value.filePath : undefined).toBe(SKILL_PATH);
	});

	test.each([
		{ skills: undefined },
		{ skills: [] },
		{
			skills: [
				{ name: "session-plan-discovery", filePath: "/one/SKILL.md", baseDir: "/one" },
				{ name: "session-plan-discovery", filePath: "/two/SKILL.md", baseDir: "/two" },
			],
		},
	])("fails closed for unavailable or duplicate skills", ({ skills }) => {
		const captured = captureSessionPlanDiscoverySkill({
			getSystemPromptOptions: () => (skills === undefined ? {} : { skills }),
		});
		expect(captured).toMatchObject({ ok: false, error: { code: "skill-unavailable" } });
	});
});
