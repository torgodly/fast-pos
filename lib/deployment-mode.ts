import fs from "node:fs";
import path from "node:path";

/**
 * Pure deployment-mode primitives — no DB imports so db/index and seed can
 * use them without an import cycle.
 */

export type DeploymentMode = "full" | "counter";

export const SETTING_DEPLOYMENT_MODE = "deployment_mode";
export const DEPLOYMENT_FILE_NAME = "deployment.json";

/** PIN of the factory main cashier created on installed (non-demo) systems. */
export const FACTORY_CASHIER_PIN = "2580";

export function parseDeploymentMode(raw: unknown): DeploymentMode | null {
  return raw === "full" || raw === "counter" ? raw : null;
}

/** Parse the contents of deployment.json — null when absent/invalid. */
export function parseDeploymentFile(
  content: string | null | undefined,
): DeploymentMode | null {
  if (!content?.trim()) return null;
  try {
    const parsed = JSON.parse(content) as { mode?: unknown };
    return parseDeploymentMode(parsed?.mode);
  } catch {
    return null;
  }
}

export function deploymentFilePath(): string {
  return path.join(process.cwd(), "data", DEPLOYMENT_FILE_NAME);
}

/** Mode declared by the installer via data/deployment.json; null in dev. */
export function readDeploymentFileMode(): DeploymentMode | null {
  try {
    return parseDeploymentFile(fs.readFileSync(deploymentFilePath(), "utf8"));
  } catch {
    return null;
  }
}

export const DEPLOYMENT_MODE_LABELS: Record<DeploymentMode, string> = {
  full: "مطعم كامل مع طاولات وكافيه",
  counter: "مطعم كاونتر — بدون طاولات",
};

/** After PIN login: counter is cashier quick-sale only. */
export function staffLandingPath(
  role: "waiter" | "cashier",
  venueId: string,
  mode: DeploymentMode,
): string {
  if (mode === "counter") return `/cashier/${venueId}/quick`;
  return role === "waiter" ? `/waiter/${venueId}` : `/cashier/${venueId}`;
}
