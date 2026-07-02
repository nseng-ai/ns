import type { SdlExtensionApi, SdlOutputStream } from "@sdl/kernel/sdk";

export type FlowLiveOutput = (stream: SdlOutputStream, text: string) => void;

export function createFlowLiveOutput(ctx: SdlExtensionApi): FlowLiveOutput | undefined {
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
