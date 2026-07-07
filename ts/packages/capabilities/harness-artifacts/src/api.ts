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
export {
	nodeHarnessArtifactFileSystemGateway,
	nodeHarnessArtifactModuleDiscoveryGateway,
	type HarnessArtifactFileSystemErrorInfo,
	type HarnessArtifactFileSystemGateway,
	type HarnessArtifactModuleDiscoveryGateway,
	type ModuleDiscoveryDirectoryEntry,
	type ModuleDiscoveryDirectoryState,
	type ModuleDiscoveryPathState,
	type ModuleDiscoveryTextFileState,
	type OptionalFileState,
	type OptionalTextFileState,
} from "./filesystem.ts";
export type { PathState, TextFileState } from "./fs-state.ts";
export {
	FIRST_PARTY_SKILL_CATALOG_SOURCE_UNAVAILABLE_MESSAGE,
	FIRST_PARTY_SKILL_CATALOG_SOURCE_VERSION,
	firstPartySkillProvisionPathContext,
	resolveFirstPartyCatalogSourceRoot,
} from "./first-party-skill-provisioning.ts";
export {
	ALL_HARNESS_IDS,
	HARNESS_SCOPES,
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
	reconcileReportSchema,
	runHarnessArtifactReconcile,
	type DesiredHarnessArtifact,
	type HarnessManifestSnapshot,
	type HarnessSelectionState,
	type OrphanedManifestEntry,
	type ReconcileArtifactOutcome,
	type ReconcileErrorInfo,
	type ReconcilePair,
	type ReconcileReport,
	type SkippedArtifactCollision,
	type RunHarnessArtifactReconcileRequest,
} from "./reconcile.ts";
export {
	discoverExtensionModuleHarnessArtifacts,
	moduleArtifactDiscoveryDiagnosticSchema,
	type DiscoverExtensionModuleHarnessArtifactsRequest,
	type DiscoverExtensionModuleHarnessArtifactsResult,
	MODULE_ARTIFACT_DISCOVERY_DIAGNOSTIC_CODES,
	type ModuleArtifactDiscoveryDiagnostic,
	type ModuleArtifactDiscoveryDiagnosticCode,
	type ResolvedNpmModuleHarnessArtifactCatalog,
} from "./module-artifact-discovery.ts";
export {
	isValidModuleArtifactRelativePath,
	MODULE_ARTIFACT_DECLARATION_DIAGNOSTIC_CODES,
	parseModuleArtifactDeclaration,
	type ModuleArtifactDeclarationDiagnostic,
	type ModuleArtifactDeclarationDiagnosticCode,
	type ParseModuleArtifactDeclarationResult,
} from "./module-artifact-declaration.ts";
export {
	applyHarnessArtifactProvision,
	applyPreparedProvision,
	INSTALL_MANIFEST_FILE_NAME,
	installManifestPathForPlan,
	prepareProvision,
	previewHarnessArtifactProvision,
	readInstallManifestAtRoot,
	type ApplyPreparedProvisionOptions,
	type HarnessArtifactProvisionAppliedOutcome,
	type HarnessArtifactProvisionApplyOutcome,
	type HarnessArtifactProvisionApplyResult,
	type HarnessArtifactProvisionConflictOutcome,
	type HarnessArtifactProvisionErrorInfo,
	type HarnessArtifactProvisionPreview,
	type HarnessArtifactProvisionRequest,
	type PreparedHarnessArtifactProvision,
} from "./provision-apply.ts";
export {
	buildInstallManifestData,
	buildInstallManifestEntry,
	buildProvisionPlan,
	classifyProvisionDecisions,
	contentHashForBytes,
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
export { sortStrings } from "./sort.ts";
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
