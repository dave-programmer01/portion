import { statSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Test-only module resolver. The app is normally bundled by Metro, which lets
// source files use the `@/…` path alias and extensionless relative imports
// (`./schema`). Node's ESM loader does neither, so for our own source we map
// `@/…` → `src/…` and try `.ts` / `.tsx` / `/index.ts`. node_modules and files
// that already resolve are left to the default resolver.
const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "../..");

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  let targetPath = null;

  if (specifier.startsWith("@/")) {
    targetPath = resolvePath(ROOT, "src", specifier.slice(2));
  } else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentPath = fileURLToPath(context.parentURL);
    // Don't touch relative imports inside dependencies.
    if (!parentPath.includes("/node_modules/")) {
      targetPath = resolvePath(dirname(parentPath), specifier);
    }
  }

  if (targetPath) {
    const candidates = [
      targetPath,
      `${targetPath}.ts`,
      `${targetPath}.tsx`,
      resolvePath(targetPath, "index.ts"),
    ];
    const hit = candidates.find(isFile);
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
