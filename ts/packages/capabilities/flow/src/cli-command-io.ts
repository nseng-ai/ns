import {
	createCliCommandIo,
	type CliCommandIoInput,
	type CliCommandIoOptions,
} from "@sdl/kernel/command-io";
import type { SdlCommandIo } from "sdl-sdk";

/** Minimal CLI stream/callback surface that Flow standalone commands adapt to SdlCommandIo. */
export type FlowCliCommandIoInput = CliCommandIoInput;

export type FlowCliCommandIoOptions = CliCommandIoOptions;

/**
 * Flow edge adapter mapping CLI stdout/stderr/onOutput callbacks onto an
 * SdlCommandIo. The implementation lives in the kernel because command I/O is
 * an intrinsic SDK service, not Flow domain behavior.
 */
export function createFlowCliCommandIo(
	input: FlowCliCommandIoInput,
	options: FlowCliCommandIoOptions = {},
): SdlCommandIo {
	return createCliCommandIo(input, options);
}
