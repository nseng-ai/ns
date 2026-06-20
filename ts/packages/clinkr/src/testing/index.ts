import type {
	ClinkrInteraction,
	ConfirmationRequest,
	ConfirmationResult,
} from "../confirmation.ts";
import { machineEnvelopeSchema, type MachineEnvelope } from "../exit.ts";
import type { ClinkrGroup } from "../group.ts";
import type { ClinkrIo } from "../io.ts";

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

export function createFakeClinkrInteraction(
	options: {
		confirmations?: readonly ConfirmationResult[] | undefined;
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
		},
		requests: () => requests.map((request) => ({ ...request })),
		assertComplete: () => {
			if (confirmations.length > 0) {
				throw new Error(`Unused confirmation result(s): ${confirmations.length}`);
			}
		},
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
		},
		stdout: () => outChunks.join(""),
		stderr: () => errChunks.join(""),
	};
}

/** In-process invocation through the io seam. */
export async function runForTest<TContext>(
	group: ClinkrGroup<TContext>,
	argv: readonly string[],
	options: { context: TContext },
): Promise<CapturedRun> {
	const capture = createCaptureIo();
	const exitCode = await group.run(argv, { context: options.context, io: capture.io });
	return { exitCode, stdout: capture.stdout(), stderr: capture.stderr() };
}

export { machineEnvelopeSchema } from "../exit.ts";

export function parseEnvelope(stdout: string): MachineEnvelope {
	return machineEnvelopeSchema.parse(JSON.parse(stdout)) as MachineEnvelope;
}
