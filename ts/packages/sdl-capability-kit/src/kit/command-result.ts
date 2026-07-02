import type { ExecResult } from "@sdl/core/exec";

export type CommandResult = Pick<ExecResult, "code" | "stdout" | "stderr"> & {
	killed?: ExecResult["killed"];
};
