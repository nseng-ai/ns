import type {
	CommandProgressNotifyLevel,
	ImmediateCommandAckCustomMessage,
} from "../../src/command-ack.ts";

export interface CommandAckFakeContext {
	hasUI?: boolean;
	ui?: {
		notify?(message: string, level?: CommandProgressNotifyLevel): void;
		setStatus?(key: string, value: string | undefined): void;
	};
}

export interface RegisteredCommand {
	description?: string;
	argumentHint?: string;
	handler(args: string, ctx: CommandAckFakeContext): unknown;
}

export class FakeCommandAckHost {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly messages: ImmediateCommandAckCustomMessage[] = [];
	readonly renderers = new Map<string, unknown>();

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	registerMessageRenderer(name: string, renderer: unknown): void {
		this.renderers.set(name, renderer);
	}

	sendMessage(message: ImmediateCommandAckCustomMessage): void {
		this.messages.push(message);
	}
}

export function commandFor(host: FakeCommandAckHost, name: string): RegisteredCommand {
	const command = host.commands.get(name);
	if (command === undefined) throw new Error(`Missing command ${name}`);
	return command;
}

export function createNotifyContext(hasUI?: boolean): {
	ctx: CommandAckFakeContext;
	notifications: Array<[string, CommandProgressNotifyLevel | undefined]>;
} {
	const notifications: Array<[string, CommandProgressNotifyLevel | undefined]> = [];
	return {
		ctx: {
			...(hasUI === undefined ? {} : { hasUI }),
			ui: {
				notify(message, level) {
					notifications.push([message, level]);
				},
			},
		},
		notifications,
	};
}

export function createStatusContext(): {
	ctx: CommandAckFakeContext;
	statuses: Array<[string, string | undefined]>;
} {
	const statuses: Array<[string, string | undefined]> = [];
	return {
		ctx: {
			hasUI: true,
			ui: {
				setStatus(key, value) {
					statuses.push([key, value]);
				},
			},
		},
		statuses,
	};
}
