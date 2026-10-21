#!/usr/bin/env node

import {
  createPrivateKey,
  generateKeyPairSync,
  randomUUID,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  createLicensePayload,
  createLicenseToken,
} from "../lib/activation/license-core.mjs";

function readOptions(args) {
  const options = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const option = args[i];
    if (!option.startsWith("--") || i + 1 >= args.length) {
      throw new Error(`Invalid option: ${option}`);
    }
    options.set(option.slice(2), args[++i]);
  }
  return options;
}

function requireOption(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`Missing required option --${name}.`);
  return value;
}

function generateKeys(options) {
  const outDir = path.resolve(requireOption(options, "out-dir"));
  const privateKeyPath = path.join(outDir, "license-private.pem");
  const publicKeyPath = path.join(outDir, "license-public.pem");
  if (existsSync(privateKeyPath) || existsSync(publicKeyPath)) {
    throw new Error(`Key files already exist in ${outDir}; refusing to overwrite.`);
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({
    type: "pkcs8",
    format: "pem",
  });
  const publicPem = publicKey.export({
    type: "spki",
    format: "pem",
  });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(privateKeyPath, privatePem, { mode: 0o600, flag: "wx" });
  writeFileSync(publicKeyPath, publicPem, { mode: 0o644, flag: "wx" });

  console.log(`Private signing key: ${privateKeyPath}`);
  console.log(`Public verification key: ${publicKeyPath}`);
  console.log("Keep the private key offline and never place it on a POS server.");
  console.log(
    `Configure ACTIVATION_PUBLIC_KEY_FILE=${publicKeyPath} on each POS server.`,
  );
}

function issueLicense(options) {
  const privateKeyPath = path.resolve(requireOption(options, "private-key"));
  const installationId = requireOption(options, "installation-id");
  const expiresOn = requireOption(options, "expires-on");
  const privateKey = createPrivateKey(readFileSync(privateKeyPath));
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("The private key must be an Ed25519 key.");
  }

  const payload = createLicensePayload({
    installationId,
    expiresOn,
    licenseId: options.get("license-id") ?? randomUUID(),
  });
  const token = createLicenseToken(payload, privateKey);
  const outFile = options.get("out");
  if (outFile) {
    const destination = path.resolve(outFile);
    writeFileSync(destination, `${token}\n`, { flag: "wx" });
    console.log(`License written to ${destination}`);
  } else {
    console.log(token);
  }
  console.log(`License ID: ${payload.licenseId}`);
  console.log(`Installation ID: ${payload.installationId}`);
  console.log(`Expires on: ${payload.expiresOn} (UTC)`);
}

function printHelp() {
  console.log(`Offline Fast POS license generator

Commands:
  node scripts/license.mjs keygen --out-dir <private-key-directory>
  node scripts/license.mjs issue --private-key <path> --installation-id <uuid> --expires-on YYYY-MM-DD [--license-id <uuid>] [--out <file>]

Keep the signing private key separate from the POS installation.`);
}

try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    printHelp();
  } else {
    const options = readOptions(args);
    if (command === "keygen") {
      generateKeys(options);
    } else if (command === "issue") {
      issueLicense(options);
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
