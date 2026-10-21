import {
  createPublicKey,
  randomUUID,
  type KeyObject,
} from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getSqlite } from "@/lib/db";
import {
  verifyLicenseToken,
  type LicensePayload,
} from "./license-core.mjs";

const TRIAL_DAYS = 7;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

type ActivationRow = {
  installation_id: string;
  trial_started_at: string;
  license_token: string | null;
};

export type ActivationStatus = {
  state: "trial" | "licensed" | "expired" | "invalid" | "unlicensed";
  canOperate: boolean;
  installationId: string;
  hasStoredLicense: boolean;
  trialStartedAt: string;
  trialEndsAt: string;
  trialDaysRemaining: number;
  license?: LicensePayload;
  verificationKeyConfigured: boolean;
  verificationKeyMessage?: string;
  message?: string;
};

function getRow(): ActivationRow {
  const sqlite = getSqlite();
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pos_activation (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      installation_id TEXT NOT NULL UNIQUE,
      trial_started_at TEXT NOT NULL,
      license_token TEXT
    )
  `);
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO pos_activation
       (id, installation_id, trial_started_at)
       VALUES (1, ?, ?)`,
    )
    .run(randomUUID(), new Date().toISOString());

  const row = sqlite
    .prepare(
      `SELECT installation_id, trial_started_at, license_token
       FROM pos_activation WHERE id = 1`,
    )
    .get() as ActivationRow | undefined;
  if (!row) {
    throw new Error("Could not initialize POS activation state.");
  }
  return row;
}

function getVerificationKey():
  | { key: KeyObject }
  | { error: "missing" | "invalid" } {
  try {
    const keyPath = process.env.ACTIVATION_PUBLIC_KEY_FILE?.trim();
    const pem = keyPath
      ? readFileSync(keyPath, "utf8")
      : process.env.ACTIVATION_PUBLIC_KEY?.replaceAll("\\n", "\n") ??
        readFileSync(
          path.join(process.cwd(), "data", "license-public.pem"),
          "utf8",
        );
    if (!pem?.trim()) return { error: "missing" };
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "ed25519") return { error: "invalid" };
    return { key };
  } catch {
    return { error: "invalid" };
  }
}

export function getActivationStatus(now = Date.now()): ActivationStatus {
  const row = getRow();
  const trialStartedAt = Date.parse(row.trial_started_at);
  if (!Number.isFinite(trialStartedAt)) {
    throw new Error("Stored POS trial start time is invalid.");
  }
  const trialEndsAt = new Date(trialStartedAt + TRIAL_MS).toISOString();
  const trialDaysRemaining = Math.max(
    0,
    Math.ceil((trialStartedAt + TRIAL_MS - now) / (24 * 60 * 60 * 1000)),
  );
  const hasStoredLicense = Boolean(row.license_token);

  if (row.license_token) {
    const configuredKey = getVerificationKey();
    if ("error" in configuredKey) {
      return {
        state: "invalid",
        canOperate: false,
        installationId: row.installation_id,
        hasStoredLicense,
        trialStartedAt: row.trial_started_at,
        trialEndsAt,
        trialDaysRemaining,
        verificationKeyConfigured: false,
        message:
          configuredKey.error === "missing"
            ? "لم يتم إعداد مفتاح التحقق العام"
            : "مفتاح التحقق العام غير صالح",
      };
    }

    const verification = verifyLicenseToken(
      row.license_token,
      configuredKey.key,
      row.installation_id,
      now,
    );
    if (verification.ok) {
      return {
        state: "licensed",
        canOperate: true,
        installationId: row.installation_id,
        hasStoredLicense,
        trialStartedAt: row.trial_started_at,
        trialEndsAt,
        trialDaysRemaining,
        license: verification.payload,
        verificationKeyConfigured: true,
      };
    }
    if (verification.reason === "expired") {
      return {
        state: "expired",
        canOperate: false,
        installationId: row.installation_id,
        hasStoredLicense,
        trialStartedAt: row.trial_started_at,
        trialEndsAt,
        trialDaysRemaining,
        license: verification.payload,
        verificationKeyConfigured: true,
        message: "انتهت صلاحية الترخيص",
      };
    }
    return {
      state: "invalid",
      canOperate: false,
      installationId: row.installation_id,
      hasStoredLicense,
      trialStartedAt: row.trial_started_at,
      trialEndsAt,
      trialDaysRemaining,
      verificationKeyConfigured: true,
      message: verification.reason,
    };
  }

  const key = getVerificationKey();
  if (now < trialStartedAt + TRIAL_MS) {
    return {
      state: "trial",
      canOperate: true,
      installationId: row.installation_id,
      hasStoredLicense,
      trialStartedAt: row.trial_started_at,
      trialEndsAt,
      trialDaysRemaining,
      verificationKeyConfigured: !("error" in key),
      verificationKeyMessage:
        "error" in key
          ? key.error === "missing"
            ? "لم يتم إعداد مفتاح التحقق العام"
            : "مفتاح التحقق العام غير صالح"
          : undefined,
    };
  }

  return {
    state: "unlicensed",
    canOperate: false,
    installationId: row.installation_id,
    hasStoredLicense,
    trialStartedAt: row.trial_started_at,
    trialEndsAt,
    trialDaysRemaining,
    verificationKeyConfigured: !("error" in key),
    verificationKeyMessage:
      "error" in key
        ? key.error === "missing"
          ? "لم يتم إعداد مفتاح التحقق العام"
          : "مفتاح التحقق العام غير صالح"
        : undefined,
    message: "انتهت الفترة التجريبية",
  };
}

export function activateLicense(
  token: string,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 8192) {
    return { ok: false, reason: "malformed" };
  }
  const configuredKey = getVerificationKey();
  if ("error" in configuredKey) {
    return {
      ok: false,
      reason:
        configuredKey.error === "missing"
          ? "public_key_missing"
          : "public_key_invalid",
    };
  }

  const row = getRow();
  const verification = verifyLicenseToken(
    trimmed,
    configuredKey.key,
    row.installation_id,
  );
  if (!verification.ok) return { ok: false, reason: verification.reason };

  getSqlite()
    .prepare("UPDATE pos_activation SET license_token = ? WHERE id = 1")
    .run(trimmed);
  return { ok: true };
}

export function deactivateLicense() {
  getSqlite()
    .prepare("UPDATE pos_activation SET license_token = NULL WHERE id = 1")
    .run();
}
