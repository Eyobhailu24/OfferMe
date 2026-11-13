import { Directory, File, Paths } from "expo-file-system";
import type { ImagePickerAsset } from "expo-image-picker";
import * as Crypto from "expo-crypto";
export type PendingPhoto = {
  id: string;
  uri: string;
  name: string;
  type: string;
};
const directory = new Directory(Paths.document, "offerme-draft-photos");
export async function keepPhoto(
  asset: ImagePickerAsset,
): Promise<PendingPhoto> {
  directory.create({ intermediates: true, idempotent: true });
  const id = Crypto.randomUUID(),
    extension =
      asset.fileName
        ?.split(".")
        .at(-1)
        ?.replace(/[^a-z0-9]/gi, "") || "jpg";
  const local = new File(directory, id + "." + extension);
  await new File(asset.uri).copy(local);
  return {
    id,
    uri: local.uri,
    name: asset.fileName || "photo." + extension,
    type: asset.mimeType || "image/jpeg",
  };
}
export function removePhoto(photo: PendingPhoto) {
  if (!photo.uri.startsWith(directory.uri.replace(/\/+$/, "") + "/")) return;
  try {
    const file = new File(photo.uri);
    if (file.exists) file.delete();
  } catch {}
}
