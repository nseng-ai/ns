/**
 * Payload error types and error class.
 */

export type PayloadErrorType =
	| "payload-root-invalid"
	| "payload-session-required"
	| "payload-session-invalid"
	| "payload-directory-unsafe"
	| "payload-write-failed"
	| "payload-lookup-failed";

export class PayloadError extends Error {
	readonly errorType: PayloadErrorType;

	constructor(errorType: PayloadErrorType, message: string, cause?: unknown) {
		super(message, { cause });
		this.name = "PayloadError";
		this.errorType = errorType;
	}
}
