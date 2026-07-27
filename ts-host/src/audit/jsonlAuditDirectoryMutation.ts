import { promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";

export type JsonlAuditDirectoryMutationMode =
  | "descriptor_relative"
  | "path";

export interface JsonlAuditDirectoryMutationAnchor {
  directoryPath: string;
  handle: FileHandle;
}

export interface JsonlAuditDirectoryMutationPath {
  path: string;
  mode: JsonlAuditDirectoryMutationMode;
}

export interface JsonlAuditTemporaryDirectoryEntry {
  path: string;
  mutationPath: string;
  name: string;
  mode: JsonlAuditDirectoryMutationMode;
}

export async function resolveJsonlAuditDirectoryMutationPath(
  anchor: JsonlAuditDirectoryMutationAnchor,
  entryName: string,
  platform: NodeJS.Platform = process.platform
): Promise<JsonlAuditDirectoryMutationPath> {
  assertJsonlAuditDirectoryEntryName(entryName);
  if (platform === "linux") {
    const descriptorPath = await resolveLinuxProcFdDirectoryPath(anchor.handle);
    if (descriptorPath !== undefined) {
      return {
        path: `${descriptorPath}/${entryName}`,
        mode: "descriptor_relative"
      };
    }
  }
  await assertLogicalDirectoryPathMatchesHandle(anchor);
  return {
    path: path.join(anchor.directoryPath, entryName),
    mode: "path"
  };
}

async function assertLogicalDirectoryPathMatchesHandle(
  anchor: JsonlAuditDirectoryMutationAnchor
): Promise<void> {
  const initialDescriptorStatus = await anchor.handle.stat({ bigint: true });
  const pathStatus = await fs.lstat(anchor.directoryPath, { bigint: true });
  const finalDescriptorStatus = await anchor.handle.stat({ bigint: true });
  if (
    !initialDescriptorStatus.isDirectory()
    || !pathStatus.isDirectory()
    || !finalDescriptorStatus.isDirectory()
    || pathStatus.dev !== initialDescriptorStatus.dev
    || pathStatus.ino !== initialDescriptorStatus.ino
    || finalDescriptorStatus.dev !== initialDescriptorStatus.dev
    || finalDescriptorStatus.ino !== initialDescriptorStatus.ino
  ) {
    throw new Error("Audit directory mutation anchor changed.");
  }
}

export async function createJsonlAuditTemporaryDirectoryEntry(
  parent: JsonlAuditDirectoryMutationAnchor,
  prefixName: string
): Promise<JsonlAuditTemporaryDirectoryEntry> {
  const mutationPath = await resolveJsonlAuditDirectoryMutationPath(
    parent,
    prefixName
  );
  const createdPath = await fs.mkdtemp(mutationPath.path);
  const name = path.basename(createdPath);
  assertJsonlAuditDirectoryEntryName(name);
  if (!name.startsWith(prefixName) || name.length <= prefixName.length) {
    throw new Error("Audit temporary directory returned an invalid entry name.");
  }
  return {
    path: path.join(parent.directoryPath, name),
    mutationPath: createdPath,
    name,
    mode: mutationPath.mode
  };
}

export async function createJsonlAuditDirectoryEntry(
  parent: JsonlAuditDirectoryMutationAnchor,
  entryName: string,
  directoryMode: number
): Promise<JsonlAuditTemporaryDirectoryEntry> {
  const mutationPath = await resolveJsonlAuditDirectoryMutationPath(
    parent,
    entryName
  );
  await fs.mkdir(mutationPath.path, { mode: directoryMode });
  return {
    path: path.join(parent.directoryPath, entryName),
    mutationPath: mutationPath.path,
    name: entryName,
    mode: mutationPath.mode
  };
}

export async function renameJsonlAuditDirectoryEntry(
  source: JsonlAuditDirectoryMutationAnchor,
  sourceEntryName: string,
  destination: JsonlAuditDirectoryMutationAnchor,
  destinationEntryName: string
): Promise<void> {
  const [sourcePath, destinationPath] = await Promise.all([
    resolveJsonlAuditDirectoryMutationPath(source, sourceEntryName),
    resolveJsonlAuditDirectoryMutationPath(destination, destinationEntryName)
  ]);
  await fs.rename(sourcePath.path, destinationPath.path);
}

export async function unlinkJsonlAuditDirectoryEntry(
  parent: JsonlAuditDirectoryMutationAnchor,
  entryName: string
): Promise<void> {
  const mutationPath = await resolveJsonlAuditDirectoryMutationPath(
    parent,
    entryName
  );
  await fs.unlink(mutationPath.path);
}

export async function rmdirJsonlAuditDirectoryEntry(
  parent: JsonlAuditDirectoryMutationAnchor,
  entryName: string
): Promise<void> {
  const mutationPath = await resolveJsonlAuditDirectoryMutationPath(
    parent,
    entryName
  );
  await fs.rmdir(mutationPath.path);
}

function assertJsonlAuditDirectoryEntryName(entryName: string): void {
  if (
    entryName.length === 0
    || entryName === "."
    || entryName === ".."
    || entryName.includes("\0")
    || path.posix.basename(entryName) !== entryName
    || path.win32.basename(entryName) !== entryName
  ) {
    throw new Error("Invalid audit directory mutation entry name.");
  }
}

async function resolveLinuxProcFdDirectoryPath(
  handle: FileHandle
): Promise<string | undefined> {
  const descriptorPath = `/proc/self/fd/${handle.fd}`;
  const initialDescriptorStatus = await handle.stat({ bigint: true });
  if (!initialDescriptorStatus.isDirectory()) {
    throw new Error("Audit directory mutation requires a directory descriptor.");
  }

  let descriptorPathStatus;
  try {
    descriptorPathStatus = await fs.stat(descriptorPath, { bigint: true });
  } catch (error) {
    if (isLinuxProcFdUnavailableError(error)) {
      return undefined;
    }
    throw error;
  }
  const finalDescriptorStatus = await handle.stat({ bigint: true });
  if (
    !descriptorPathStatus.isDirectory()
    || !finalDescriptorStatus.isDirectory()
    || descriptorPathStatus.dev !== initialDescriptorStatus.dev
    || descriptorPathStatus.ino !== initialDescriptorStatus.ino
    || finalDescriptorStatus.dev !== initialDescriptorStatus.dev
    || finalDescriptorStatus.ino !== initialDescriptorStatus.ino
  ) {
    throw new Error("Audit directory mutation descriptor path changed.");
  }
  return descriptorPath;
}

function isLinuxProcFdUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOENT"
    || code === "ENOTDIR"
    || code === "EACCES"
    || code === "EPERM"
    || code === "ENOSYS";
}
