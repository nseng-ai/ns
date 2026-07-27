import { resolveSettledNonInteractiveCaps } from "../caps.ts";
export { stripAnsi } from "../ansi.ts";
import type {
	ClinkrInteraction,
	ConfirmationRequest,
	ConfirmationResult,
} from "../confirmation.ts";
import { machineEnvelopeSchema, type MachineEnvelope } from "../exit.ts";
import type { ClinkrContextFreeApp, ClinkrContextfulApp } from "../app.ts";
import { ClinkrGroup } from "../group.ts";
import type { ClinkrIo } from "../io.ts";
import { optionalEntry } from "@nseng-ai/foundation/primitives";

export interface CapturedRun {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface CaptureIo {
	io: ClinkrIo;
	stdout: () => string;
	stderr: () => string;
}

export interface FakeClinkrInteraction {
	interaction: ClinkrInteraction;
	requests(): readonly ConfirmationRequest[];
	assertComplete(): void;
}

export interface ScenarioClinkrInteraction {
	depsInteraction?: ClinkrInteraction;
	contextInteraction: ClinkrInteraction;
	assertComplete(): void;
}

export type ScenarioStdin = string | (() => Promise<string | null>) | undefined;

export function createFakeClinkrInteraction(
	options: {
		confirmations?: readonly ConfirmationResult[];
		isInteractive?: boolean;
	} = {},
): FakeClinkrInteraction {
	const confirmations = [...(options.confirmations ?? [])];
	const requests: ConfirmationRequest[] = [];
	return {
		interaction: {
			confirm: async (request) => {
				requests.push({ ...request });
				const result = confirmations.shift();
				if (result === undefined) {
					throw new Error(`Unexpected confirmation prompt: ${request.message}`);
				}
				return { ...result };
			},
			isInteractive: () => options.isInteractive ?? false,
		},
		requests: () => requests.map((request) => ({ ...request })),
		assertComplete: () => {
			if (confirmations.length > 0) {
				throw new Error(`Unused confirmation result(s): ${confirmations.length}`);
			}
		},
	};
}

export function createOneShotStdinAdapter(stdin: ScenarioStdin): () => Promise<string | null> {
	let value = stdin;
	return async () => {
		if (typeof value === "function") return await value();
		const result = value ?? null;
		value = undefined;
		return result;
	};
}

export function createScenarioClinkrInteraction(options: {
	hasStdin: boolean;
	interaction?: ClinkrInteraction;
	confirmations?: readonly ConfirmationResult[];
	isInteractive?: boolean;
}): ScenarioClinkrInteraction {
	if (options.interaction !== undefined) {
		return {
			depsInteraction: options.interaction,
			contextInteraction: options.interaction,
			assertComplete: () => {},
		};
	}
	const isInteractive =
		options.isInteractive ?? (options.hasStdin || options.confirmations !== undefined);
	if (!options.hasStdin) {
		const fake = createFakeClinkrInteraction({
			...optionalEntry("confirmations", options.confirmations),
			isInteractive,
		});
		return {
			depsInteraction: fake.interaction,
			contextInteraction: fake.interaction,
			assertComplete: fake.assertComplete,
		};
	}
	return {
		contextInteraction: createFakeClinkrInteraction({ confirmations: [], isInteractive })
			.interaction,
		assertComplete: () => {},
	};
}

export function createCaptureIo(): CaptureIo {
	const outChunks: string[] = [];
	const errChunks: string[] = [];
	return {
		io: {
			stdout: (text) => {
				outChunks.push(text);
			},
			stderr: (text) => {
				errChunks.push(text);
			},
			caps: resolveSettledNonInteractiveCaps(),
			canEmitAnsi: false,
		},
		stdout: () => outChunks.join(""),
		stderr: () => errChunks.join(""),
	};
}

export interface RunForTestOptions<TContext> {
	readonly context: TContext;
	readonly io?: ClinkrIo;
	readonly stdin?: string;
}

export interface ContextFreeRunForTestOptions {
	readonly io?: ClinkrIo;
	readonly stdin?: string;
}

/** In-process invocation through the public app/group I/O seam. */
export async function runForTest(
	app: ClinkrContextFreeApp,
	argv: readonly string[],
	options?: ContextFreeRunForTestOptions,
): Promise<CapturedRun>;
export async function runForTest<TContext>(
	app: ClinkrContextfulApp<TContext> | ClinkrGroup<TContext>,
	argv: readonly string[],
	options: RunForTestOptions<TContext>,
): Promise<CapturedRun>;
export async function runForTest<TContext>(
	app: ClinkrContextFreeApp | ClinkrContextfulApp<TContext> | ClinkrGroup<TContext>,
	argv: readonly string[],
	options: ContextFreeRunForTestOptions | RunForTestOptions<TContext> = {},
): Promise<CapturedRun> {
	const capture = createCaptureIo();
	const io = options.io ?? capture.io;
	const readStdin =
		options.stdin === undefined ? undefined : createOneShotStdinAdapter(options.stdin);
	let exitCode: number;
	if (app instanceof ClinkrGroup) {
		if (!("context" in options)) throw new Error("ClinkrGroup test runs require context");
		exitCode = await app.run(argv, {
			context: options.context,
			io,
			...(readStdin === undefined ? {} : { readStdin }),
		});
	} else if (app.requiresContext) {
		if (!("context" in options)) throw new Error("Contextful app test runs require context");
		exitCode = await app.run(argv, {
			context: options.context,
			io,
			...(readStdin === undefined ? {} : { readStdin: async () => (await readStdin()) ?? "" }),
		});
	} else {
		exitCode = await app.run(argv, {
			io,
			...(readStdin === undefined ? {} : { readStdin: async () => (await readStdin()) ?? "" }),
		});
	}
	return { exitCode, stdout: capture.stdout(), stderr: capture.stderr() };
}

export { machineEnvelopeSchema } from "../exit.ts";
export {
	fileForReport,
	literalSpecifierUsesOf,
	literalSpecifiersOf,
	sourceFilesUnder,
} from "./import-scanner.ts";
export type { LiteralSpecifierUse } from "./import-scanner.ts";
export { buildSurfacePlan } from "../surface.ts";
export type {
	BuildSurfacePlanOptions,
	FieldKind,
	OptionPlan,
	OptionSpec,
	PositionalPlan,
	PositionalSpec,
	SurfacePlan,
} from "../surface.ts";

export function parseEnvelope(stdout: string): MachineEnvelope {
	return machineEnvelopeSchema.parse(JSON.parse(stdout)) as MachineEnvelope;
}
