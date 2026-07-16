import { randomBytes } from "node:crypto";

/** Opaque, URL- and git-key-safe identity created before dispatch delivery mutates state. */
export function generateRealDispatchId(): string {
	return `dsp_${randomBytes(12).toString("hex")}`;
}
