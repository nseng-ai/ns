import type {
	ParsedSession,
	SessionQuery,
	SessionQueryResult,
	SessionSourceInfo,
	SessionWarning,
} from "./types.ts";
import type { SessionSource } from "./source.ts";

export interface FakeSessionSourceState {
	sourceInfo?: SessionSourceInfo | undefined;
	sessions?: readonly ParsedSession[] | undefined;
	warnings?: readonly SessionWarning[] | undefined;
}

export class FakeSessionSource implements SessionSource {
	readonly sourceInfo: SessionSourceInfo;
	private readonly sessions: readonly ParsedSession[];
	private readonly warnings: readonly SessionWarning[];
	readonly queries: SessionQuery[] = [];

	constructor(state: FakeSessionSourceState = {}) {
		this.sourceInfo = state.sourceInfo ?? {
			harness: "fake",
			adapter_name: "fake",
			record_format: "memory",
		};
		this.sessions = state.sessions ?? [];
		this.warnings = state.warnings ?? [];
	}

	async query(query: SessionQuery): Promise<SessionQueryResult> {
		this.queries.push({ ...query, session_root: query.session_root });
		return {
			source_info: this.sourceInfo,
			sessions: [...this.sessions],
			warnings: [...this.warnings],
		};
	}
}
