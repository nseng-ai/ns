import type { ClinkrExit, ClinkrFormat } from "@nseng-ai/clinkr";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import { requestObjectToArgv } from "@nseng-ai/foundation/test-kit";
import { noopNsProgress } from "@nseng-ai/kernel/sdk";
import type {
	ExecResult,
	NsCommand,
	NsCommandIo,
	NsCommandSchema,
	NsExecOptions,
	NsExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "@nseng-ai/kernel/sdk";

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
	execResult?: Partial<ExecResult>;
	/** Per-call `exec` result overrides; the last value repeats once exhausted. */
	execResults?: readonly Partial<ExecResult>[];
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
	readonly outputFormat: ClinkrFormat;
	readonly commandIo: NsCommandIo;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	private readonly execResult: Partial<ExecResult>;
	private readonly execResults: readonly Partial<ExecResult>[];
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
		return {
			stdout: "",
			stderr: "",
			code: 0,
			killed: false,
			...this.execResult,
			...sequenced.value,
		};
	}

	readonly textGenerator = {
		generateText: async (request: TextGenerationRequest): Promise<TextGenerationResult> => {
			this.textGeneratorCalls.push({ ...request });
			throw new Error("Unexpected text-generation call in objective ns command test.");
		},
	};
}

export function createFakeObjectiveNsApi(
	options: FakeObjectiveNsApiOptions = {},
): FakeObjectiveNsApi {
	return new FakeObjectiveNsApi(options);
}

/**
 * Runs one objective ns command against a fake API: the request goes through
 * the command's own kernel adapter (mirroring kernel argv decoding).
 */
export async function runObjectiveCommand<S extends NsCommandSchema, T>(
	command: NsCommand<S, T>,
	request: unknown,
	options: { api?: NsExtensionApi } = {},
): Promise<ClinkrExit<T>> {
	const exit = await command.run(options.api ?? createFakeObjectiveNsApi(), {
		argv: requestObjectToArgv(request, { positionalKeys: ["slug", "sessionFiles"] }),
	});
	if (!isClinkrExit<T>(exit)) {
		throw new Error(
			`Command ${command.name} returned a legacy ns result instead of a Clinkr exit.`,
		);
	}
	return exit;
}

function isClinkrExit<T>(value: unknown): value is ClinkrExit<T> {
	if (typeof value !== "object" || value === null) return false;
	const type = (value as { type?: unknown }).type;
	return type === "ok" || type === "negative" || type === "failure" || type === "usageError";
}
