import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import type { AregHostGateway, AregHostToolName, AregToolCheckResult } from "../gateways.ts";

export class RealAregHostGateway implements AregHostGateway {
	async checkTool(options: {
		tool: AregHostToolName;
		cwd: string;
		env: NodeJS.ProcessEnv;
	}): Promise<AregToolCheckResult> {
		const pathValue = options.env.PATH ?? "";
		for (const directory of pathValue.split(path.delimiter)) {
			if (directory.length === 0) continue;
			const candidate = path.join(directory, options.tool);
			if (await isExecutable(candidate))
				return { type: "found", tool: options.tool, path: candidate };
		}
		return {
			type: "missing",
			tool: options.tool,
			message: `Required host tool is missing: ${options.tool}`,
		};
	}
}

async function isExecutable(candidate: string): Promise<boolean> {
	try {
		await access(candidate, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}
