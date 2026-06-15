import type { PrAddressExecContext } from "./exec-operation.ts";
import type { PayloadArtifactStore, PayloadErrorType } from "./payload-store.ts";

export interface OpenPayloadStoreFromContextOptions {
	ctx: PrAddressExecContext;
	harnessSessionId?: string | undefined;
}

export type OpenPayloadStoreFromContextResult =
	| { type: "ok"; value: PayloadArtifactStore }
	| { type: "error"; errorType: PayloadErrorType; message: string };

export async function openPayloadStoreFromContext(options: OpenPayloadStoreFromContextOptions): Promise<OpenPayloadStoreFromContextResult> {
	const storeResult = await options.ctx.context.payloadStoreFactory.fromEnvironment({
		explicitHarnessSessionId: options.harnessSessionId ?? null,
		env: options.ctx.env,
		clock: options.ctx.context.payloadClock,
	});
	if (storeResult.type === "error") return { type: "error", errorType: storeResult.errorType, message: storeResult.message };
	return { type: "ok", value: storeResult.value };
}
