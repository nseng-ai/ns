import type { ExtensionAPI } from "@nseng-ai/capability-kit/pi-types";
import { RealGitGateway, type GitGateway } from "@nseng-ai/foundation/git";
import type { NsExtensionApi } from "@nseng-ai/sdk";

import { createCliHerdrGateway } from "../core/cli-gateway.ts";
import type { HerdrGateway } from "../core/herdr-gateway.ts";
import type { HerdrPiCommandApi } from "../core/pi-command-api.ts";
import { createHerdrPiCommandApi } from "./pi-command-api.ts";

export type HerdrGitGateway = Pick<GitGateway, "optionalRepoRoot">;
export type HerdrNsExtensionApiFactory = (cwd: string) => Promise<NsExtensionApi>;

export interface HerdrPiContext {
	pi: HerdrPiCommandApi;
	git: HerdrGitGateway;
}

export interface HerdrPiRegistrationContext extends HerdrPiContext {
	herdr: HerdrGateway;
	createNsExtensionApi: HerdrNsExtensionApiFactory;
}

export interface HerdrPiInvocationContext extends HerdrPiContext {
	herdr: HerdrGateway;
	ns: NsExtensionApi | undefined;
}

export type GetHerdrPiContext = () => Promise<HerdrPiInvocationContext>;

export function createHerdrPiRegistrationContext(
	rawPi: ExtensionAPI,
	createNsExtensionApi: HerdrNsExtensionApiFactory,
): HerdrPiRegistrationContext {
	const pi = createHerdrPiCommandApi(rawPi);
	return {
		pi,
		git: new RealGitGateway(pi),
		herdr: createCliHerdrGateway(pi),
		createNsExtensionApi,
	};
}

export function createHerdrPiContextAccessor(
	registration: HerdrPiRegistrationContext,
	cwd: string,
): GetHerdrPiContext {
	let contextPromise: Promise<HerdrPiInvocationContext> | undefined;
	return () => {
		contextPromise ??= createHerdrPiContext(registration, cwd);
		return contextPromise;
	};
}

async function createHerdrPiContext(
	registration: HerdrPiRegistrationContext,
	cwd: string,
): Promise<HerdrPiInvocationContext> {
	let ns: NsExtensionApi | undefined;
	try {
		ns = await registration.createNsExtensionApi(cwd);
	} catch {
		// Optional label enrichment degrades silently. Other workflows require a deliberate adoption policy.
		ns = undefined;
	}
	return {
		pi: registration.pi,
		git: registration.git,
		herdr: registration.herdr,
		ns,
	};
}
