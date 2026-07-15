// Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod
// tempor incididunt ut labore et dolore magna aliqua.

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface UsageCore {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface ClaudeUsage extends UsageCore {
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly costUsd: number;
  readonly durationMs: number;
  readonly turns: number;
}

export type OutputMode =
  | { readonly type: "text" }
  | { readonly type: "structured"; readonly schema: JsonValue };

export type TurnOutput =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "structured"; readonly value: JsonValue };

export interface TurnDiagnostics {
  readonly exitCode: number | null;
  readonly stderr: string;
}

export type TurnFailureKind =
  | "invocation-failed"
  | "auth-failed"
  | "execution-failed"
  | "cancelled"
  | "timed-out"
  | "empty-output"
  | "invalid-output";

export interface TurnFailure {
  readonly ok: false;
  readonly kind: TurnFailureKind;
  readonly message: string;
  readonly diagnostics: TurnDiagnostics;
}

export interface TurnSuccess<out TUsage extends UsageCore | null> {
  readonly ok: true;
  readonly output: TurnOutput;
  readonly usage: TUsage;
}

export type TurnResult<TUsage extends UsageCore | null> = TurnSuccess<TUsage> | TurnFailure;

export interface TurnRequest {
  readonly input: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface HarnessSession<out TUsage extends UsageCore | null> {
  readonly profile: "isolated-generation" | "read-only-agent";
  runTurn(request: TurnRequest): Promise<TurnResult<TUsage>>;
  close(): Promise<void>;
}

export interface IsolatedGenerationSession<out TUsage extends UsageCore | null>
  extends HarnessSession<TUsage> {
  readonly profile: "isolated-generation";
}

export interface ReadOnlyAgentSession<out TUsage extends UsageCore | null>
  extends HarnessSession<TUsage> {
  readonly profile: "read-only-agent";
  readonly repositoryCwd: string;
}

export interface IsolatedGenerationOptions {
  readonly modelId: string;
  readonly systemPrompt: string;
  readonly outputMode: OutputMode;
  readonly defaultTimeoutMs: number;
  readonly advisoryHints: {
    readonly maxTokens?: number;
    readonly reasoning?: "minimal" | "low";
  };
}

export interface ReadOnlyAgentOptions {
  readonly modelId: string;
  readonly systemPrompt: string;
  readonly outputMode: OutputMode;
  readonly repositoryCwd: string;
  readonly defaultTimeoutMs: number;
}

export type SessionFactoryFailure =
  | {
      readonly ok: false;
      readonly kind: "unsupported-profile" | "preflight-failed";
      readonly message: string;
    }
  | {
      readonly ok: false;
      readonly kind: "resource-acquisition-failed";
      readonly message: string;
    };

export type SessionFactoryResult<TSession> =
  | { readonly ok: true; readonly session: TSession }
  | SessionFactoryFailure;

export class SessionProfileViolationError extends Error {
  readonly code = "session-profile-violation";

  constructor(message: string) {
    super(message);
    this.name = "SessionProfileViolationError";
  }
}

export interface FullFidelityExecRequest {
  readonly purpose: "acquire" | "turn" | "cleanup";
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdin: string;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly structuredOutputSchema?: JsonValue;
}

export interface RawProcessEvidence {
  readonly startupError: string | null;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly isTimedOut: boolean;
  readonly isCancelled: boolean;
}

const fullFidelityExecBrand: unique symbol = Symbol("full-fidelity-exec");

export interface FullFidelityExecChannel {
  readonly [fullFidelityExecBrand]: true;
  execute(request: FullFidelityExecRequest): Promise<RawProcessEvidence>;
}

export function createFullFidelityExecChannel(
  execute: (request: FullFidelityExecRequest) => Promise<RawProcessEvidence>,
): FullFidelityExecChannel {
  return { [fullFidelityExecBrand]: true, execute };
}
