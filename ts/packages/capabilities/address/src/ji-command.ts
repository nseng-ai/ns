import { createSdlCwdEnvStdinContext } from "@ji/capability-kit/ji-context";
import { defineExtension, type SdlExtensionApi } from "@ji/kernel/sdk";

import { createRealPrAddressContext } from "./context.ts";
import { EXEC_OPERATIONS } from "./exec-commands.ts";
import type { ExecOperation, PrAddressExecContext } from "./exec-operation.ts";

export function prAddressSdlCommand(operationName: string) {
	const operation = findOperation(operationName);
	return operation.toSdlCommand(createExecContext);
}

export function prAddressSdlExtension(operationName: string) {
	return defineExtension({ commands: [prAddressSdlCommand(operationName)] });
}

function createExecContext(ctx: SdlExtensionApi): PrAddressExecContext {
	return {
		context: createRealPrAddressContext(),
		...createSdlCwdEnvStdinContext(ctx),
	};
}

function findOperation(operationName: string): ExecOperation {
	const operation = EXEC_OPERATIONS.find((candidate) => candidate.name === operationName);
	if (operation === undefined) {
		throw new Error(`Unknown Address exec operation: ${operationName}`);
	}
	return operation;
}
