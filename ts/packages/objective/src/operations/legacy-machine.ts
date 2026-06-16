import { exitCodeForExit, negative, ok, shellNegative, toMachineEnvelope, type ClinkrExit, type LegacyMachineOutput } from "@asdl/clinkr";

export function legacyMachine<T>(exit: ClinkrExit<T>): LegacyMachineOutput {
	return { body: toMachineEnvelope(exit), exitCode: exitCodeForExit(exit) };
}

export function mapExitData<T, U>(exit: ClinkrExit<T>, mapper: (data: T) => U): ClinkrExit<U> {
	switch (exit.type) {
		case "ok":
			return ok(mapper(exit.data));
		case "negative":
			return exit.data === undefined ? negative(exit.message) : negative(exit.message, mapper(exit.data));
		case "shell-negative":
			return exit.data === undefined ? shellNegative(exit.message) : shellNegative(exit.message, mapper(exit.data));
		case "failure":
			return exit;
	}
}
