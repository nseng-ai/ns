import { createNsCwdEnvStdinContext } from "@nseng-ai/capability-kit/ns-context";
import type { NsExtensionApi } from "@nseng-ai/kernel/sdk";

import { createRealPrAddressContext } from "./context.ts";
import { EXEC_OPERATIONS } from "./exec-commands.ts";
import type { ExecOperation, PrAddressExecContext } from "./exec-operation.ts";

export function prAddressNsCommand(operationName: string) {
	const operation = findOperation(operationName);
	return prAddressOperationNsCommand(operation);
}

export function prAddressOperationNsCommand(operation: ExecOperation) {
	return operation.toNsCommand(createExecContext);
}

function createExecContext(ctx: NsExtensionApi): PrAddressExecContext {
	return {
		context: createRealPrAddressContext(),
		...createNsCwdEnvStdinContext(ctx),
	};
}

function findOperation(operationName: string): ExecOperation {
	const operation = EXEC_OPERATIONS.find((candidate) => candidate.name === operationName);
	if (operation === undefined) {
		throw new Error(`Unknown Address exec operation: ${operationName}`);
	}
	return operation;
}
