import { test } from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import {
  v2 as cloudinary,
  type UploadApiOptions,
  type UploadApiResponse,
  type UploadResponseCallback,
} from "cloudinary";
import { CloudStorage } from "../src/storage.js";
import { serviceConfiguration } from "../src/service-config.js";

const config = serviceConfiguration({
  AWS: "false",
  CLOUDINARY_CLOUD_NAME: "test-cloud",
  CLOUDINARY_API_KEY: "test-key",
  CLOUDINARY_API_SECRET: "test-secret",
  AWS_REGION: "eu-west-1",
  AWS_S3_BUCKET: "offerme-test",
}).storage;
const file = {
  key: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp",
  body: Buffer.from("test-image"),
  contentType: "image/webp",
};

test("Cloudinary receives image bytes; changing selection still reads old Cloudinary URLs", async (t) => {
  let received = Buffer.alloc(0);
  const upload = t.mock.method(
    cloudinary.uploader,
    "upload_stream",
    (options: UploadApiOptions, callback: UploadResponseCallback) => {
      assert.equal(options.cloud_name, "test-cloud");
      assert.equal(options.api_key, "test-key");
      assert.equal(options.api_secret, "test-secret");
      assert.equal(options.resource_type, "image");
      assert.equal(options.overwrite, false);
      return new Writable({
        write(chunk, _encoding, done) {
          received = Buffer.concat([received, chunk]);
          done();
        },
        final(done) {
          callback(undefined, {
            public_id: options.public_id,
            secure_url:
              "https://res.cloudinary.com/test-cloud/image/upload/test.webp",
          } as UploadApiResponse);
          done();
        },
      });
    },
  );
  const s3 = t.mock.method(S3Client.prototype, "send", async () => {
    throw new Error("Wrong provider");
  });
  const stored = await new CloudStorage(config).upload(file);
  assert.deepEqual(received, file.body);
  assert.equal(upload.mock.callCount(), 1);
  assert.equal(s3.mock.callCount(), 0);
  assert.equal(stored.provider, "cloudinary");
  assert.equal(
    await new CloudStorage({ ...config, provider: "s3" }).deliveryUrl(stored),
    stored.url,
  );
  const remove = t.mock.method(cloudinary.uploader, "destroy", async () => ({
    result: "ok",
  }));
  await new CloudStorage(config).remove(stored);
  assert.equal(remove.mock.calls[0].arguments[0], stored.key);
});

test("AWS uploads private objects with content type and can delete an unrecorded upload", async (t) => {
  const commands: unknown[] = [];
  t.mock.method(S3Client.prototype, "send", async (command: unknown) => {
    commands.push(command);
    return {};
  });
  const cloud = t.mock.method(cloudinary.uploader, "upload_stream", () => {
    throw new Error("Wrong provider");
  });
  const storage = new CloudStorage({ ...config, provider: "s3" });
  const stored = await storage.upload(file);
  assert.equal(stored.provider, "s3");
  assert.equal(stored.bucket, "offerme-test");
  assert.equal(stored.region, "eu-west-1");
  assert.ok(commands[0] instanceof PutObjectCommand);
  assert.equal(commands[0].input.ContentType, "image/webp");
  assert.equal(commands[0].input.ACL, undefined);
  assert.deepEqual(commands[0].input.Body, file.body);
  assert.equal(cloud.mock.callCount(), 0);
  await storage.remove(stored);
  assert.ok(commands[1] instanceof DeleteObjectCommand);
  assert.equal(commands[1].input.Key, stored.key);
});

test("S3 reads retain original bucket/region after switching provider and use expiring URLs", async () => {
  const names = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
  ] as const;
  const previous = names.map((name) => process.env[name]);
  process.env.AWS_ACCESS_KEY_ID = "test-access-key";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
  delete process.env.AWS_SESSION_TOKEN;
  try {
    const url = new URL(
      (await new CloudStorage(config).deliveryUrl({
        provider: "s3",
        bucket: "old-offerme-bucket",
        region: "us-east-1",
        key: "offerme/photo.webp",
      }))!,
    );
    assert.equal(url.hostname, "old-offerme-bucket.s3.us-east-1.amazonaws.com");
    assert.equal(url.pathname, "/offerme/photo.webp");
    assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
    assert.ok(url.searchParams.get("X-Amz-Signature"));
  } finally {
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name];
      else process.env[name] = previous[i];
    });
  }
});

test("missing credentials or provider failure never falls back to another storage provider", async (t) => {
  await assert.rejects(
    new CloudStorage(serviceConfiguration({ AWS: "false" }).storage).upload(
      file,
    ),
    /Cloudinary storage is not configured/,
  );
  await assert.rejects(
    new CloudStorage(serviceConfiguration({ AWS: "true" }).storage).upload(
      file,
    ),
    /AWS storage requires/,
  );
  const cloud = t.mock.method(cloudinary.uploader, "upload_stream", () => {
    throw new Error("secret provider error");
  });
  await assert.rejects(new CloudStorage(config).upload(file), {
    message: "Cloudinary upload failed. Please try again.",
  });
  t.mock.method(S3Client.prototype, "send", async () => {
    throw new Error("secret provider error");
  });
  await assert.rejects(
    new CloudStorage({ ...config, provider: "s3" }).upload(file),
    { message: "AWS upload failed. Please try again." },
  );
  assert.equal(cloud.mock.callCount(), 1);
});
