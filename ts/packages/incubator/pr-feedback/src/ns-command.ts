import { createNsCwdEnvStdinContext } from "@nseng-ai/extension-kit/ns-context";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import { createRealPrAddressContext } from "./context.ts";
import { EXEC_OPERATIONS } from "./exec-commands.ts";
import {
	findOperationByName,
	type ExecOperation,
	type PrAddressExecContext,
} from "./exec-operation.ts";

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
	return findOperationByName(EXEC_OPERATIONS, operationName, "exec");
}
