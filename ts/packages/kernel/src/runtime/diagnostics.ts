import { optionalEntry } from "@nseng-ai/foundation/primitives";

export type KernelDiagnosticSeverity = "error" | "info";

export interface KernelDiagnosticBase {
	severity: KernelDiagnosticSeverity;
	code: string;
	message: string;
	path?: string;
}

interface KernelDiagnosticRequest<TExtra extends object> {
	code: string;
	message: string;
	path?: string;
	extra?: TExtra;
}

export function makeKernelDiagnostic<TExtra extends object = Record<never, never>>(
	request: KernelDiagnosticRequest<TExtra>,
): (KernelDiagnosticBase & { severity: "error" }) & TExtra;
export function makeKernelDiagnostic<TExtra extends object = Record<never, never>>(
	request: KernelDiagnosticRequest<TExtra> & { severity: "info" },
): (KernelDiagnosticBase & { severity: "info" }) & TExtra;
export function makeKernelDiagnostic<TExtra extends object = Record<never, never>>(
	request: KernelDiagnosticRequest<TExtra> & { severity?: KernelDiagnosticSeverity },
): KernelDiagnosticBase & TExtra {
	const base = {
		severity: request.severity ?? "error",
		code: request.code,
		message: request.message,
		...optionalEntry("path", request.path),
	};
	return { ...base, ...(request.extra ?? {}) } as KernelDiagnosticBase & TExtra;
}
