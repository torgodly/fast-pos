import {
  generateKeyPairSync,
  randomUUID,
  type KeyObject,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createLicensePayload,
  createLicenseToken,
  verifyLicenseToken,
} from "./license-core.mjs";

function makeLicense(
  privateKey: KeyObject,
  installationId = randomUUID(),
  expiresOn = "2099-12-31",
  issuedAt?: string,
) {
  const payload = createLicensePayload({
    installationId,
    expiresOn,
    licenseId: randomUUID(),
    issuedAt,
  });
  return createLicenseToken(payload, privateKey);
}

describe("offline license verification", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  it("accepts a signed, non-expired license for its installation", () => {
    const installationId = randomUUID();
    const token = makeLicense(privateKey, installationId);

    expect(verifyLicenseToken(token, publicKey, installationId).ok).toBe(true);
  });

  it("rejects a license issued for another installation", () => {
    const token = makeLicense(privateKey);

    expect(verifyLicenseToken(token, publicKey, randomUUID())).toEqual({
      ok: false,
      reason: "wrong_installation",
    });
  });

  it("rejects an expired license", () => {
    const installationId = randomUUID();
    const token = makeLicense(
      privateKey,
      installationId,
      "2024-01-01",
      "2023-01-01T00:00:00.000Z",
    );

    expect(
      verifyLicenseToken(token, publicKey, installationId, Date.now()),
    ).toMatchObject({ ok: false, reason: "expired" });
  });

  it("rejects modified and malformed license tokens", () => {
    const installationId = randomUUID();
    const token = makeLicense(privateKey, installationId);
    const [payload, signature] = token.split(".");
    const tamperedToken = `${payload}.${signature![0] === "A" ? "B" : "A"}${signature!.slice(1)}`;

    expect(
      verifyLicenseToken(tamperedToken, publicKey, installationId),
    ).toMatchObject({ ok: false, reason: "invalid_signature" });
    expect(
      verifyLicenseToken("not-a-license", publicKey, installationId),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects a license with an invalid expiration date", () => {
    expect(() =>
      createLicensePayload({
        installationId: randomUUID(),
        licenseId: randomUUID(),
        expiresOn: "2027-02-30",
      }),
    ).toThrow("Expiration must use a real YYYY-MM-DD date.");
  });
});
