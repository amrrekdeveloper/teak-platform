import type { Response } from "express";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";

// Server-side buffered file storage helper backed by Replit Object Storage.
// Files are persisted under the private bucket directory so they survive
// redeploys/restarts (unlike the ephemeral local filesystem).

function getPrivateDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) {
    throw new Error(
      "PRIVATE_OBJECT_DIR not set. Object Storage bucket must be configured."
    );
  }
  return dir.endsWith("/") ? dir.slice(0, -1) : dir;
}

function parseObjectPath(fullPath: string): { bucketName: string; objectName: string } {
  const p = fullPath.startsWith("/") ? fullPath : `/${fullPath}`;
  const parts = p.split("/");
  if (parts.length < 3) {
    throw new Error("Invalid object path: must contain a bucket name");
  }
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

function getFileHandle(folder: string, filename: string) {
  const fullPath = `${getPrivateDir()}/${folder}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return objectStorageClient.bucket(bucketName).file(objectName);
}

// Generates a safe, unique filename from an original upload name.
export function makeSafeFilename(originalName: string): string {
  const safeBase = (originalName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}_${safeBase}`;
}

// Saves a buffer to object storage under the given folder/filename.
export async function saveObjectFile(
  folder: string,
  filename: string,
  buffer: Buffer,
  contentType?: string
): Promise<void> {
  const file = getFileHandle(folder, filename);
  await file.save(buffer, {
    resumable: false,
    contentType: contentType || "application/octet-stream",
  });
}

// Returns true if the object exists in storage.
export async function objectFileExists(folder: string, filename: string): Promise<boolean> {
  const [exists] = await getFileHandle(folder, filename).exists();
  return exists;
}

// Streams an object to the HTTP response. Returns false if the object is missing
// (caller should send a 404). Sets Content-Type and optional Content-Disposition.
export async function streamObjectFile(
  folder: string,
  filename: string,
  res: Response,
  opts?: { contentType?: string; disposition?: string }
): Promise<boolean> {
  const file = getFileHandle(folder, filename);
  const [exists] = await file.exists();
  if (!exists) return false;

  let contentType = opts?.contentType;
  if (!contentType) {
    try {
      const [metadata] = await file.getMetadata();
      contentType = (metadata.contentType as string) || "application/octet-stream";
    } catch {
      contentType = "application/octet-stream";
    }
  }
  res.setHeader("Content-Type", contentType);
  if (opts?.disposition) res.setHeader("Content-Disposition", opts.disposition);

  await new Promise<void>((resolve, reject) => {
    file
      .createReadStream()
      .on("error", reject)
      .on("end", () => resolve())
      .pipe(res);
  });
  return true;
}

// Deletes an object from storage. Silently ignores missing files.
export async function deleteObjectFile(folder: string, filename: string): Promise<void> {
  try {
    await getFileHandle(folder, filename).delete({ ignoreNotFound: true } as any);
  } catch {
    /* ignore */
  }
}
