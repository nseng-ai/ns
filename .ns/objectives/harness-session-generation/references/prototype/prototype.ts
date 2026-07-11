import type {
  ClaudeUsage,
  FullFidelityExecChannel,
  FullFidelityExecRequest,
  IsolatedGenerationOptions,
  IsolatedGenerationSession,
  JsonValue,
  OutputMode,
  RawProcessEvidence,
  ReadOnlyAgentOptions,
  ReadOnlyAgentSession,
  SessionFactoryResult,
  TurnDiagnostics,
  TurnFailure,
  TurnRequest,
  TurnResult,
  UsageCore,
} from "./contracts.ts";
import { createFullFidelityExecChannel, SessionProfileViolationError } from "./contracts.ts";

const TEXT_MODE = { type: "text" } as const;
const ACQUISITION_TIMEOUT_MS = 5_000;
const CLEANUP_TIMEOUT_MS = 5_000;
const ISOLATED_CWD = "/isolated-empty-cwd";

export interface SessionObservation {
  readonly profile: "isolated-generation" | "read-only-agent";
  readonly modelId: string;
  readonly systemPrompt: string;
  readonly repositoryCwd?: string;
  readonly defaultTimeoutMs: number;
  readonly historyPolicy: "none" | "session-local";
  readonly persistencePolicy: "disabled";
  readonly turnInputs: readonly string[];
  readonly cleanupAttempts: number;
}

interface MutableSessionObservation {
  readonly profile: "isolated-generation" | "read-only-agent";
  readonly modelId: string;
  readonly systemPrompt: string;
  readonly repositoryCwd?: string;
  readonly defaultTimeoutMs: number;
  readonly historyPolicy: "none" | "session-local";
  readonly persistencePolicy: "disabled";
  readonly turnInputs: string[];
  cleanupAttempts: number;
}

export interface FakeExecFixture {
  readonly evidenceByKey: Readonly<Record<string, RawProcessEvidence>>;
  readonly throwingKeys?: ReadonlySet<string>;
}

export class FakeFullFidelityExec {
  readonly requests: FullFidelityExecRequest[] = [];
  readonly channel: FullFidelityExecChannel;
  private readonly fixture: FakeExecFixture;

  constructor(fixture: FakeExecFixture) {
    this.fixture = fixture;
    this.channel = createFullFidelityExecChannel(async (request) => {
      this.requests.push(copyExecRequest(request));
      const key = execRequestKey(request);
      if (this.fixture.throwingKeys?.has(key) === true) {
        throw new Error(`fake execute throw for ${key}`);
      }
      return (
        this.fixture.evidenceByKey[key] ?? {
          startupError: null,
          exitCode: 1,
          stdout: "",
          stderr: `No raw fixture for ${key}`,
          isTimedOut: false,
          isCancelled: false,
        }
      );
    });
  }
}

export function execRequestKey(request: FullFidelityExecRequest): string {
  if (request.purpose === "turn") {
    const payload = parseObject(request.stdin);
    return `${request.command}:turn:${typeof payload?.input === "string" ? payload.input : "?"}`;
  }
  return `${request.command}:${request.purpose}`;
}

function copyExecRequest(request: FullFidelityExecRequest): FullFidelityExecRequest {
  return {
    ...request,
    args: [...request.args],
    env: { ...request.env },
  };
}

export class FakeClaudeCodeHarness {
  readonly observations: MutableSessionObservation[] = [];
  private readonly exec: FullFidelityExecChannel;

  constructor(exec: FullFidelityExecChannel) {
    this.exec = exec;
  }

  async createIsolatedGenerationSession(
    options: IsolatedGenerationOptions,
  ): Promise<SessionFactoryResult<IsolatedGenerationSession<ClaudeUsage | null>>> {
    const observation = createObservation("isolated-generation", options);
    const acquired = await acquireResource(this.exec, "claude", observation, ISOLATED_CWD);
    if (!acquired.ok) return acquired;
    this.observations.push(observation);
    return {
      ok: true,
      session: new ClaudeSession(
        "isolated-generation",
        options,
        this.exec,
        observation,
        ISOLATED_CWD,
        true,
      ),
    };
  }

  async createReadOnlyAgentSession(
    options: ReadOnlyAgentOptions,
  ): Promise<SessionFactoryResult<ReadOnlyAgentSession<ClaudeUsage | null>>> {
    const observation = createObservation("read-only-agent", options);
    const acquired = await acquireResource(this.exec, "claude", observation, options.repositoryCwd);
    if (!acquired.ok) return acquired;
    this.observations.push(observation);
    return {
      ok: true,
      session: new ClaudeSession(
        "read-only-agent",
        options,
        this.exec,
        observation,
        options.repositoryCwd,
        false,
      ),
    };
  }
}

export class FakeCodexHarness {
  readonly observations: MutableSessionObservation[] = [];
  private readonly exec: FullFidelityExecChannel;

  constructor(exec: FullFidelityExecChannel) {
    this.exec = exec;
  }

  async createIsolatedGenerationSession(
    _options: IsolatedGenerationOptions,
  ): Promise<SessionFactoryResult<IsolatedGenerationSession<null>>> {
    return {
      ok: false,
      kind: "unsupported-profile",
      message:
        "Codex cannot guarantee zero tools, ambient-skill suppression, global-instruction suppression, or system-prompt replacement.",
    };
  }

  async createReadOnlyAgentSession(
    options: ReadOnlyAgentOptions,
  ): Promise<SessionFactoryResult<ReadOnlyAgentSession<null>>> {
    const observation = createObservation("read-only-agent", options);
    const acquired = await acquireResource(this.exec, "codex", observation, options.repositoryCwd);
    if (!acquired.ok) return acquired;
    this.observations.push(observation);
    return {
      ok: true,
      session: new CodexSession(options, this.exec, observation),
    };
  }
}

abstract class StatefulSession<TUsage extends UsageCore | null> {
  abstract readonly profile: "isolated-generation" | "read-only-agent";
  protected readonly outputMode: OutputMode;
  protected readonly observation: MutableSessionObservation;
  private readonly isSingleTurn: boolean;
  private readonly exec: FullFidelityExecChannel;
  private readonly command: "claude" | "codex";
  private readonly cwd: string;
  private isClosed = false;

  constructor(options: {
    outputMode: OutputMode;
    observation: MutableSessionObservation;
    isSingleTurn: boolean;
    exec: FullFidelityExecChannel;
    command: "claude" | "codex";
    cwd: string;
  }) {
    this.outputMode = options.outputMode;
    this.observation = options.observation;
    this.isSingleTurn = options.isSingleTurn;
    this.exec = options.exec;
    this.command = options.command;
    this.cwd = options.cwd;
  }

  async runTurn(request: TurnRequest): Promise<TurnResult<TUsage>> {
    if (this.isClosed) {
      throw new SessionProfileViolationError("Cannot run a turn after the session is closed.");
    }
    if (this.isSingleTurn && this.observation.turnInputs.length > 0) {
      throw new SessionProfileViolationError(
        "The isolated-generation profile permits exactly one turn.",
      );
    }

    const priorInputs = [...this.observation.turnInputs];
    this.observation.turnInputs.push(request.input);
    const signal = request.signal ?? new AbortController().signal;
    const timeoutMs = request.timeoutMs ?? this.observation.defaultTimeoutMs;
    const evidence = await this.exec.execute({
      purpose: "turn",
      command: this.command,
      args: buildTurnArgs(this.command, this.observation, this.outputMode),
      cwd: this.cwd,
      env: buildEnvironment(this.observation),
      stdin: JSON.stringify({
        model: this.observation.modelId,
        system: this.observation.systemPrompt,
        input: request.input,
        history: this.observation.historyPolicy === "session-local" ? priorInputs : [],
      }),
      signal,
      timeoutMs,
      ...(this.outputMode.type === "structured"
        ? { structuredOutputSchema: this.outputMode.schema }
        : {}),
    });
    return this.mapEvidence(evidence);
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    this.observation.cleanupAttempts += 1;
    try {
      await this.exec.execute({
        purpose: "cleanup",
        command: this.command,
        args: ["session", "cleanup"],
        cwd: this.cwd,
        env: buildEnvironment(this.observation),
        stdin: "",
        signal: new AbortController().signal,
        timeoutMs: CLEANUP_TIMEOUT_MS,
      });
    } catch {
      // Cleanup is deliberately best-effort and close must never mask the turn result.
    }
  }

  protected abstract mapEvidence(evidence: RawProcessEvidence): TurnResult<TUsage>;
}

class ClaudeSession<TProfile extends "isolated-generation" | "read-only-agent"> extends StatefulSession<
  ClaudeUsage | null
> {
  readonly profile: TProfile;
  readonly repositoryCwd: string;

  constructor(
    profile: TProfile,
    options: IsolatedGenerationOptions | ReadOnlyAgentOptions,
    exec: FullFidelityExecChannel,
    observation: MutableSessionObservation,
    cwd: string,
    isSingleTurn: boolean,
  ) {
    super({
      outputMode: options.outputMode,
      observation,
      isSingleTurn,
      exec,
      command: "claude",
      cwd,
    });
    this.profile = profile;
    this.repositoryCwd = profile === "read-only-agent" ? cwd : "";
  }

  protected mapEvidence(evidence: RawProcessEvidence): TurnResult<ClaudeUsage | null> {
    return mapRawEvidence({
      provider: "claude",
      evidence,
      outputMode: this.outputMode,
      parseCompletion: parseClaudeCompletion,
    });
  }
}

class CodexSession extends StatefulSession<null> implements ReadOnlyAgentSession<null> {
  readonly profile = "read-only-agent" as const;
  readonly repositoryCwd: string;

  constructor(
    options: ReadOnlyAgentOptions,
    exec: FullFidelityExecChannel,
    observation: MutableSessionObservation,
  ) {
    super({
      outputMode: options.outputMode,
      observation,
      isSingleTurn: false,
      exec,
      command: "codex",
      cwd: options.repositoryCwd,
    });
    this.repositoryCwd = options.repositoryCwd;
  }

  protected mapEvidence(evidence: RawProcessEvidence): TurnResult<null> {
    return mapRawEvidence({
      provider: "codex",
      evidence,
      outputMode: this.outputMode,
      parseCompletion: parseCodexCompletion,
    });
  }
}

function createObservation(
  profile: "isolated-generation" | "read-only-agent",
  options: IsolatedGenerationOptions | ReadOnlyAgentOptions,
): MutableSessionObservation {
  return {
    profile,
    modelId: options.modelId,
    systemPrompt: options.systemPrompt,
    ...(profile === "read-only-agent" && "repositoryCwd" in options
      ? { repositoryCwd: options.repositoryCwd }
      : {}),
    defaultTimeoutMs: options.defaultTimeoutMs,
    historyPolicy: profile === "read-only-agent" ? "session-local" : "none",
    persistencePolicy: "disabled",
    turnInputs: [],
    cleanupAttempts: 0,
  };
}

async function acquireResource(
  exec: FullFidelityExecChannel,
  command: "claude" | "codex",
  observation: MutableSessionObservation,
  cwd: string,
): Promise<
  | { readonly ok: true }
  | { readonly ok: false; readonly kind: "resource-acquisition-failed"; readonly message: string }
> {
  let evidence: RawProcessEvidence;
  try {
    evidence = await exec.execute({
      purpose: "acquire",
      command,
      args: ["session", "acquire", observation.profile],
      cwd,
      env: buildEnvironment(observation),
      stdin: "",
      signal: new AbortController().signal,
      timeoutMs: ACQUISITION_TIMEOUT_MS,
    });
  } catch (error) {
    return {
      ok: false,
      kind: "resource-acquisition-failed",
      message: error instanceof Error ? error.message : "Resource acquisition threw.",
    };
  }
  if (evidence.startupError !== null || evidence.exitCode !== 0) {
    return {
      ok: false,
      kind: "resource-acquisition-failed",
      message:
        evidence.startupError ??
        stderrOrFallback(evidence.stderr, `${command} acquisition failed`),
    };
  }
  return { ok: true };
}

function buildEnvironment(
  observation: MutableSessionObservation,
): Readonly<Record<string, string>> {
  return {
    HARNESS_PROFILE: observation.profile,
    HARNESS_HISTORY: observation.historyPolicy,
    HARNESS_PERSIST_HISTORY: "false",
  };
}

function buildTurnArgs(
  command: "claude" | "codex",
  observation: MutableSessionObservation,
  outputMode: OutputMode,
): readonly string[] {
  return [
    "run",
    "--model",
    observation.modelId,
    "--read-only",
    "--no-persist-history",
    ...(command === "claude" && observation.profile === "isolated-generation"
      ? ["--safe-mode"]
      : []),
    ...(outputMode.type === "structured" ? ["--output-schema-transport"] : []),
  ];
}

interface ParsedCompletion<TUsage extends UsageCore | null> {
  readonly output: unknown;
  readonly usage: TUsage;
}

interface MapRawEvidenceOptions<TUsage extends UsageCore | null> {
  readonly provider: "claude" | "codex";
  readonly evidence: RawProcessEvidence;
  readonly outputMode: OutputMode;
  readonly parseCompletion: (stdout: string) => ParsedCompletion<TUsage> | null;
}

function mapRawEvidence<TUsage extends UsageCore | null>(
  options: MapRawEvidenceOptions<TUsage>,
): TurnResult<TUsage> {
  const { provider, evidence, outputMode, parseCompletion } = options;
  const diagnostics = { exitCode: evidence.exitCode, stderr: evidence.stderr };
  if (evidence.startupError !== null) {
    return turnFailure("invocation-failed", evidence.startupError, diagnostics);
  }
  if (evidence.isCancelled) {
    return turnFailure("cancelled", `${provider} turn cancelled.`, diagnostics);
  }
  if (evidence.isTimedOut) {
    return turnFailure("timed-out", `${provider} turn timed out.`, diagnostics);
  }
  if (evidence.exitCode !== 0) {
    if (isAuthenticationDiagnostic(provider, evidence.stderr)) {
      return turnFailure("auth-failed", evidence.stderr, diagnostics);
    }
    return turnFailure(
      "execution-failed",
      stderrOrFallback(evidence.stderr, `${provider} exited unsuccessfully.`),
      diagnostics,
    );
  }

  const completion = parseCompletion(evidence.stdout);
  if (completion === null) {
    return turnFailure(
      "invalid-output",
      `Could not parse ${provider} transport output.`,
      diagnostics,
    );
  }
  return completedResult({
    output: completion.output,
    usage: completion.usage,
    diagnostics,
    outputMode,
  });
}

function stderrOrFallback(stderr: string, fallback: string): string {
  return stderr === "" ? fallback : stderr;
}

function isAuthenticationDiagnostic(provider: "claude" | "codex", stderr: string): boolean {
  return provider === "claude"
    ? /please (log in|login)|authentication required/i.test(stderr)
    : /401|unauthorized|not authenticated/i.test(stderr);
}

function parseClaudeCompletion(stdout: string): ParsedCompletion<ClaudeUsage | null> | null {
  const value = parseObject(stdout);
  if (value === null || !("result" in value)) return null;
  return { output: value.result, usage: parseClaudeUsage(value.usage) };
}

function parseCodexCompletion(stdout: string): ParsedCompletion<null> | null {
  const value = parseObject(stdout);
  if (value === null || !("output" in value)) return null;
  return { output: value.output, usage: null };
}

function parseClaudeUsage(value: unknown): ClaudeUsage | null {
  if (!isRecord(value)) return null;
  const {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    costUsd,
    durationMs,
    turns,
  } = value;
  if (
    typeof inputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    typeof cacheReadInputTokens !== "number" ||
    typeof cacheCreationInputTokens !== "number" ||
    typeof costUsd !== "number" ||
    typeof durationMs !== "number" ||
    typeof turns !== "number"
  ) {
    return null;
  }
  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    costUsd,
    durationMs,
    turns,
  };
}

interface CompletedResultOptions<TUsage extends UsageCore | null> {
  readonly output: unknown;
  readonly usage: TUsage;
  readonly diagnostics: TurnDiagnostics;
  readonly outputMode: OutputMode;
}

function completedResult<TUsage extends UsageCore | null>(
  options: CompletedResultOptions<TUsage>,
): TurnResult<TUsage> {
  const { output, usage, diagnostics, outputMode } = options;
  if (outputMode.type === "text") {
    if (typeof output !== "string") {
      return turnFailure("invalid-output", "Expected text output.", diagnostics);
    }
    if (!isNonEmptyText(output)) {
      return turnFailure("empty-output", "Harness returned empty text.", diagnostics);
    }
    return {
      ok: true,
      output: { type: "text", text: output },
      usage,
    };
  }
  if (!isJsonValue(output)) {
    return turnFailure(
      "invalid-output",
      "Expected transport-parsed structured output.",
      diagnostics,
    );
  }
  return {
    ok: true,
    output: { type: "structured", value: output },
    usage,
  };
}

function isNonEmptyText(text: string): boolean {
  return text.trim().length > 0;
}

function turnFailure(
  kind: TurnFailure["kind"],
  message: string,
  diagnostics: TurnDiagnostics,
): TurnFailure {
  return { ok: false, kind, message, diagnostics };
}

function parseObject(input: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(input);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

export interface DirectTextRequest {
  readonly modelRef: string;
  readonly system: string;
  readonly prompt: string;
  readonly maxTokens?: number;
  readonly reasoning?: "minimal" | "low";
}

export type DirectTextResult =
  | { readonly ok: true; readonly text: string; readonly usage: UsageCore }
  | { readonly ok: false; readonly message: string };

export interface DirectTextExecutor {
  execute(request: DirectTextRequest): Promise<DirectTextResult>;
}

export type TextGenerationRequest = DirectTextRequest;

export type TextGenerationResult =
  | { readonly ok: true; readonly text: string; readonly usage?: UsageCore }
  | { readonly ok: false; readonly error: string };

export class FakeDirectTextExecutor implements DirectTextExecutor {
  readonly requests: DirectTextRequest[] = [];
  private readonly resultsByModelRef: Readonly<Record<string, DirectTextResult>>;

  constructor(resultsByModelRef: Readonly<Record<string, DirectTextResult>>) {
    this.resultsByModelRef = resultsByModelRef;
  }

  async execute(request: DirectTextRequest): Promise<DirectTextResult> {
    this.requests.push({ ...request });
    return (
      this.resultsByModelRef[request.modelRef] ?? {
        ok: false,
        message: `No direct fixture for ${request.modelRef}.`,
      }
    );
  }
}

export interface ClaudeIsolatedSessionFactory {
  createIsolatedGenerationSession(
    options: IsolatedGenerationOptions,
  ): Promise<SessionFactoryResult<IsolatedGenerationSession<ClaudeUsage | null>>>;
}

export interface RoutingTextGeneratorOptions {
  readonly direct: DirectTextExecutor;
  readonly claudeCode: ClaudeIsolatedSessionFactory;
  readonly isolatedClaudeModelRefs: ReadonlySet<string>;
}

export class RoutingTextGenerator {
  private readonly direct: DirectTextExecutor;
  private readonly claudeCode: ClaudeIsolatedSessionFactory;
  private readonly isolatedClaudeModelRefs: ReadonlySet<string>;

  constructor(options: RoutingTextGeneratorOptions) {
    this.direct = options.direct;
    this.claudeCode = options.claudeCode;
    this.isolatedClaudeModelRefs = new Set(options.isolatedClaudeModelRefs);
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    const model = parseQualifiedModelRef(request.modelRef);
    if (model === null) {
      return { ok: false, error: `invalid-model-ref: ${request.modelRef}` };
    }
    if (!this.isolatedClaudeModelRefs.has(request.modelRef)) {
      const result = await this.direct.execute(request);
      if (!result.ok) return { ok: false, error: result.message };
      if (!isNonEmptyText(result.text)) {
        return { ok: false, error: "empty-output: Direct generation returned empty text." };
      }
      return result;
    }

    const created = await this.claudeCode.createIsolatedGenerationSession({
      modelId: model.modelId,
      systemPrompt: request.system,
      outputMode: TEXT_MODE,
      defaultTimeoutMs: 120_000,
      advisoryHints: {
        ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
        ...(request.reasoning === undefined ? {} : { reasoning: request.reasoning }),
      },
    });
    if (!created.ok) {
      return { ok: false, error: `${created.kind}: ${created.message}` };
    }

    try {
      const result = await created.session.runTurn({ input: request.prompt });
      if (!result.ok) return { ok: false, error: `${result.kind}: ${result.message}` };
      if (result.output.type !== "text") {
        return { ok: false, error: "invalid-output: Harness returned structured output." };
      }
      return {
        ok: true,
        text: result.output.text,
        ...(result.usage === null
          ? {}
          : {
              usage: {
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
              },
            }),
      };
    } finally {
      await created.session.close();
    }
  }
}

function parseQualifiedModelRef(
  modelRef: string,
): { readonly provider: string; readonly modelId: string } | null {
  const match = /^([a-z0-9][a-z0-9-]*)\/([^/\s]+)$/.exec(modelRef);
  if (match === null) return null;
  const provider = match[1];
  const modelId = match[2];
  if (provider === undefined || modelId === undefined) return null;
  return { provider, modelId };
}
