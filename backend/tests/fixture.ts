import { resolve } from "node:path";
import { removeTestDirectory } from "./cleanup.js";
import assert from "node:assert/strict";
import pg from "pg";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { configuration, type Configuration } from "../src/config.js";
import { createApplication } from "../src/application.js";
import { localTestStorage } from "./local-storage.js";
export async function fixture(
  run: (f: {
    runtime: Awaited<ReturnType<typeof createApplication>>;
    request: (
      path: string,
      method?: string,
      body?: unknown,
      cookie?: string,
    ) => Promise<Response>;
    login: (
      phone: string,
      name: string,
    ) => Promise<{ id: string; cookie: string }>;
    listing: (cookie: string) => Promise<string>;
  }) => Promise<void>,
  overrides: Partial<Configuration> = {},
) {
  const config = configuration();
  const url = new URL(config.databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/offerme_dev");
  const db =
    "offerme_test_" +
    process.pid +
    "_" +
    Date.now() +
    "_" +
    Math.floor(Math.random() * 10000);
  const owner = new pg.Pool({ connectionString: config.databaseUrl });
  await owner.query('CREATE DATABASE "' + db + '"');
  url.pathname = "/" + db;
  const uploadRoot = resolve(".local/test-uploads"),
    uploadDir = resolve(uploadRoot, db);
  const codes = new Map<string, string>();
  let runtime: Awaited<ReturnType<typeof createApplication>> | undefined;
  try {
    runtime = await createApplication(
      {
        ...config,
        ...overrides,
        databaseUrl: url.toString(),
        uploadDir,
        adminPhones: ["+251900000303"],
      },
      {
        migrate: true,
        quiet: true,
        storage: localTestStorage(uploadDir),
        onOtp: (phone, code) => {
          codes.set(phone, code);
        },
      },
    );
    await runtime.app.listen(0, "127.0.0.1");
    const address = runtime.app.getHttpServer().address();
    assert.ok(address && typeof address !== "string");
    const base = "http://127.0.0.1:" + address.port;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      cookie = "",
    ) =>
      fetch(base + path, {
        method,
        headers: {
          origin: config.webOrigin,
          ...(cookie ? { cookie } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const login = async (phone: string, name: string) => {
      assert.equal(
        (
          await request("/api/auth/phone-number/send-otp", "POST", {
            phoneNumber: phone,
          })
        ).status,
        200,
      );
      const response = await request("/api/auth/phone-number/verify", "POST", {
        phoneNumber: phone,
        code: codes.get(phone),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
      const p = await request("/v1/me", "PATCH", { name }, cookie);
      assert.equal(p.status, 200);
      return { ...(await p.json()), cookie } as { id: string; cookie: string };
    };
    const listing = async (cookie: string) => {
      const picture = await sharp({
        create: { width: 16, height: 16, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer();
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(picture)], { type: "image/png" }),
        "image.png",
      );
      const upload = await fetch(base + "/v1/media", {
        method: "POST",
        headers: { cookie, origin: config.webOrigin },
        body: form,
      });
      assert.equal(upload.status, 201);
      const photo = (await upload.json()) as { url: string };
      const response = await request(
        "/v1/listings",
        "POST",
        {
          title: "Exchange test item",
          description: "A secondhand item with actual test photo.",
          defects: "No known defects",
          priceMinor: 50000,
          categoryId: "other",
          subcategory: "general",
          attributes: {},
          condition: "good",
          neighborhood: "Bole",
          negotiable: true,
          images: [photo.url],
        },
        cookie,
      );
      assert.equal(response.status, 201, await response.clone().text());
      return ((await response.json()) as { id: string }).id;
    };
    await run({ runtime, request, login, listing });
  } finally {
    if (runtime) await runtime.close();
    await owner.query('DROP DATABASE "' + db + '" WITH (FORCE)');
    await owner.end();
    await removeTestDirectory(uploadDir, uploadRoot);
  }
}
