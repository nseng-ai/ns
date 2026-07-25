import { RealGitBrmemGateway, type BrmemReadGateway } from "@nseng-ai/brmem";
import {
	createNsGitGateway,
	NsCommandExecApi,
	NsStdinCapableCommandExecApi,
} from "@nseng-ai/extension-kit";
import { optionalEntries } from "@nseng-ai/foundation/primitives";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import type { HerdrGateway } from "../core/herdr-gateway.ts";

export interface HerdrHandoffTabContext {
	cwd: string;
	herdr: HerdrGateway;
	brmem: Pick<BrmemReadGateway, "checkEntry">;
}

interface HerdrNsExtensionOverrides {
	herdr?: HerdrGateway;
	brmem?: Pick<BrmemReadGateway, "checkEntry">;
}

export function createNsHerdrHandoffTabContext(ctx: NsExtensionApi): HerdrHandoffTabContext {
	const overrides = readHerdrOverrides(ctx);
	const git = createNsGitGateway(ctx);
	return {
		cwd: ctx.cwd,
		herdr: overrides?.herdr ?? createCliHerdrGateway(new NsCommandExecApi(ctx)),
		brmem:
			overrides?.brmem ??
			new RealGitBrmemGateway({
				cwd: ctx.cwd,
				commands: new NsStdinCapableCommandExecApi(ctx),
				git,
			}),
	};
}

function readHerdrOverrides(ctx: NsExtensionApi): HerdrNsExtensionOverrides | undefined {
	const raw = ctx.extensions?.herdr;
	if (raw === undefined || raw === null || typeof raw !== "object") return undefined;
	const overrides = raw as Partial<HerdrNsExtensionOverrides>;
	return optionalEntries({ herdr: overrides.herdr, brmem: overrides.brmem });
}
