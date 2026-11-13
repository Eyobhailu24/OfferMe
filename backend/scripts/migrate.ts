import pg from "pg";
import { configuration } from "../src/config.js";
import { createAuth } from "../src/auth.js";
import { migrate } from "../src/database/migrate.js";
const config = configuration();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
try {
  await migrate(pool, createAuth(pool, config));
  console.log("Database migrations complete.");
} finally {
  await pool.end();
}
