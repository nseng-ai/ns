import { isRecord } from "@ji/core/primitives";

export function isMissingFileError(caught: unknown): boolean {
	return isRecord(caught) && caught.code === "ENOENT";
}
