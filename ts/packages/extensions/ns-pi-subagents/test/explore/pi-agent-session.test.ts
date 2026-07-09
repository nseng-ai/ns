import { describe, expect, test } from "vitest";

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import {
	PI_IN_PROCESS_RESOURCE_POLICY,
	createPiAgentSessionFactory,
	type PiAgentSessionGateway,
	type PiAgentSessionGatewayCreateInput,
	type PiAgentSessionPort,
} from "../../src/runtime/pi-agent-session.ts";

class FakePiAgentSession implements PiAgentSessionPort {
	readonly sessionFile = "/tmp/pi-in-process.jsonl";
	promptCalls: Array<{ text: string; expandPromptTemplates: boolean }> = [];
	abortCount = 0;
	disposeCount = 0;
	unsubscribeCount = 0;

	subscribe(_listener: (event: AgentSessionEvent) => void): () => void {
		return () => {
			this.unsubscribeCount += 1;
		};
	}

	async prompt(text: string, options: { expandPromptTemplates: boolean }): Promise<void> {
		this.promptCalls.push({ text, ...options });
	}

	async abort(): Promise<void> {
		this.abortCount += 1;
	}

	dispose(): void {
		this.disposeCount += 1;
	}
}

class FakePiAgentSessionGateway implements PiAgentSessionGateway {
	readonly session = new FakePiAgentSession();
	createInputs: PiAgentSessionGatewayCreateInput[] = [];

	async create(input: PiAgentSessionGatewayCreateInput): Promise<PiAgentSessionPort> {
		this.createInputs.push(input);
		return this.session;
	}
}

describe("Pi in-process agent session factory", () => {
	test("pins ambient resources, persistence, prompt expansion, and lifecycle", async () => {
		const gateway = new FakePiAgentSessionGateway();
		const factory = createPiAgentSessionFactory(gateway);
		const session = await factory.create({
			cwd: "/repo",
			tools: ["read", "grep"],
			thinkingLevel: "high",
		});
		const events: string[] = [];
		session.subscribe((event) => events.push(event.type));

		await session.prompt("/template must stay literal");
		await session.abort();
		session.dispose();
		session.dispose();

		expect(gateway.createInputs).toEqual([
			{
				cwd: "/repo",
				tools: ["read", "grep"],
				thinkingLevel: "high",
				resourcePolicy: {
					extensions: false,
					skills: true,
					contextFiles: true,
					delegatedPromptTemplates: false,
				},
				persistentSession: true,
			},
		]);
		expect(PI_IN_PROCESS_RESOURCE_POLICY).toEqual({
			extensions: false,
			skills: true,
			contextFiles: true,
			delegatedPromptTemplates: false,
		});
		expect(gateway.session.promptCalls).toEqual([
			{ text: "/template must stay literal", expandPromptTemplates: false },
		]);
		expect(events).toEqual(["done"]);
		expect(session.sessionFile).toBe("/tmp/pi-in-process.jsonl");
		expect(gateway.session.abortCount).toBe(1);
		expect(gateway.session.unsubscribeCount).toBe(1);
		expect(gateway.session.disposeCount).toBe(1);
	});
});
