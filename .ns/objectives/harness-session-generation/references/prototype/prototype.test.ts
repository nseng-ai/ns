import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SessionProfileViolationError,
  type ClaudeUsage,
  type OutputMode,
  type RawProcessEvidence,
  type ReadOnlyAgentSession,
  type TurnFailureKind,
  type UsageCore,
} from "./contracts.ts";
import {
  FakeClaudeCodeHarness,
  FakeCodexHarness,
  FakeDirectTextExecutor,
  FakeFullFidelityExec,
  RoutingTextGenerator,
  type ClaudeIsolatedSessionFactory,
} from "./prototype.ts";

const successEvidence: RawProcessEvidence = {
  startupError: null,
  exitCode: 0,
  stdout: "",
  stderr: "",
  timedOut: false,
  cancelled: false,
};
const claudeUsage: ClaudeUsage = {
  inputTokens: 12,
  outputTokens: 4,
  cacheReadInputTokens: 2,
  cacheCreationInputTokens: 1,
  costUsd: 0.002,
  durationMs: 80,
  turns: 1,
};

function raw(overrides: Partial<RawProcessEvidence> = {}): RawProcessEvidence {
  return { ...successEvidence, ...overrides };
}

function claudeCompletion(output: unknown, usage: unknown = claudeUsage): RawProcessEvidence {
  return raw({ stdout: JSON.stringify({ result: output, usage }) });
}

function codexCompletion(output: unknown): RawProcessEvidence {
  return raw({ stdout: JSON.stringify({ output }) });
}

function createClaudeHarness(
  turnEvidence: Readonly<Record<string, RawProcessEvidence>>,
  options: {
    readonly acquire?: RawProcessEvidence;
    readonly cleanup?: RawProcessEvidence;
    readonly cleanupThrows?: boolean;
  } = {},
): { readonly harness: FakeClaudeCodeHarness; readonly exec: FakeFullFidelityExec } {
  const evidenceByKey: Record<string, RawProcessEvidence> = {
    "claude:acquire": options.acquire ?? successEvidence,
    "claude:cleanup": options.cleanup ?? successEvidence,
  };
  for (const [input, evidence] of Object.entries(turnEvidence)) {
    evidenceByKey[`claude:turn:${input}`] = evidence;
  }
  const exec = new FakeFullFidelityExec({
    evidenceByKey,
    ...(options.cleanupThrows ? { throwingKeys: new Set(["claude:cleanup"]) } : {}),
  });
  return { harness: new FakeClaudeCodeHarness(exec.channel), exec };
}

function createCodexHarness(turnEvidence: Readonly<Record<string, RawProcessEvidence>>): {
  readonly harness: FakeCodexHarness;
  readonly exec: FakeFullFidelityExec;
} {
  const evidenceByKey: Record<string, RawProcessEvidence> = {
    "codex:acquire": successEvidence,
    "codex:cleanup": successEvidence,
  };
  for (const [input, evidence] of Object.entries(turnEvidence)) {
    evidenceByKey[`codex:turn:${input}`] = evidence;
  }
  const exec = new FakeFullFidelityExec({ evidenceByKey });
  return { harness: new FakeCodexHarness(exec.channel), exec };
}

async function createClaudeReadOnly(
  harness: FakeClaudeCodeHarness,
  outputMode: OutputMode = { type: "text" },
) {
  return harness.createReadOnlyAgentSession({
    modelId: "claude-sonnet-4-6",
    systemPrompt: "Review read-only.",
    outputMode,
    repositoryCwd: "/repo",
    defaultTimeoutMs: 900_000,
  });
}

describe("candidate harness/session contract", () => {
  it("eagerly acquires, threads the full execution contract, and closes exactly once", async () => {
    const { harness, exec } = createClaudeHarness({ draft: claudeCompletion("concise draft") });
    const created = await harness.createIsolatedGenerationSession({
      modelId: "claude-haiku-4-5",
      systemPrompt: "Return plain text.",
      outputMode: { type: "text" },
      defaultTimeoutMs: 120_000,
      advisoryHints: { maxTokens: 512, reasoning: "low" },
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const controller = new AbortController();
    const result = await created.session.runTurn({
      input: "draft",
      signal: controller.signal,
      timeoutMs: 12_345,
    });
    assert.deepEqual(result, {
      ok: true,
      output: { type: "text", text: "concise draft" },
      usage: claudeUsage,
    });
    await created.session.close();
    await created.session.close();

    assert.equal(exec.requests[0]?.purpose, "acquire");
    const turn = exec.requests[1];
    assert.equal(turn?.purpose, "turn");
    assert.equal(turn?.cwd, "/isolated-empty-cwd");
    assert.equal(turn?.env.HARNESS_PROFILE, "isolated-generation");
    assert.equal(turn?.env.HARNESS_PERSIST_HISTORY, "false");
    assert.match(turn?.stdin ?? "", /"input":"draft"/);
    assert.equal(turn?.signal, controller.signal);
    assert.equal(turn?.timeoutMs, 12_345);
    assert.equal(exec.requests.filter((request) => request.purpose === "cleanup").length, 1);
    assert.equal(harness.observations[0]?.cleanupAttempts, 1);
  });

  it("rejects a second isolated turn as profile misuse", async () => {
    const { harness } = createClaudeHarness({ first: claudeCompletion("one") });
    const created = await harness.createIsolatedGenerationSession({
      modelId: "claude-haiku-4-5",
      systemPrompt: "system",
      outputMode: { type: "text" },
      defaultTimeoutMs: 120_000,
      advisoryHints: {},
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await created.session.runTurn({ input: "first" });
    await assert.rejects(
      created.session.runTurn({ input: "second" }),
      (error: unknown) =>
        error instanceof SessionProfileViolationError && error.code === "session-profile-violation",
    );
  });

  it("rejects Codex isolated generation explicitly instead of weakening guarantees", async () => {
    const { harness, exec } = createCodexHarness({});
    const created = await harness.createIsolatedGenerationSession({
      modelId: "gpt-5.4-mini",
      systemPrompt: "system",
      outputMode: { type: "text" },
      defaultTimeoutMs: 120_000,
      advisoryHints: {},
    });
    assert.equal(created.ok, false);
    if (created.ok) return;
    assert.equal(created.kind, "unsupported-profile");
    assert.equal(exec.requests.length, 0);
  });

  it("passes structured schema to transport and parses structured output for both harnesses", async () => {
    const structuredMode = {
      type: "structured",
      schema: { type: "object", required: ["findings"] },
    } as const satisfies OutputMode;
    const { harness: claude, exec: claudeExec } = createClaudeHarness({
      review: claudeCompletion({ findings: [{ message: "Claude finding" }] }),
    });
    const { harness: codex, exec: codexExec } = createCodexHarness({
      review: codexCompletion({ findings: [{ message: "Codex finding" }] }),
    });
    const claudeCreated = await createClaudeReadOnly(claude, structuredMode);
    const codexCreated = await codex.createReadOnlyAgentSession({
      modelId: "gpt-5.4",
      systemPrompt: "Review read-only.",
      outputMode: structuredMode,
      repositoryCwd: "/repo",
      defaultTimeoutMs: 900_000,
    });
    assert.equal(claudeCreated.ok, true);
    assert.equal(codexCreated.ok, true);
    if (!claudeCreated.ok || !codexCreated.ok) return;

    const sessions: ReadonlyArray<ReadOnlyAgentSession<UsageCore | null, typeof structuredMode>> = [
      claudeCreated.session,
      codexCreated.session,
    ];
    const results = await Promise.all(
      sessions.map((session) => session.runTurn({ input: "review" })),
    );
    assert.deepEqual(
      results.map((result) => (result.ok ? result.output.value : result.kind)),
      [{ findings: [{ message: "Claude finding" }] }, { findings: [{ message: "Codex finding" }] }],
    );
    assert.deepEqual(claudeExec.requests[1]?.structuredOutputSchema, structuredMode.schema);
    assert.deepEqual(codexExec.requests[1]?.structuredOutputSchema, structuredMode.schema);
    assert.ok(claudeExec.requests[1]?.args.includes("--output-schema-transport"));
  });

  it("classifies all seven failures from raw process evidence and provider diagnostics", async () => {
    const { harness: claude } = createClaudeHarness({
      invocation: raw({ startupError: "ENOENT", exitCode: null }),
      auth: raw({ exitCode: 1, stderr: "Please login to Claude Code" }),
      cancel: raw({ exitCode: null, stderr: "SIGTERM", cancelled: true }),
      empty: claudeCompletion("  "),
    });
    const { harness: codex } = createCodexHarness({
      execution: raw({ exitCode: 1, stderr: "sandbox failed" }),
      timeout: raw({ exitCode: null, stderr: "SIGKILL", timedOut: true }),
      invalid: raw({ stdout: "not json" }),
    });
    const claudeCreated = await createClaudeReadOnly(claude);
    const codexCreated = await codex.createReadOnlyAgentSession({
      modelId: "gpt-5.4",
      systemPrompt: "system",
      outputMode: { type: "text" },
      repositoryCwd: "/repo",
      defaultTimeoutMs: 900_000,
    });
    assert.equal(claudeCreated.ok, true);
    assert.equal(codexCreated.ok, true);
    if (!claudeCreated.ok || !codexCreated.ok) return;

    const cases = [
      [claudeCreated.session, "invocation", "invocation-failed"],
      [claudeCreated.session, "auth", "auth-failed"],
      [codexCreated.session, "execution", "execution-failed"],
      [claudeCreated.session, "cancel", "cancelled"],
      [codexCreated.session, "timeout", "timed-out"],
      [claudeCreated.session, "empty", "empty-output"],
      [codexCreated.session, "invalid", "invalid-output"],
    ] as const;
    const kinds: TurnFailureKind[] = [];
    for (const [session, input, expectedKind] of cases) {
      const result = await session.runTurn({ input });
      assert.equal(result.ok, false);
      if (result.ok) continue;
      assert.equal(result.kind, expectedKind);
      kinds.push(result.kind);
    }
    assert.deepEqual(kinds, [
      "invocation-failed",
      "auth-failed",
      "execution-failed",
      "cancelled",
      "timed-out",
      "empty-output",
      "invalid-output",
    ]);
  });

  it("uses finite default timeout and supplied cancellation signal on turns", async () => {
    const { harness, exec } = createClaudeHarness({
      default: claudeCompletion("one"),
      override: claudeCompletion("two"),
    });
    const created = await createClaudeReadOnly(harness);
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await created.session.runTurn({ input: "default" });
    const controller = new AbortController();
    await created.session.runTurn({ input: "override", timeoutMs: 17, signal: controller.signal });
    const turns = exec.requests.filter((request) => request.purpose === "turn");
    assert.equal(turns[0]?.timeoutMs, 900_000);
    assert.ok(turns[0]?.signal instanceof AbortSignal);
    assert.equal(turns[1]?.timeoutMs, 17);
    assert.equal(turns[1]?.signal, controller.signal);
  });

  it("keeps read-only history session-local and disables persistence", async () => {
    const { harness, exec } = createClaudeHarness({
      first: claudeCompletion("one"),
      second: claudeCompletion("two"),
    });
    const created = await createClaudeReadOnly(harness);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await created.session.runTurn({ input: "first" });
    await created.session.runTurn({ input: "second" });

    const turns = exec.requests.filter((request) => request.purpose === "turn");
    assert.deepEqual(JSON.parse(turns[0]?.stdin ?? "{}").history, []);
    assert.deepEqual(JSON.parse(turns[1]?.stdin ?? "{}").history, ["first"]);
    assert.equal(turns[1]?.env.HARNESS_HISTORY, "session-local");
    assert.equal(turns[1]?.env.HARNESS_PERSIST_HISTORY, "false");
    assert.ok(turns[1]?.args.includes("--no-persist-history"));
  });

  it("degrades malformed Claude usage to null without losing successful output", async () => {
    const { harness } = createClaudeHarness({
      draft: claudeCompletion("draft", { inputTokens: 1 }),
    });
    const created = await createClaudeReadOnly(harness);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const result = await created.session.runTurn({ input: "draft" });
    assert.deepEqual(result, {
      ok: true,
      output: { type: "text", text: "draft" },
      usage: null,
    });
  });

  it("reports eager acquisition failure and makes cleanup failure nonthrowing", async () => {
    const failed = createClaudeHarness(
      {},
      {
        acquire: raw({ startupError: "spawn ENOENT", exitCode: null }),
      },
    );
    const notCreated = await createClaudeReadOnly(failed.harness);
    assert.deepEqual(notCreated, {
      ok: false,
      kind: "resource-acquisition-failed",
      message: "spawn ENOENT",
    });

    const cleanupFailure = createClaudeHarness(
      { draft: claudeCompletion("ok") },
      { cleanupThrows: true },
    );
    const created = await createClaudeReadOnly(cleanupFailure.harness);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    await assert.doesNotReject(created.session.close());
    await assert.doesNotReject(created.session.close());
    assert.equal(cleanupFailure.harness.observations[0]?.cleanupAttempts, 1);
  });

  it("routes through an isolated-session factory seam and closes on terminal failure", async () => {
    const { harness: claude } = createClaudeHarness({
      draft: raw({ exitCode: 1, stderr: "CLI failed" }),
    });
    const seam: ClaudeIsolatedSessionFactory = claude;
    const generator = new RoutingTextGenerator({
      direct: new FakeDirectTextExecutor({}),
      claudeCode: seam,
      isolatedClaudeModelRefs: new Set(["anthropic/claude-haiku-4-5"]),
    });
    const result = await generator.generateText({
      modelRef: "anthropic/claude-haiku-4-5",
      system: "system",
      prompt: "draft",
    });
    assert.deepEqual(result, { ok: false, error: "execution-failed: CLI failed" });
    assert.equal(claude.observations[0]?.cleanupAttempts, 1);
  });

  it("composes direct and harness generation and rejects empty direct output", async () => {
    const direct = new FakeDirectTextExecutor({
      "openai-codex/gpt-5.4-mini": {
        ok: true,
        text: "direct result",
        usage: { inputTokens: 5, outputTokens: 2 },
      },
      "openai-codex/empty": {
        ok: true,
        text: "  ",
        usage: { inputTokens: 1, outputTokens: 0 },
      },
    });
    const { harness: claude } = createClaudeHarness({
      "harness request": claudeCompletion("harness result"),
    });
    const generator = new RoutingTextGenerator({
      direct,
      claudeCode: claude,
      isolatedClaudeModelRefs: new Set(["anthropic/claude-haiku-4-5"]),
    });

    const directResult = await generator.generateText({
      modelRef: "openai-codex/gpt-5.4-mini",
      system: "system",
      prompt: "direct request",
    });
    const harnessResult = await generator.generateText({
      modelRef: "anthropic/claude-haiku-4-5",
      system: "system",
      prompt: "harness request",
    });
    const emptyResult = await generator.generateText({
      modelRef: "openai-codex/empty",
      system: "system",
      prompt: "empty",
    });

    assert.equal(directResult.ok && directResult.text, "direct result");
    assert.equal(harnessResult.ok && harnessResult.text, "harness result");
    assert.deepEqual(emptyResult, {
      ok: false,
      error: "empty-output: Direct generation returned empty text.",
    });
  });

  it("rejects malformed qualified model references before invoking either route", async () => {
    const direct = new FakeDirectTextExecutor({});
    const { harness: claude, exec } = createClaudeHarness({});
    const generator = new RoutingTextGenerator({
      direct,
      claudeCode: claude,
      isolatedClaudeModelRefs: new Set(),
    });

    for (const modelRef of [
      "unqualified",
      "/model",
      "provider/",
      "a/b/c",
      "Provider/model",
      "a/b c",
    ]) {
      assert.deepEqual(
        await generator.generateText({ modelRef, system: "system", prompt: "prompt" }),
        { ok: false, error: `invalid-model-ref: ${modelRef}` },
      );
    }
    assert.equal(direct.requests.length, 0);
    assert.equal(exec.requests.length, 0);
  });
});
