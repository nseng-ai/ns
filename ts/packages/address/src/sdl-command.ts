import type { SdlExtensionApi } from "sdl-sdk";

import { createRealPrAddressContext } from "./context.ts";
import { EXEC_OPERATIONS } from "./exec-commands.ts";
import type { ExecOperation, PrAddressExecContext } from "./exec-operation.ts";

export function prAddressSdlCommand(operationName: string) {
	const operation = findOperation(operationName);
	return operation.toSdlCommand(createExecContext);
}

function createExecContext(ctx: SdlExtensionApi): PrAddressExecContext {
	return {
		context: createRealPrAddressContext(),
		cwd: ctx.cwd,
		env: ctx.env,
		stdin: async () => "",
	};
}

function findOperation(operationName: string): ExecOperation {
	const operation = EXEC_OPERATIONS.find((candidate) => candidate.name === operationName);
	if (operation === undefined) {
		throw new Error(`Unknown Address exec operation: ${operationName}`);
	}
	return operation;
}
