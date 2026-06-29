import readline from "node:readline/promises";

import type { AregPromptGateway } from "../gateways.ts";

export class RealAregPromptGateway implements AregPromptGateway {
	async confirm(request: { message: string; defaultValue: boolean }): Promise<boolean> {
		const suffix = request.defaultValue ? " [Y/n] " : " [y/N] ";
		const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
		try {
			while (true) {
				const answer = (await rl.question(`${request.message}${suffix}`)).trim().toLowerCase();
				if (answer.length === 0) return request.defaultValue;
				if (answer === "y" || answer === "yes") return true;
				if (answer === "n" || answer === "no") return false;
				process.stdout.write("Please answer yes or no.\n");
			}
		} finally {
			rl.close();
		}
	}
}
