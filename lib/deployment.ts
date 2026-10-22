import type { VenueId } from "@/lib/types";
import { getSqlite } from "./db/index";
import {
  SETTING_DEPLOYMENT_MODE,
  parseDeploymentMode,
  readDeploymentFileMode,
  staffLandingPath as staffLandingPathForMode,
  type DeploymentMode,
} from "./deployment-mode";

export type { DeploymentMode } from "./deployment-mode";
export {
  DEPLOYMENT_MODE_LABELS,
  FACTORY_CASHIER_PIN,
  SETTING_DEPLOYMENT_MODE,
} from "./deployment-mode";

let cachedMode: DeploymentMode | null = null;

function setSettingUncached(key: string, value: string) {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

/** Resolve the active deployment mode.
 * Reads app_settings; on first boot bootstraps once from data/deployment.json
 * (written by the Windows installer); defaults to "full". Cached in module scope. */
export function getDeploymentMode(): DeploymentMode {
  if (cachedMode) return cachedMode;

  const sqlite = getSqlite();
  const row = sqlite
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(SETTING_DEPLOYMENT_MODE) as { value: string } | undefined;

  let mode: DeploymentMode;
  const fromDb = parseDeploymentMode(row?.value?.trim());
  if (fromDb) {
    mode = fromDb;
  } else {
    mode = readDeploymentFileMode() ?? "full";
    setSettingUncached(SETTING_DEPLOYMENT_MODE, mode);
  }

  cachedMode = mode;
  return mode;
}

/** Persist the deployment mode to app_settings and refresh the cache. */
export function writeDeploymentMode(mode: DeploymentMode) {
  setSettingUncached(SETTING_DEPLOYMENT_MODE, mode);
  cachedMode = mode;
}

export function isCounterMode(): boolean {
  return getDeploymentMode() === "counter";
}

/** Venue ids that should be visible/usable in the current mode. */
export function activeVenueIds(): VenueId[] {
  return isCounterMode() ? ["restaurant"] : ["restaurant", "cafe"];
}

export function isActiveVenueId(id: string): id is VenueId {
  return (activeVenueIds() as string[]).includes(id);
}

export function staffLandingPath(
  role: "waiter" | "cashier",
  venueId: string,
): string {
  return staffLandingPathForMode(role, venueId, getDeploymentMode());
}
