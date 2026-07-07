import type { ReadWorktreeState } from "./worktree-state.ts";

export type ReadTextFile = (path: string) => Promise<string>;

export interface ReadTextFileDependencies {
	readTextFile?: ReadTextFile;
	readWorktreeState?: ReadWorktreeState;
}
