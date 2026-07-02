import { BACKUP_REF_NAMESPACE, BACKUP_REF_PREV_NAMESPACE } from "./constants.ts";

export const LAND_BACKUP_RECOVERY_HINT = `Pre-land branch SHAs are saved under ${BACKUP_REF_NAMESPACE}/<branch>; one previous generation is kept under ${BACKUP_REF_PREV_NAMESPACE}/<branch> (restore with git update-ref refs/heads/<branch> ${BACKUP_REF_NAMESPACE}/<branch>).`;
