import type { DeploymentCandidate, InspectedDeployment } from "asdl-dev/src/gateways/vercel.ts";
import type { FakeVercelDeploymentRecord } from "./in-memory-gateways.ts";

export function deploymentCandidate(overrides: Partial<DeploymentCandidate> = {}): DeploymentCandidate {
	const candidate: DeploymentCandidate = {
		url: overrides.url ?? "immutable.vercel.app",
		state: overrides.state ?? "READY",
		createdAt: overrides.createdAt ?? 100,
		meta: overrides.meta ?? { githubCommitRef: "feature/demo" },
	};
	if (overrides.readyAt !== undefined) {
		candidate.readyAt = overrides.readyAt;
	}
	return candidate;
}

export function inspectedDeployment(overrides: Partial<InspectedDeployment> = {}): InspectedDeployment {
	return {
		id: overrides.id ?? "dpl_abc123",
		url: overrides.url ?? "immutable.vercel.app",
		aliases: overrides.aliases ?? ["branch-alias.vercel.app"],
	};
}

export function deploymentRecord(overrides: Partial<FakeVercelDeploymentRecord> = {}): FakeVercelDeploymentRecord {
	const meta = overrides.meta ?? {
		githubCommitRef: "feature/demo",
		githubPrId: "767",
		githubCommitSha: "abc123",
		branchAlias: "branch-alias.vercel.app",
	};
	const inspection = overrides.inspection ?? inspectedDeployment();
	const record: FakeVercelDeploymentRecord = {
		project: overrides.project ?? "asdl-tools",
		scope: overrides.scope ?? "schrockns-projects",
		environment: overrides.environment ?? "preview",
		url: overrides.url ?? "immutable.vercel.app",
		state: overrides.state ?? "READY",
		createdAt: overrides.createdAt ?? 1780264074281,
		meta: { ...meta },
		inspection: {
			id: inspection.id,
			url: inspection.url,
			aliases: [...inspection.aliases],
		},
	};
	if (overrides.readyAt !== undefined) {
		record.readyAt = overrides.readyAt;
	} else {
		record.readyAt = 1780264085134;
	}
	return record;
}
