import { createNsCwdEnvJsonInputContext } from "@nseng-ai/extension-kit/ns-context";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import { createRealPrAddressContext } from "../context.ts";
import type { ExecOperation, PrAddressExecContext } from "../exec-operation.ts";

export function prAddressOperationNsCommand(operation: ExecOperation) {
	return operation.toNsCommand(createExecContext);
}

function createExecContext(ctx: NsExtensionApi): PrAddressExecContext {
	return {
		context: createRealPrAddressContext(),
		...createNsCwdEnvJsonInputContext(ctx),
	};
}
