import { readFileSync } from "node:fs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readManifestVersion(path) {
  const contents = readFileSync(path, "utf8");
  const match = contents.match(/^version = "([^"]+)"$/m);
  if (!match) {
    throw new Error(`Package version is missing from ${path}`);
  }
  return match[1];
}

function readLockVersion(path, packageName) {
  const contents = readFileSync(path, "utf8");
  const escapedName = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = contents.match(
    new RegExp(`\\[\\[package\\]\\]\\r?\\nname = "${escapedName}"\\r?\\nversion = "([^"]+)"`),
  );
  if (!match) {
    throw new Error(`Package ${packageName} is missing from ${path}`);
  }
  return match[1];
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const expectedVersion = packageJson.version;
const versions = [
  packageLock.version,
  packageLock.packages?.[""]?.version,
  readManifestVersion("src-tauri/Cargo.toml"),
  readLockVersion("src-tauri/Cargo.lock", "quota-float"),
  tauriConfig.version,
];

if (versions.some((version) => version !== expectedVersion)) {
  throw new Error("Release version files are inconsistent");
}

if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${expectedVersion}`) {
  throw new Error("Release tag does not match the application version");
}

const releaseTemplate = readFileSync("docs/RELEASE_TEMPLATE.md", "utf8");
if (!releaseTemplate.startsWith(`# Quota Float ${expectedVersion}\n`)) {
  throw new Error("Release template title does not match the application version");
}

const rustSource = readFileSync("src-tauri/src/lib.rs", "utf8");
if (!rustSource.includes('concat!("QuotaFloat/", env!("CARGO_PKG_VERSION"))')) {
  throw new Error("Quota request user agent is not derived from the Cargo package version");
}

console.log(`Release version ${expectedVersion} is consistent.`);
