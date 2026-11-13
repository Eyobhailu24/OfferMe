import { ServiceUnavailableException } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import type { StorageConfiguration } from "./service-config.js";

export type StoredFile = {
  provider: "s3" | "cloudinary" | "local";
  key: string;
  bucket?: string;
  region?: string;
  url?: string;
  resourceType?: "image" | "raw";
};
export type FileUpload = { key: string; body: Buffer; contentType: string };
export interface FileStorage {
  upload(file: FileUpload): Promise<StoredFile>;
  remove(file: StoredFile): Promise<void>;
  deliveryUrl(file: StoredFile): Promise<string | null>;
}

export class CloudStorage implements FileStorage {
  private clients = new Map<string, S3Client>();
  constructor(private readonly config: StorageConfiguration) {}
  private s3(region: string) {
    let client = this.clients.get(region);
    if (!client) {
      // Standard AWS credentials: environment variables, profiles, or IAM role.
      client = new S3Client({ region, maxAttempts: 2 });
      this.clients.set(region, client);
    }
    return client;
  }
  private cloudOptions() {
    const { cloudName, apiKey, apiSecret } = this.config.cloudinary;
    if (!cloudName || !apiKey || !apiSecret)
      throw new ServiceUnavailableException(
        "Cloudinary storage is not configured.",
      );
    return {
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
      timeout: 30000,
    };
  }
  async upload(file: FileUpload): Promise<StoredFile> {
    if (!/^[a-f0-9-]+(?:\.thumb)?\.[a-z0-9]+$/.test(file.key))
      throw new Error("Invalid storage key");
    if (this.config.provider === "s3") {
      const { bucket, region } = this.config.aws;
      if (!bucket || !region)
        throw new ServiceUnavailableException(
          "AWS storage requires AWS_REGION and AWS_S3_BUCKET.",
        );
      const key = "offerme/" + file.key;
      try {
        await this.s3(region).send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: file.body,
            ContentType: file.contentType,
            CacheControl: "public, max-age=604800, immutable",
          }),
          { abortSignal: AbortSignal.timeout(30000) },
        );
        return { provider: "s3", bucket, region, key };
      } catch {
        throw new ServiceUnavailableException(
          "AWS upload failed. Please try again.",
        );
      }
    }
    const options = this.cloudOptions();
    const resourceType = file.contentType.startsWith("image/")
      ? "image"
      : "raw";
    const publicId =
      "offerme/" +
      (resourceType === "image" ? file.key.replace(/\.[^.]+$/, "") : file.key);
    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            ...options,
            public_id: publicId,
            resource_type: resourceType,
            overwrite: false,
          },
          (error, result) => {
            if (error || !result)
              reject(error || new Error("No upload result"));
            else resolve(result);
          },
        );
        stream.on("error", reject);
        stream.end(file.body);
      });
      if (!result.secure_url?.startsWith("https://"))
        throw new Error("Missing secure delivery URL");
      return {
        provider: "cloudinary",
        key: result.public_id,
        url: result.secure_url,
        resourceType,
      };
    } catch {
      throw new ServiceUnavailableException(
        "Cloudinary upload failed. Please try again.",
      );
    }
  }
  async deliveryUrl(file: StoredFile): Promise<string | null> {
    // Read the original provider, not the current upload preference.
    if (file.provider === "local") return null;
    if (file.provider === "cloudinary") {
      if (!file.url?.startsWith("https://"))
        throw new Error("Invalid stored media URL");
      return file.url;
    }
    if (!file.bucket || !file.region)
      throw new Error("Invalid stored S3 object");
    try {
      return await getSignedUrl(
        this.s3(file.region),
        new GetObjectCommand({ Bucket: file.bucket, Key: file.key }),
        { expiresIn: 900 },
      );
    } catch {
      throw new ServiceUnavailableException(
        "This image is temporarily unavailable.",
      );
    }
  }
  async remove(file: StoredFile) {
    if (file.provider === "s3") {
      if (!file.bucket || !file.region)
        throw new Error("Invalid stored S3 object");
      await this.s3(file.region).send(
        new DeleteObjectCommand({ Bucket: file.bucket, Key: file.key }),
        { abortSignal: AbortSignal.timeout(30000) },
      );
    } else if (file.provider === "cloudinary") {
      await cloudinary.uploader.destroy(file.key, {
        ...this.cloudOptions(),
        resource_type: file.resourceType || "image",
        invalidate: true,
      });
    }
  }
}
