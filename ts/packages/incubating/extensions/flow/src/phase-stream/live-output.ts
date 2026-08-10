import type { NsExtensionApi, NsOutputStream } from "@nseng-ai/sdk";

export type FlowLiveOutput = (stream: NsOutputStream, text: string) => void;

export function createFlowLiveOutput(ctx: NsExtensionApi): FlowLiveOutput | undefined {
	return ctx.onOutput;
}

export function emitFlowProgress(liveOutput: FlowLiveOutput | undefined, message: string): void {
	liveOutput?.("stderr", `${message}\n`);
}
