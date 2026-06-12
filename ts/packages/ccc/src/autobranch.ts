import {
	commitPreparedCheckpointMessageWithAsdlDev,
	prepareCheckpointMessageWithAsdlDev,
	type ExtensionExec,
} from "./autobranch/asdl-dev-checkpoint.ts";
import type { AutobranchFlowInput } from "./autobranch/flow.ts";
import type { ParsedAutobranchArgs } from "./autobranch/preparation.ts";

const STATUS_KEY = "autobranch";

export interface AutobranchCommandContext {
	cwd: string;
	ui: {
		notify(message: string, level?: "info" | "warning" | "error"): void;
		setStatus(key: string, value: string | undefined): void;
	};
	waitForIdle(): Promise<void>;
}

export interface BuildAutobranchFlowInputOptions {
	pi: ExtensionExec;
	ctx: AutobranchCommandContext;
	args: ParsedAutobranchArgs;
	statusKey?: string;
}

export function buildAutobranchFlowInput({
	pi,
	ctx,
	args,
	statusKey = STATUS_KEY,
}: BuildAutobranchFlowInputOptions): AutobranchFlowInput {
	return {
		cwd: ctx.cwd,
		args,
		exec: (command, commandArgs, cwd, timeout) => pi.exec(command, commandArgs, { cwd, timeout }),
		prepareCheckpointMessage: (snapshot) => prepareCheckpointMessageWithAsdlDev(snapshot),
		commitPreparedCheckpointMessage: (message) => commitPreparedCheckpointMessageWithAsdlDev(pi, ctx.cwd, message),
		notify: (message, level) => {
			ctx.ui.notify(message, level === "success" ? "info" : level);
		},
		setStatus: (message) => {
			ctx.ui.setStatus(statusKey, message);
		},
	};
}
