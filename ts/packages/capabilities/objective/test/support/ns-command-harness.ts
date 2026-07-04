import { usageError, type ClinkrExit, type ClinkrFormat } from "@ns/clinkr";
import { optionalEntries } from "@ns/core/primitives";
import { noopSdlProgress } from "@ns/kernel/sdk";
import type {
	ExecResult,
	SdlCommand,
	SdlCommandIo,
	SdlCommandSchema,
	SdlExecOptions,
	SdlExtensionApi,
	TextGenerationRequest,
	TextGenerationResult,
} from "@ns/kernel/sdk";

import type { ObjectiveRunnerOverrides } from "../../src/ns/runner-context.ts";
import { nextFromSequence } from "./sequence.ts";

export interface RecordedSdlExecCall {
	command: string;
	args: string[];
	options: SdlExecOptions | undefined;
}

export interface FakeObjectiveSdlApiOptions extends ObjectiveRunnerOverrides {
	cwd?: string;
	env?: Record<string, string | undefined>;
	/** Overrides merged into every recorded `exec` result (defaults to exit 0). */
	execResult?: Partial<ExecResult>;
	/** Per-call `exec` result overrides; the last value repeats once exhausted. */
	execResults?: readonly Partial<ExecResult>[];
	outputFormat?: ClinkrFormat;
}

/**
 * SdlExtensionApi fake for objective SDL command scenario tests: records
 * stdout/stderr chunks and `commandIo.phase` labels, answers `exec` with a
 * canned result, and publishes runner-context gateway overrides through
 * `extensions.objectiveRunner`.
 */
export class FakeObjectiveSdlApi implements SdlExtensionApi {
	readonly cwd: string;
	readonly env: Record<string, string | undefined>;
	readonly extensions: Readonly<Record<string, unknown>>;
	readonly stdoutChunks: string[] = [];
	readonly stderrChunks: string[] = [];
	readonly phases: string[] = [];
	readonly execCalls: RecordedSdlExecCall[] = [];
	readonly textGeneratorCalls: TextGenerationRequest[] = [];
	readonly progress = noopSdlProgress;
	readonly renderCapabilities = { canEmitAnsi: false };
	readonly outputFormat: ClinkrFormat;
	readonly commandIo: SdlCommandIo;
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	private readonly execResult: Partial<ExecResult>;
	private readonly execResults: readonly Partial<ExecResult>[];
	private execResultIndex = 0;

	constructor(options: FakeObjectiveSdlApiOptions = {}) {
		this.cwd = options.cwd ?? "/repo";
		this.env = { HOME: "/home/sdl-test", ...(options.env ?? {}) };
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
				// ADR0024-LEGACY-DELETE(entry): only the legacy runner-step context
				// reads a childSession override.
				childSession: options.childSession,
				readTextFile: options.readTextFile,
				filePresence: options.filePresence,
			}),
		};
	}

	async exec(command: string, args: string[], options?: SdlExecOptions): Promise<ExecResult> {
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
			throw new Error("Unexpected text-generation call in objective SDL command test.");
		},
	};
}

export function createFakeObjectiveSdlApi(
	options: FakeObjectiveSdlApiOptions = {},
): FakeObjectiveSdlApi {
	return new FakeObjectiveSdlApi(options);
}

/**
 * Runs one objective SDL command against a fake API: the request goes through
 * the command's own schema (mirroring kernel arg decoding), invalid input maps
 * to a usage error, and ok exits are validated against the result schema.
 */
export async function runObjectiveCommand<S extends SdlCommandSchema, T>(
	command: SdlCommand<S, T>,
	request: unknown,
	options: { api?: SdlExtensionApi } = {},
): Promise<ClinkrExit<T>> {
	if (command.schema === undefined) {
		throw new Error(`Command ${command.name} does not declare a request schema.`);
	}
	const parsed = command.schema.safeParse(request);
	if (!parsed.success) {
		return usageError("Invalid objective command request.", { issues: parsed.error.issues });
	}
	const exit = await command.run(options.api ?? createFakeObjectiveSdlApi(), parsed.data);
	if (!isClinkrExit<T>(exit)) {
		throw new Error(
			`Command ${command.name} returned a legacy SDL result instead of a Clinkr exit.`,
		);
	}
	if (exit.type === "ok") command.resultSchema?.parse(exit.data);
	return exit;
}

function isClinkrExit<T>(value: unknown): value is ClinkrExit<T> {
	if (typeof value !== "object" || value === null) return false;
	const type = (value as { type?: unknown }).type;
	return type === "ok" || type === "negative" || type === "failure" || type === "usageError";
}
