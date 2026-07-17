// Test-only ESM resolve hook: let raw `node` resolve the repo's extensionless relative imports
// (e.g. `import { X } from "./qualifying"`) to their `.ts` files. The app itself resolves these via
// Next/turbopack + tsc `moduleResolution: bundler`; this hook is ONLY for the plain-node test
// scripts so a lib that value-imports another lib (one-birthplace derivations) stays runnable.
// Touches no application code, tsconfig, or build. Paired with ts-ext-register.mjs (via --import).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExt = /\.[cm]?[jt]s$/i.test(specifier);
  if (isRelative && !hasExt && context.parentURL) {
    const candidate = new URL(specifier + ".ts", context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return nextResolve(specifier + ".ts", context);
    }
  }
  return nextResolve(specifier, context);
}
