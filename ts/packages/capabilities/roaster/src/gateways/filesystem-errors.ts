import { isRecord } from "@nseng-ai/core/primitives";

export function isMissingFileError(caught: unknown): boolean {
	return isRecord(caught) && caught.code === "ENOENT";
}
