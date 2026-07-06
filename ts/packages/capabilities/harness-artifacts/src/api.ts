/**
 * Capability API for `@nseng-ai/harness-artifacts` — the shared home for
 * harness-artifact conventions pushed down from `@nseng-ai/areg` (see the
 * `skill-management-subsystem` Objective). Cross-package consumers import
 * from this door only.
 */

export {
	artifactProvisionName,
	HARNESS_ARTIFACT_KINDS,
	type AgentHarnessArtifactEntry,
	type ExtensionBundleHarnessArtifactEntry,
	type FirstPartyHarnessArtifactCatalog,
	type FirstPartyHarnessArtifactSource,
	type HarnessArtifactEntry,
	type HarnessArtifactEntryBase,
	type HarnessArtifactKind,
	type HarnessArtifactSource,
	type NpmModuleHarnessArtifactSource,
	type SkillHarnessArtifactEntry,
} from "./artifact-catalog.ts";
export {
	findFirstPartySkillArtifact,
	listFirstPartySkillArtifacts,
	NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG,
	type FirstPartySkillHarnessArtifact,
} from "./first-party-catalog.ts";
export type { PathState, TextFileState } from "./fs-state.ts";
export {
	FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE,
	FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION,
	firstPartySkillProvisionPathContext,
	resolveFirstPartyCatalogSourceRoot,
} from "./first-party-skill-provisioning.ts";
export {
	ALL_HARNESS_IDS,
	HARNESS_SPECS,
	normalizeHarnessId,
	resolveHarnessArtifactPath,
	resolveHarnessSkillRoot,
	resolveHarnessSpec,
	type HarnessBasePathSpec,
	type HarnessId,
	type HarnessPathContext,
	type HarnessPathEnvironment,
	type HarnessPathErrorInfo,
	type HarnessScope,
	type HarnessScopedPathSpec,
	type HarnessSpec,
	type ResolvedHarnessArtifactPath,
	type ResolvedHarnessSkillRoot,
} from "./harness-paths.ts";
export {
	normalizeHarnessSelection,
	parseNsTomlHarnesses,
	planNsTomlHarnessesWrite,
	renderNsTomlHarnesses,
	type NsTomlChange,
	type NsTomlErrorCode,
	type NsTomlErrorInfo,
	type NsTomlHarnessesParseResult,
	type NsTomlWritePlanResult,
} from "./ns-toml.ts";
export {
	planHarnessArtifactReconcile,
	runHarnessArtifactReconcile,
	type DesiredHarnessArtifact,
	type HarnessManifestSnapshot,
	type HarnessSelectionState,
	type OrphanedManifestEntry,
	type ReconcileArtifactOutcome,
	type ReconcileCollision,
	type ReconcileErrorInfo,
	type ReconcilePair,
	type ReconcilePlanErrorInfo,
	type ReconcileReport,
	type RunHarnessArtifactReconcileRequest,
} from "./reconcile.ts";
export {
	discoverExtensionModuleHarnessArtifacts,
	nodeHarnessArtifactModuleDiscoveryGateway,
	type DiscoverExtensionModuleHarnessArtifactsRequest,
	type DiscoverExtensionModuleHarnessArtifactsResult,
	type HarnessArtifactModuleDiscoveryGateway,
	type ModuleArtifactDiscoveryDiagnostic,
	type ModuleArtifactDiscoveryDiagnosticCode,
	type ModuleArtifactDiscoveryFileSystemErrorInfo,
	type ModuleDiscoveryDirectoryEntry,
	type ModuleDiscoveryDirectoryState,
	type ModuleDiscoveryPathState,
	type ModuleDiscoveryTextFileState,
	type ResolvedNpmModuleHarnessArtifactCatalog,
} from "./module-artifact-discovery.ts";
export {
	isValidModuleArtifactRelativePath,
	parseModuleArtifactDeclaration,
	type ModuleArtifactDeclarationDiagnostic,
	type ModuleArtifactDeclarationDiagnosticCode,
	type ParseModuleArtifactDeclarationResult,
} from "./module-artifact-declaration.ts";
export {
	applyHarnessArtifactProvision,
	INSTALL_MANIFEST_FILE_NAME,
	installManifestPathForPlan,
	nodeHarnessArtifactFileSystemGateway,
	previewHarnessArtifactProvision,
	readInstallManifestAtRoot,
	type ApplyHarnessArtifactProvisionRequest,
	type HarnessArtifactFileSystemErrorInfo,
	type HarnessArtifactFileSystemGateway,
	type HarnessArtifactProvisionApplyResult,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessArtifactProvisionPreview,
	type HarnessArtifactProvisionRequest,
	type OptionalTextFileState,
} from "./provision-apply.ts";
export {
	buildInstallManifestData,
	buildInstallManifestEntry,
	buildProvisionPlan,
	classifyProvisionDecisions,
	contentHashForText,
	installManifestKey,
	type BuildProvisionPlanInput,
	type InstallManifestData,
	type InstallManifestEntryData,
	type InstallManifestFileData,
	type InstallManifestSourceData,
	type ProvisionDecisionErrorInfo,
	type ProvisionDecisionSet,
	type ProvisionFileDecision,
	type ProvisionFileDecisionType,
	type ProvisionPlan,
	type ProvisionPlanErrorInfo,
	type ProvisionPlanFile,
	type ProvisionSourceFile,
	type ProvisionSourceProvenance,
	type ProvisionableHarnessArtifactEntry,
	type TargetFileHashFact,
} from "./provision-plan.ts";
export {
	parseSkillFrontmatterBlock,
	parseSkillFrontmatterTopLevelLine,
	isSkillFrontmatterTopLevelKey,
	transformSkillFrontmatter,
	type SkillFrontmatterData,
	type SkillFrontmatterParseResult,
	type SkillFrontmatterTopLevelLineParseResult,
} from "./skill-frontmatter.ts";
export {
	agentsSkillMirrorRelativePath,
	claudeSkillMirrorRelativePath,
	classifySkillMirrorSymlinkState,
	expectedAgentsSkillSymlinkTarget,
	expectedClaudeSkillSymlinkTarget,
	expectedMirrorTarget,
	isAgentsSkillMirror,
	isClaudeSkillMirror,
	isSkillMirrorRelativePath,
	parseSkillMirrorRelativePath,
	type SkillMirrorKind,
	type SkillMirrorRelativePathInfo,
} from "./skill-mirror-conventions.ts";
export {
	parseInspectedLockfile,
	parseLockfileData,
	parseLockfileText,
	SOURCE_TYPES,
	type LockfileSkill,
	type LockfileSkillData,
	type SkillsLockfile,
	type SkillsLockfileData,
	type SourceType,
} from "./skills-lockfile.ts";
