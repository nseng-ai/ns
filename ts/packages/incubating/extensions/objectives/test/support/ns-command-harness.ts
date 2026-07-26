import type { ClinkrExit, ClinkrFormat } from "@nseng-ai/clinkr";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { noopNsProgress } from "@nseng-ai/sdk";
import type {
	ExecResult,
	NsCommandSchema,
	NsCommandIo,
	NsExecOptions,
	NsExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/sdk";

type ExitedResult = Extract<ExecResult, { type: "exited" }>;
type ExecResultFixture = Partial<Omit<ExitedResult, "type">> | Exclude<ExecResult, ExitedResult>;

import type { ObjectiveRunnerOverrides } from "../../src/ns/runner-context.ts";
import { nextFromSequence } from "./sequence.ts";

export interface RecordedNsExecCall {
	command: string;
	args: string[];
	options: NsExecOptions | undefined;
}

export interface FakeObjectiveNsApiOptions extends ObjectiveRunnerOverrides {
	cwd?: string;
	env?: Record<string, string | undefined>;
	/** Overrides merged into every recorded `exec` result (defaults to exit 0). */
	execResult?: ExecResultFixture;
	/** Per-call `exec` result overrides; the last value repeats once exhausted. */
	execResults?: readonly ExecResultFixture[];
	outputFormat?: ClinkrFormat;
}

/**
 * NsExtensionApi fake for objective ns command scenario tests: records
 * stdout/stderr chunks and `commandIo.phase` labels, answers `exec` with a
 * canned result, and publishes runner-context gateway overrides through
 * `extensions.objectiveRunner`.
 */
export class FakeObjectiveNsApi implements NsExtensionApi {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly extensions: Readonly<Record<string, unknown>>;
	readonly stdoutChunks: string[] = [];
	readonly stderrChunks: string[] = [];
	readonly phases: string[] = [];
	readonly execCalls: RecordedNsExecCall[] = [];
	readonly textGeneratorCalls: TextGenerationRequest[] = [];
	readonly progress = noopNsProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly hasExtension = () => false;
	readonly outputFormat: ClinkrFormat;
	readonly commandIo: NsCommandIo;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	private readonly execResult: ExecResultFixture;
	private readonly execResults: readonly ExecResultFixture[];
	private execResultIndex = 0;

	constructor(options: FakeObjectiveNsApiOptions = {}) {
		this.cwd = options.cwd ?? "/repo";
		this.env = { HOME: "/home/ns-test", ...(options.env ?? {}) };
		this.execResult = { ...(options.execResult ?? {}) };
		this.execResults = (options.execResults ?? []).map((result) => ({ ...result }));
		this.outputFormat = options.outputFormat ?? "human";
		this.stdout = (text) => {
			this.stdoutChunks.push(text);
		};
		this.stderr = (text) => {
			this.stderrChunks.push(text);
		};
		this.commandIo = {
			phase: (message) => {
				this.phases.push(message);
			},
			notify: () => {},
			message: () => {},
			clearPhase: () => {},
		};
		this.extensions = {
			objectiveRunner: optionalEntries({
				git: options.git,
				graphite: options.graphite,
				commands: options.commands,
				storage: options.storage,
				readTextFile: options.readTextFile,
				filePresence: options.filePresence,
			}),
		};
	}

	async exec(command: string, args: string[], options?: NsExecOptions): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const sequenced = nextFromSequence(this.execResults, this.execResultIndex);
		this.execResultIndex = sequenced.nextIndex;
		return execResultFromFixtures(this.execResult, sequenced.value);
	}

	readonly textGenerator = {
		generateText: async (request: TextGenerationRequest): Promise<TextGenerationResult> => {
			this.textGeneratorCalls.push({ ...request });
			throw new Error("Unexpected text-generation call in objective ns command test.");
		},
	};
}

function execResultFromFixtures(
	defaults: ExecResultFixture,
	override: ExecResultFixture | undefined,
): ExecResult {
	if (override !== undefined && "type" in override) return override;
	if ("type" in defaults) return defaults;
	return {
		type: "exited",
		stdout: override?.stdout ?? defaults.stdout ?? "",
		stderr: override?.stderr ?? defaults.stderr ?? "",
		code: override?.code ?? defaults.code ?? 0,
		signal: override?.signal ?? defaults.signal ?? null,
	};
}

export function createFakeObjectiveNsApi(
	options: FakeObjectiveNsApiOptions = {},
): FakeObjectiveNsApi {
	return new FakeObjectiveNsApi(options);
}

export async function runObjectiveCommand<S extends NsCommandSchema, T>(
	command: import("@nseng-ai/clinkr").ClinkrCommandDefinition<NsExtensionApi, S, T>,
	request: unknown,
	options: { api?: NsExtensionApi } = {},
): Promise<ClinkrExit<T>> {
	const parsedRequest = command.schema.parse(request);
	const exit = await command.handler(options.api ?? createFakeObjectiveNsApi(), parsedRequest);
	if (!isClinkrExit<T>(exit)) {
		throw new Error("Objective command returned a non-Clinkr result.");
	}
	return exit;
}

function isClinkrExit<T>(value: unknown): value is ClinkrExit<T> {
	if (typeof value !== "object" || value === null) return false;
	const type = (value as { type?: unknown }).type;
	return type === "ok" || type === "negative" || type === "failure" || type === "usageError";
}
