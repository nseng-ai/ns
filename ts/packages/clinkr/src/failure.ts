/**
 * The sole throwable in the clinkr operation contract. Handlers throw this to
 * signal the failure channel (exit 2); the dispatcher converts it to the
 * failure exit variant. Any other throw propagates raw as a crash.
 */
export class ClinkrFailure extends Error {
	errorType: string;
	data: unknown | undefined;

	constructor(options: { errorType: string; message: string; data?: unknown }) {
		super(options.message);
		this.name = "ClinkrFailure";
		this.errorType = options.errorType;
		this.data = options.data;
	}
}
