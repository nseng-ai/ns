import type { AregErrorInfo } from "../gateways.ts";

export function errorInfo(code: string, message: string): AregErrorInfo {
	return { code, message };
}
