import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

import { recordLoad } from "../log.ts";

recordLoad("second:metadata-module");

export function metadata(): ClinkrCommandMetadata {
	recordLoad("second:metadata-call");
	return { description: "Second." };
}
