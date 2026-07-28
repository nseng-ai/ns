import { isRecord } from "@nseng-ai/ns-foundation/primitives";

export function isMissingFileError(caught: unknown): boolean {
	return isRecord(caught) && caught.code === "ENOENT";
}
