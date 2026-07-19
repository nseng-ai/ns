/**
 * The I/O half of the context-profiler interrogation subsystem: a thin
 * specialization of the shared Pi side-session (see `../side-session/`). The
 * interrogation agent is spawned against a frozen bundle directory with the
 * read-only {@link READ_ONLY_SUBAGENT_TOOLS} allowlist, so it does receive tool events;
 * its exported types are aliases of the shared side-session surface (the bundle
 * directory is passed through as the session cwd).
 */
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { READ_ONLY_SUBAGENT_TOOLS } from "@internal/ns-pi-subagents/runner-subagents";
import {
	createPiSideSessionFactory,
	type CreateSideSessionResult,
	type SideSession,
	type SideSessionAskResult,
} from "../side-session/factory.ts";
import type { SideSessionEvent } from "../side-session/events.ts";

export type InterrogationEvent = SideSessionEvent;
export type AskResult = SideSessionAskResult;
export type InterrogationSession = SideSession;
export type CreateInterrogationSessionResult = CreateSideSessionResult;

export interface InterrogationSessionFactory {
	create(options: {
		bundleDir: string;
		systemPrompt: string;
		modelSelection: ModelSelection;
		modelRegistry: ModelRegistry;
	}): Promise<CreateInterrogationSessionResult>;
}

export function createPiInterrogationSessionFactory(): InterrogationSessionFactory {
	const factory = createPiSideSessionFactory();
	return {
		create({ bundleDir, ...rest }) {
			return factory.create({ ...rest, cwd: bundleDir, tools: READ_ONLY_SUBAGENT_TOOLS });
		},
	};
}
