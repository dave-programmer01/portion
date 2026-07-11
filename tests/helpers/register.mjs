import { register } from "node:module";

// A syntactically valid dummy so importing `src/db/index.ts` (which throws when
// DATABASE_URL is unset) succeeds. The Neon client is lazy and never connects —
// integration tests run every query against a pglite instance instead.
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";

register("./alias-loader.mjs", import.meta.url);
