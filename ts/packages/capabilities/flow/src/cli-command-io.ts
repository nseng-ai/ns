import {
	createCliCommandIo,
	type CliCommandIoInput,
	type CliCommandIoOptions,
} from "@sdl/core/command-io";
import type { CommandIo } from "@sdl/core/command-io";

/** Minimal CLI stream/callback surface that Flow standalone commands adapt to CommandIo. */
export type FlowCliCommandIoInput = CliCommandIoInput;

export type FlowCliCommandIoOptions = CliCommandIoOptions;

/**
 * Flow edge adapter mapping CLI stdout/stderr/onOutput callbacks onto a
 * CommandIo. The implementation lives in `@sdl/core/command-io` because the
 * mapping is CLI plumbing, not Flow domain behavior, and reusing CCC's copy
 * would invert the CCC -> Flow dependency direction.
 */
export function createFlowCliCommandIo(
	input: FlowCliCommandIoInput,
	options: FlowCliCommandIoOptions = {},
): CommandIo {
	return createCliCommandIo(input, options);
}
