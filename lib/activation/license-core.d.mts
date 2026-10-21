import type { KeyObject } from "node:crypto";

export const LICENSE_PRODUCT: "fast-pos";
export const LICENSE_VERSION: 1;

export type LicensePayload = {
  version: 1;
  product: "fast-pos";
  licenseId: string;
  installationId: string;
  issuedAt: string;
  expiresOn: string;
};

export type LicenseVerification =
  | { ok: true; payload: LicensePayload }
  | {
      ok: false;
      reason:
        | "malformed"
        | "invalid_signature"
        | "wrong_product"
        | "wrong_installation"
        | "not_yet_valid"
        | "expired";
      payload?: LicensePayload;
    };

export function createLicensePayload(input: {
  installationId: string;
  expiresOn: string;
  licenseId: string;
  issuedAt?: string;
}): LicensePayload;
export function createLicenseToken(
  payload: LicensePayload,
  privateKey: KeyObject,
): string;
export function verifyLicenseToken(
  token: string,
  publicKey: KeyObject,
  installationId: string,
  now?: number,
): LicenseVerification;
