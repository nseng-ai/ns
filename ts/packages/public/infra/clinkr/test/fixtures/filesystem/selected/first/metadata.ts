import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

import { recordLoad } from "../log.ts";

recordLoad("first:metadata-module");

export function metadata(): ClinkrCommandMetadata {
	recordLoad("first:metadata-call");
	return { description: "First." };
}
