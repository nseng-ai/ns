export const HARNESS_ARTIFACT_PROVISION_ACTIONS = [
	"installed",
	"refreshed",
	"unchanged",
	"conflicted",
] as const;
export type HarnessArtifactProvisionAction = (typeof HARNESS_ARTIFACT_PROVISION_ACTIONS)[number];

export const DECLARED_ARTIFACT_ACTIVATION_ACTIONS = [
	...HARNESS_ARTIFACT_PROVISION_ACTIONS,
	"removed",
] as const;
export type DeclaredArtifactActivationAction =
	(typeof DECLARED_ARTIFACT_ACTIVATION_ACTIONS)[number];

export const HARNESS_ARTIFACT_RECONCILE_ACTIONS = [
	...DECLARED_ARTIFACT_ACTIVATION_ACTIONS,
	"skipped",
] as const;
export type HarnessArtifactReconcileAction = (typeof HARNESS_ARTIFACT_RECONCILE_ACTIONS)[number];
