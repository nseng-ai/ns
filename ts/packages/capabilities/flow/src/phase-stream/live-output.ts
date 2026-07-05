import type { NsExtensionApi, NsOutputStream } from "@nseng-ai/ns/kernel/sdk";

export type FlowLiveOutput = (stream: NsOutputStream, text: string) => void;

export function createFlowLiveOutput(ctx: NsExtensionApi): FlowLiveOutput | undefined {
	if (ctx.onOutput !== undefined) return ctx.onOutput;
	if (ctx.stdout === undefined && ctx.stderr === undefined) return undefined;
	return (stream, text) => {
		if (stream === "stdout") {
			ctx.stdout?.(text);
			return;
		}
		ctx.stderr?.(text);
	};
}

export function emitFlowProgress(liveOutput: FlowLiveOutput | undefined, message: string): void {
	liveOutput?.("stderr", `${message}\n`);
}
