export interface WorktreeStatusRefreshOptions {
	readonly shouldForceRemote?: boolean;
}

export interface WorktreeStatusRefreshChannel<TSession> {
	run(session: TSession, options?: WorktreeStatusRefreshOptions): Promise<void>;
	clearSession(session: TSession): void;
}

export function createWorktreeStatusRefreshChannel<TSession>(options: {
	isActive(session: TSession): boolean;
	work(session: TSession, options: WorktreeStatusRefreshOptions): Promise<void>;
}): WorktreeStatusRefreshChannel<TSession> {
	let inFlightSession: TSession | undefined;
	let inFlight: Promise<void> | undefined;
	let pendingSession: TSession | undefined;
	let pendingOptions: WorktreeStatusRefreshOptions | undefined;

	function run(session: TSession, runOptions: WorktreeStatusRefreshOptions = {}): Promise<void> {
		if (!options.isActive(session)) return Promise.resolve();
		if (inFlightSession !== undefined) {
			pendingSession = session;
			pendingOptions = combineRefreshOptions(pendingOptions, runOptions);
			return inFlight ?? Promise.resolve();
		}

		inFlightSession = session;
		inFlight = drain(session, runOptions);
		return inFlight;
	}

	async function drain(session: TSession, runOptions: WorktreeStatusRefreshOptions): Promise<void> {
		let nextOptions = runOptions;
		try {
			for (;;) {
				pendingSession = undefined;
				pendingOptions = undefined;
				try {
					await options.work(session, nextOptions);
				} catch {
					// Background status refresh must never crash pi.
				}
				if (pendingSession !== session || !options.isActive(session)) return;
				nextOptions = pendingOptions ?? {};
			}
		} finally {
			if (inFlightSession === session) inFlightSession = undefined;
			if (inFlightSession === undefined) inFlight = undefined;
			if (pendingSession === session) pendingSession = undefined;
		}
	}

	return {
		run,
		clearSession(session) {
			if (inFlightSession === session) inFlightSession = undefined;
			if (pendingSession === session) {
				pendingSession = undefined;
				pendingOptions = undefined;
			}
		},
	};
}

function combineRefreshOptions(
	left: WorktreeStatusRefreshOptions | undefined,
	right: WorktreeStatusRefreshOptions,
): WorktreeStatusRefreshOptions {
	return left?.shouldForceRemote === true || right.shouldForceRemote === true
		? { shouldForceRemote: true }
		: {};
}
