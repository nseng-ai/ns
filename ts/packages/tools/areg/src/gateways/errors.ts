import type { AregErrorInfo } from "../gateways.ts";

export function errorInfo(code: string, message: string, displayCommand?: string): AregErrorInfo {
	return displayCommand === undefined ? { code, message } : { code, message, displayCommand };
}
