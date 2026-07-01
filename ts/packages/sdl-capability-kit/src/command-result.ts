import type { ExecResult } from "@sdl/exec";

export type CommandResult = Pick<ExecResult, "code" | "stdout" | "stderr"> & {
	killed?: ExecResult["killed"];
};
