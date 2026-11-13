import { test } from "node:test";
import assert from "node:assert/strict";
import { serviceConfiguration } from "../src/service-config.js";
import { sendOtp } from "../src/sms.js";

test("environment switches parse false correctly and reject mistakes", () => {
  assert.equal(
    serviceConfiguration({ AWS: "false", optbypass: "true" }).storage.provider,
    "cloudinary",
  );
  const enabled = serviceConfiguration({
    AWS: "true",
    optbypass: "false",
    AFROMESSAGE_TOKEN: "test-token",
  });
  assert.equal(enabled.storage.provider, "s3");
  assert.equal(enabled.sms.bypass, false);
  assert.throws(
    () => serviceConfiguration({ AWS: "yes" }),
    /AWS must be true or false/,
  );
  assert.throws(
    () => serviceConfiguration({ optbypass: "flase" }),
    /optbypass must be true or false/,
  );
  assert.throws(
    () => serviceConfiguration({ optbypass: "false" }),
    /AFROMESSAGE_TOKEN is required/,
  );
  assert.throws(
    () => serviceConfiguration({ NODE_ENV: "production" }),
    /AFROMESSAGE_TOKEN is required/,
  );
});

test("OTP bypass prints the code and never contacts AfroMessage even with credentials", async (t) => {
  const log = t.mock.method(console, "info", () => {});
  const network = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected SMS");
  });
  await sendOtp(
    { bypass: true, token: "configured", sender: "OFFERME", from: undefined },
    "+251900000111",
    "123456",
  );
  assert.equal(network.mock.callCount(), 0);
  assert.equal(log.mock.callCount(), 1);
  assert.match(log.mock.calls[0].arguments[0], /\+251900000111: 123456/);
});

test("SMS mode uses AfroMessage credentials, sender and identifier without logging the code", async (t) => {
  const log = t.mock.method(console, "info", () => {});
  const network = t.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL | Request, options?: RequestInit) => {
      assert.equal(url, "https://api.afromessage.com/api/send");
      assert.equal(options?.method, "POST");
      assert.equal(
        new Headers(options?.headers).get("Authorization"),
        "Bearer test-token",
      );
      const body = JSON.parse(options?.body as string);
      assert.equal(body.to, "+251900000111");
      assert.equal(body.sender, "OFFERME");
      assert.equal(body.from, "shortcode-id");
      assert.match(body.message, /123456/);
      assert.ok(options?.signal);
      return Response.json({ acknowledge: "success" });
    },
  );
  await sendOtp(
    {
      bypass: false,
      token: "test-token",
      sender: "OFFERME",
      from: "shortcode-id",
    },
    "+251900000111",
    "123456",
  );
  assert.equal(network.mock.callCount(), 1);
  assert.equal(log.mock.callCount(), 0);
});

test("SMS HTTP, provider, malformed-response and network failures never fall back to console", async (t) => {
  const log = t.mock.method(console, "info", () => {});
  const cases = [
    async () => Response.json({ acknowledge: "success" }, { status: 500 }),
    async () =>
      Response.json({
        acknowledge: "error",
        response: { errors: ["provider details"] },
      }),
    async () => new Response("not JSON"),
    async () => {
      throw new Error("secret provider details");
    },
  ];
  for (const response of cases) {
    const network = t.mock.method(globalThis, "fetch", response);
    await assert.rejects(
      sendOtp(
        {
          bypass: false,
          token: "test-token",
          sender: undefined,
          from: undefined,
        },
        "+251900000111",
        "123456",
      ),
      { message: "We could not send your code. Please try again shortly." },
    );
    network.mock.restore();
  }
  assert.equal(log.mock.callCount(), 0);
});

test("production forbids console OTP bypass and requires configured media storage", () => {
  assert.throws(
    () => serviceConfiguration({ NODE_ENV: "production", optbypass: "true" }),
    /cannot enable OTP/,
  );
  assert.throws(
    () =>
      serviceConfiguration({
        NODE_ENV: "production",
        optbypass: "false",
        AFROMESSAGE_TOKEN: "test",
      }),
    /production storage/,
  );
});
