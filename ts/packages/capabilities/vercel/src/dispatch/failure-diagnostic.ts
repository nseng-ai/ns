import { optionalEntries } from "@nseng-ai/foundation/primitives";

export const DISPATCH_DIAGNOSTIC_MESSAGE_MAX_CHARS = 500;
export const DISPATCH_DIAGNOSTIC_IDENTIFIER_MAX_CHARS = 100;
export const DISPATCH_DIAGNOSTIC_RENDER_MAX_CHARS = 1_000;

export interface DispatchFailureDiagnostic {
	readonly operation: string;
	readonly reason: string;
	readonly errorName?: string;
	readonly errorCode?: string;
	readonly httpStatus?: number;
	readonly requestId?: string;
	readonly message?: string;
}

export class DispatchDiagnosticError extends Error {
	readonly diagnostic: DispatchFailureDiagnostic;

	constructor(diagnostic: DispatchFailureDiagnostic) {
		super(diagnostic.message ?? diagnostic.reason);
		this.name = "DispatchDiagnosticError";
		this.diagnostic = diagnostic;
	}
}

export function normalizeDispatchFailure(options: {
	readonly operation: string;
	readonly reason: string;
	readonly error?: unknown;
	readonly message?: string;
	readonly errorName?: string;
	readonly errorCode?: string;
	readonly httpStatus?: number;
	readonly requestId?: string;
}): DispatchFailureDiagnostic {
	if (options.error instanceof DispatchDiagnosticError) {
		const diagnostic = options.error.diagnostic;
		return normalizeDiagnosticFields({
			operation: options.operation,
			reason: diagnostic.reason,
			errorName: diagnostic.errorName,
			errorCode: diagnostic.errorCode,
			httpStatus: diagnostic.httpStatus,
			requestId: diagnostic.requestId,
			message: diagnostic.message,
		});
	}

	return normalizeDiagnosticFields({
		operation: options.operation,
		reason: options.reason,
		errorName: options.errorName ?? safeStringProperty(options.error, "name"),
		errorCode: options.errorCode,
		httpStatus: options.httpStatus,
		requestId: options.requestId,
		message: options.message ?? safeThrownMessage(options.error),
	});
}

export function sanitizeDispatchDiagnosticMessage(value: string): string {
	let sanitized = value
		.replace(/[\u0000-\u001f\u007f]+/g, " ")
		.replace(/\b(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@")
		.replace(/\b(authorization\s*[:=]\s*)(?:bearer|basic)\s+[^\s,;]+/gi, "$1[redacted]")
		.replace(/\bbearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
		.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-jwt]")
		.replace(/\b(token|secret|password|private[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
		.replace(/[ \t]+/g, " ")
		.trim();
	if (sanitized.length > DISPATCH_DIAGNOSTIC_MESSAGE_MAX_CHARS) {
		sanitized = `${sanitized.slice(0, DISPATCH_DIAGNOSTIC_MESSAGE_MAX_CHARS - 1)}…`;
	}
	return sanitized;
}

export function renderDispatchFailureDiagnostic(options: {
	readonly code: string;
	readonly summary: string;
	readonly diagnostic?: DispatchFailureDiagnostic;
	readonly anchorPrNumber?: number;
}): string {
	const parts = [sanitizeDispatchDiagnosticMessage(options.summary)];
	const diagnostic = options.diagnostic;
	if (diagnostic?.message !== undefined && diagnostic.message !== parts[0]) {
		parts.push(diagnostic.message);
	}
	parts.push(`Code: ${normalizeRequiredIdentifier(options.code, "dispatch-failed")}.`);
	if (diagnostic !== undefined) parts.push(`Operation: ${diagnostic.operation}.`);
	if (diagnostic?.httpStatus !== undefined) parts.push(`HTTP status: ${diagnostic.httpStatus}.`);
	if (diagnostic?.errorCode !== undefined) parts.push(`Vendor code: ${diagnostic.errorCode}.`);
	if (diagnostic?.requestId !== undefined) parts.push(`Request ID: ${diagnostic.requestId}.`);
	if (options.anchorPrNumber !== undefined) parts.push(`Anchor PR: #${options.anchorPrNumber}.`);
	const rendered = parts.join(" ");
	return rendered.length <= DISPATCH_DIAGNOSTIC_RENDER_MAX_CHARS
		? rendered
		: `${rendered.slice(0, DISPATCH_DIAGNOSTIC_RENDER_MAX_CHARS - 1)}…`;
}

interface RawDispatchDiagnosticFields {
	readonly operation: string;
	readonly reason: string;
	readonly errorName: string | undefined;
	readonly errorCode: string | undefined;
	readonly httpStatus: number | undefined;
	readonly requestId: string | undefined;
	readonly message: string | undefined;
}

function normalizeDiagnosticFields(fields: RawDispatchDiagnosticFields): DispatchFailureDiagnostic {
	const errorName = normalizeIdentifier(fields.errorName);
	const errorCode = normalizeIdentifier(fields.errorCode);
	const requestId = normalizeIdentifier(fields.requestId);
	const httpStatus = normalizeHttpStatus(fields.httpStatus);
	const sanitizedMessage =
		fields.message === undefined ? undefined : sanitizeDispatchDiagnosticMessage(fields.message);
	return {
		operation: normalizeRequiredIdentifier(fields.operation, "unknown_operation"),
		reason: normalizeRequiredIdentifier(fields.reason, "unexpected-exception"),
		...optionalEntries({
			errorName,
			errorCode,
			httpStatus,
			requestId,
			message: sanitizedMessage === "" ? undefined : sanitizedMessage,
		}),
	};
}

function safeThrownMessage(error: unknown): string | undefined {
	if (typeof error === "string") return error;
	return safeStringProperty(error, "message");
}

function safeStringProperty(value: unknown, property: string): string | undefined {
	if ((typeof value !== "object" && typeof value !== "function") || value === null)
		return undefined;
	try {
		const candidate = Reflect.get(value, property) as unknown;
		return typeof candidate === "string" ? candidate : undefined;
	} catch {
		return undefined;
	}
}

function normalizeRequiredIdentifier(value: string, fallback: string): string {
	return normalizeIdentifier(value) ?? fallback;
}

function normalizeIdentifier(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const normalized = value.trim();
	if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(normalized)) return undefined;
	return normalized.slice(0, DISPATCH_DIAGNOSTIC_IDENTIFIER_MAX_CHARS);
}

function normalizeHttpStatus(value: number | undefined): number | undefined {
	return value !== undefined && Number.isInteger(value) && value >= 100 && value <= 599
		? value
		: undefined;
}
