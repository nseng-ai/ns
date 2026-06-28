import {
	createCliCommandIo,
	type CliCommandIoInput,
	type CliCommandIoOptions,
} from "@sdl/core/command-io";
import type { CommandIo } from "@sdl/core/command-io";

/** Minimal CLI stream/callback surface that CCC standalone commands adapt to CommandIo. */
export type CccCliCommandIoInput = CliCommandIoInput;

export type CccCliCommandIoOptions = CliCommandIoOptions;

/**
 * CCC edge adapter mapping CLI stdout/stderr/onOutput callbacks onto a CommandIo.
 * The implementation lives in `@sdl/core/command-io` because the mapping is CLI
 * plumbing shared with Flow, not CCC orchestration or Flow domain behavior.
 */
export function createCccCliCommandIo(
	input: CccCliCommandIoInput,
	options: CccCliCommandIoOptions = {},
): CommandIo {
	return createCliCommandIo(input, options);
}
