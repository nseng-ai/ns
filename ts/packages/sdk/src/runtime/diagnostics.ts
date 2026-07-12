import { optionalEntry } from "@nseng-ai/foundation/primitives";

export type SdkDiagnosticSeverity = "error" | "info";

export interface SdkDiagnosticBase {
	severity: SdkDiagnosticSeverity;
	code: string;
	message: string;
	path?: string;
}

interface SdkDiagnosticRequest<TExtra extends object> {
	code: string;
	message: string;
	path?: string;
	extra?: TExtra;
}

export function makeSdkDiagnostic<TExtra extends object = Record<never, never>>(
	request: SdkDiagnosticRequest<TExtra>,
): (SdkDiagnosticBase & { severity: "error" }) & TExtra;
export function makeSdkDiagnostic<TExtra extends object = Record<never, never>>(
	request: SdkDiagnosticRequest<TExtra> & { severity: "info" },
): (SdkDiagnosticBase & { severity: "info" }) & TExtra;
export function makeSdkDiagnostic<TExtra extends object = Record<never, never>>(
	request: SdkDiagnosticRequest<TExtra> & { severity?: SdkDiagnosticSeverity },
): SdkDiagnosticBase & TExtra {
	const base = {
		severity: request.severity ?? "error",
		code: request.code,
		message: request.message,
		...optionalEntry("path", request.path),
	} satisfies SdkDiagnosticBase;
	return Object.assign(base, request.extra);
}
