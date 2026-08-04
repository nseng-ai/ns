import type { LandContext } from "../types.ts";
import type { LandExecutionProgress } from "./host-seams.ts";

/** Stable runtime collaborators shared by the canonical land merge execution path. */
export interface LandExecutionContext {
	readonly land: LandContext;
	readonly progress: LandExecutionProgress;
}
