import type {
	ChildSessionEvent,
	ChildSessionGateway,
	ChildSessionHandle,
	ChildSessionOutcome,
	ChildSessionRequest,
} from "./child-session.ts";
import { createEventChannel, type EventChannel } from "./event-channel.ts";

export interface FakeChildSessionScript {
	events?: readonly ChildSessionEvent[];
	outcome: ChildSessionOutcome;
	/**
	 * Runs before the scripted events replay — lets an integration test mutate
	 * a real repo (create a branch, write files) as the "child" would have.
	 */
	onDispatch?: (request: ChildSessionRequest) => void | Promise<void>;
}

/**
 * Declarative fake: consecutive `dispatch` calls consume `scripts` in order.
 * A dispatch beyond the scripted count resolves to a loud `startup-failed`
 * outcome (the handle's `outcome` never rejects, matching the contract).
 */
export class FakeChildSessionGateway implements ChildSessionGateway {
	private readonly scripts: readonly FakeChildSessionScript[];
	private readonly recordedDispatchCalls: ChildSessionRequest[] = [];

	constructor(scripts: readonly FakeChildSessionScript[]) {
		this.scripts = [...scripts];
	}

	get dispatchCalls(): readonly ChildSessionRequest[] {
		return [...this.recordedDispatchCalls];
	}

	dispatch(request: ChildSessionRequest): ChildSessionHandle {
		const script = this.scripts[this.recordedDispatchCalls.length];
		this.recordedDispatchCalls.push({ ...request });
		const channel = createEventChannel<ChildSessionEvent>();
		if (script === undefined) {
			channel.close();
			return {
				events: channel.iterable,
				outcome: Promise.resolve({
					type: "startup-failed",
					message: `FakeChildSessionGateway is out of scripts: dispatch call ${this.recordedDispatchCalls.length} exceeds the ${this.scripts.length} scripted dispatch(es).`,
				}),
			};
		}
		return { events: channel.iterable, outcome: replayScript(script, request, channel) };
	}
}

async function replayScript(
	script: FakeChildSessionScript,
	request: ChildSessionRequest,
	channel: EventChannel<ChildSessionEvent>,
): Promise<ChildSessionOutcome> {
	try {
		if (script.onDispatch !== undefined) await script.onDispatch(request);
	} catch (error) {
		channel.close();
		const message = error instanceof Error ? error.message : String(error);
		return {
			type: "startup-failed",
			message: `FakeChildSessionGateway onDispatch threw: ${message}`,
		};
	}
	for (const event of script.events ?? []) {
		channel.push(event);
	}
	channel.close();
	return script.outcome;
}
