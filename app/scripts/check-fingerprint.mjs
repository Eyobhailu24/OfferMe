import assert from "node:assert/strict";
import { createFingerprintAsync } from "@expo/fingerprint";
const result = await createFingerprintAsync(process.cwd());
assert.ok(result.hash);
assert.ok(result.sources.length);
console.info("Expo native fingerprint generated successfully.");
