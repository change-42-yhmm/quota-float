import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const failures = [];
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { check(path); continue; }
    if (/design-background|DesignPlayground|design-only|\.map$/.test(entry.name)) failures.push(path);
    if (/\.(js|css|html)$/.test(entry.name) && /几何预览|预览验证成功|design-background-|\.design-workbench\s*\{/.test(readFileSync(path, "utf8"))) failures.push(path);
  }
}
check("dist");
if (failures.length) throw new Error("Development-only assets in release: " + failures.join(", "));
console.log("Release assets: no design workbench, preview backgrounds, or source maps.");
