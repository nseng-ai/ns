import type { GraphiteBranchGateway } from "@sdl/capability-kit/graphite/branch";
import type { CommandExecApi } from "@sdl/core/exec";
import type { ClinkrFormat } from "@sdl/kernel/sdk";

import type { ObjectiveCliContext } from "../core/context.ts";
import type { ChildSessionGateway } from "./child-session.ts";

/** Which of the two runner-step preconditions/verification regimes applies. */
export type RunnerStepMode = "default" | "recover";

export type RunnerTextFileReadResult =
	| { type: "ok"; content: string }
	| { type: "error"; message: string };

/**
 * Dependency surface for one Objective Runner step.
 *
 * Extends the plain Objective CLI context with the runner's injected gateways
 * (Graphite tracking check, raw command exec for `git diff --check`, child
 * session dispatch) and the presentation seams the step contract requires:
 * `writeStdout` is a tactical Runner Checkpoint stream for human/markdown modes
 * until clinkr owns non-ok stdout artifacts, `writeStderr` streams live progress,
 * and `phase` mirrors `SdlCommandIo.phase` transient phase text.
 */
export interface ObjectiveRunnerContext extends ObjectiveCliContext {
	graphite: GraphiteBranchGateway;
	commands: CommandExecApi;
	childSession: ChildSessionGateway;
	outputFormat?: ClinkrFormat;
	writeStdout(text: string): void;
	writeStderr(text: string): void;
	/** Transient, human-facing phase text. Non-contractual wording. */
	phase(label: string): void;
	/** Minimal text-file read seam; used for `--guidance @file` resolution. */
	readTextFile(path: string): Promise<RunnerTextFileReadResult>;
}
