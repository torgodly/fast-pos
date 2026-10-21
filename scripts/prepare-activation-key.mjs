import {
  createPublicKey,
} from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const configPath = path.join(
  appData,
  "Fast POS License Generator",
  "settings.json",
);
const configuredPath = process.env.ACTIVATION_PUBLIC_KEY_FILE?.trim();
let publicKeyPath = configuredPath || null;

if (!publicKeyPath && existsSync(configPath)) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (typeof config.publicKeyPath === "string") {
    publicKeyPath = config.publicKeyPath;
  }
}

if (!publicKeyPath) {
  console.warn(
    "No reusable activation public key configured; this build will require ACTIVATION_PUBLIC_KEY_FILE at runtime.",
  );
  process.exit(0);
}

const resolvedSource = path.resolve(publicKeyPath);
if (!existsSync(resolvedSource) || !statSync(resolvedSource).isFile()) {
  throw new Error(`Configured activation public key not found: ${resolvedSource}`);
}

const publicKey = createPublicKey(readFileSync(resolvedSource));
if (publicKey.asymmetricKeyType !== "ed25519") {
  throw new Error("Configured activation public key must be Ed25519.");
}

const destinationDirectory = path.join(process.cwd(), "data");
mkdirSync(destinationDirectory, { recursive: true });
const destination = path.join(destinationDirectory, "license-public.pem");
copyFileSync(resolvedSource, destination);
console.log(`Prepared activation verification key: ${destination}`);
