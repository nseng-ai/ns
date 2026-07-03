import {
	createCliCommandIo,
	type CliCommandIoInput,
	type CliCommandIoOptions,
} from "@ns/kernel/command-io";
import type { SdlCommandIo } from "@ns/kernel/sdk";

/** Minimal CLI stream/callback surface that CCC standalone commands adapt to SdlCommandIo. */
export type CccCliCommandIoInput = CliCommandIoInput;

export type CccCliCommandIoOptions = CliCommandIoOptions;

/**
 * CCC edge adapter mapping CLI stdout/stderr/onOutput callbacks onto an SdlCommandIo.
 * The implementation lives in the kernel because command I/O is an intrinsic
 * SDK service, not CCC orchestration behavior.
 */
export function createCccCliCommandIo(
	input: CccCliCommandIoInput,
	options: CccCliCommandIoOptions = {},
): SdlCommandIo {
	return createCliCommandIo(input, options);
}
