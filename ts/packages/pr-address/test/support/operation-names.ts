import { EXEC_OPERATIONS } from "../../src/exec-commands.ts";

/** Test-only set of operation names derived from EXEC_OPERATIONS. */
export const EXEC_OPERATION_NAMES: ReadonlySet<string> = new Set(
	EXEC_OPERATIONS.map((operation) => operation.name),
);
