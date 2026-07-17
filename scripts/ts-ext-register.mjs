// Registers the extensionless-.ts resolve hook for plain-node test scripts.
// Usage: node --import ./scripts/ts-ext-register.mjs scripts/<name>.test.mjs
import { register } from "node:module";
register("./ts-ext-resolver.mjs", import.meta.url);
