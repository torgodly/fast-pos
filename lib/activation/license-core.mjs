import { sign, verify } from "node:crypto";

export const LICENSE_PRODUCT = "fast-pos";
export const LICENSE_VERSION = 1;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createLicensePayload({
  installationId,
  expiresOn,
  licenseId,
  issuedAt = new Date().toISOString(),
}) {
  if (!UUID_PATTERN.test(installationId)) {
    throw new Error("Installation ID must be a UUID.");
  }
  if (!UUID_PATTERN.test(licenseId)) {
    throw new Error("License ID must be a UUID.");
  }
  if (!isValidDate(expiresOn)) {
    throw new Error("Expiration must use a real YYYY-MM-DD date.");
  }
  if (
    typeof issuedAt !== "string" ||
    !Number.isFinite(Date.parse(issuedAt)) ||
    new Date(issuedAt).toISOString() !== issuedAt
  ) {
    throw new Error("Issue time must be a valid ISO 8601 timestamp.");
  }
  if (expiresOn < issuedAt.slice(0, 10)) {
    throw new Error("Expiration must be on or after the issue date.");
  }

  return {
    version: LICENSE_VERSION,
    product: LICENSE_PRODUCT,
    licenseId,
    installationId,
    issuedAt,
    expiresOn,
  };
}

export function createLicenseToken(payload, privateKey) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = sign(null, Buffer.from(encodedPayload, "base64url"), privateKey)
    .toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyLicenseToken(token, publicKey, installationId, now = Date.now()) {
  if (typeof token !== "string" || token.length > 8192) {
    return { ok: false, reason: "malformed" };
  }

  const parts = token.split(".");
  if (
    parts.length !== 2 ||
    !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  ) {
    return { ok: false, reason: "malformed" };
  }

  const [encodedPayload, encodedSignature] = parts;
  const payloadBytes = Buffer.from(encodedPayload, "base64url");
  const signature = Buffer.from(encodedSignature, "base64url");
  if (
    payloadBytes.toString("base64url") !== encodedPayload ||
    signature.toString("base64url") !== encodedSignature ||
    signature.length !== 64 ||
    !verify(null, payloadBytes, publicKey, signature)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const requiredKeys = [
    "version",
    "product",
    "licenseId",
    "installationId",
    "issuedAt",
    "expiresOn",
  ];
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    Object.keys(payload).length !== requiredKeys.length ||
    !requiredKeys.every((key) => Object.hasOwn(payload, key)) ||
    payload.version !== LICENSE_VERSION ||
    typeof payload.product !== "string" ||
    typeof payload.licenseId !== "string" ||
    typeof payload.installationId !== "string" ||
    typeof payload.issuedAt !== "string" ||
    typeof payload.expiresOn !== "string" ||
    !UUID_PATTERN.test(payload.licenseId) ||
    !UUID_PATTERN.test(payload.installationId) ||
    !Number.isFinite(Date.parse(payload.issuedAt)) ||
    new Date(payload.issuedAt).toISOString() !== payload.issuedAt ||
    !isValidDate(payload.expiresOn)
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (payload.product !== LICENSE_PRODUCT) {
    return { ok: false, reason: "wrong_product" };
  }
  if (payload.installationId !== installationId) {
    return { ok: false, reason: "wrong_installation" };
  }
  if (Date.parse(payload.issuedAt) > now + 5 * 60 * 1000) {
    return { ok: false, reason: "not_yet_valid" };
  }

  const expiresAt = Date.parse(`${payload.expiresOn}T23:59:59.999Z`);
  if (now > expiresAt) {
    return { ok: false, reason: "expired", payload };
  }

  return { ok: true, payload };
}
