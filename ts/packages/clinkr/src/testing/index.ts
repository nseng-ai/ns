import { z } from "zod";

import type { MachineEnvelope } from "../exit.ts";
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

export const machineEnvelopeSchema = z.strictObject({
	exit_code: z.union([z.literal(0), z.literal(1), z.literal(2)]),
	error_type: z.string().optional(),
	message: z.string().optional(),
	data: z.unknown().optional(),
});

export function parseEnvelope(stdout: string): MachineEnvelope {
	return machineEnvelopeSchema.parse(JSON.parse(stdout)) as MachineEnvelope;
}
