import { exitCodeForExit, toMachineEnvelope, type ClinkrExit, type LegacyMachineOutput } from "@asdl/clinkr";

export function legacyMachine<T>(exit: ClinkrExit<T>): LegacyMachineOutput {
	return { body: toMachineEnvelope(exit), exitCode: exitCodeForExit(exit) };
}
