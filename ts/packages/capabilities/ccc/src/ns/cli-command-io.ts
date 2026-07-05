import {
	createCliCommandIo,
	type CliCommandIoInput,
	type CliCommandIoOptions,
} from "@ns/kernel/command-io";
import type { NsCommandIo } from "@ns/kernel/sdk";

/** Minimal CLI stream/callback surface that CCC standalone commands adapt to NsCommandIo. */
export type CccCliCommandIoInput = CliCommandIoInput;

export type CccCliCommandIoOptions = CliCommandIoOptions;

/**
 * CCC edge adapter mapping CLI stdout/stderr/onOutput callbacks onto an NsCommandIo.
 * The implementation lives in the kernel because command I/O is an intrinsic
 * SDK service, not CCC orchestration behavior.
 */
export function createCccCliCommandIo(
	input: CccCliCommandIoInput,
	options: CccCliCommandIoOptions = {},
): NsCommandIo {
	return createCliCommandIo(input, options);
}
