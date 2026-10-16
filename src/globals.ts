import type { premierepro, Project, Sequence } from "@adobe/premierepro";

type Entry = {
  nativePath: string;
  moveTo(folder: Folder, options: { newName: string; overwrite: boolean }): Promise<void>;
};

export type UxpFile = Entry & {
  isFolder: false;
  write(data: ArrayBuffer, options: { format: symbol; append: boolean }): Promise<number>;
};

export type Folder = Entry & {
  isFolder: true;
  name: string;
  createFile(name: string, options: { overwrite: boolean }): Promise<UxpFile>;
  getEntry(path: string): Promise<UxpFile | Folder>;
};

type Uxp = {
  storage: {
    localFileSystem: {
      getFolder(): Promise<Folder | null>;
      createPersistentToken(entry: Folder): Promise<string>;
      getEntryForPersistentToken(token: string): Promise<UxpFile | Folder>;
      getEntryWithUrl(url: string): Promise<UxpFile | Folder>;
    };
    formats: { binary: symbol };
  };
};

type Fs = {
  open(path: string, flag: "w+"): Promise<number>;
  write(
    fd: number,
    buffer: ArrayBuffer,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesWritten: number }>;
  close(fd: number): Promise<number>;
  unlink(path: string): Promise<number>;
};

export const ppro = require("premierepro") as premierepro; // oxlint-disable-line effect/noDynamicImports, effect/noAs -- UXP loads host modules only through require(), which returns any, and Adobe's samples type it with this cast
export const uxp = require("uxp") as Uxp; // oxlint-disable-line effect/noDynamicImports, effect/noAs -- UXP loads host modules only through require(), which returns any, so the type above is applied here
export const fs = require("fs") as Fs; // oxlint-disable-line effect/noDynamicImports, effect/noAs -- UXP loads host modules only through require(), which returns any, so the type above is applied here

export function activeProject(): Promise<Project | null> {
  return ppro.Project.getActiveProject();
}

export function activeSequence(project: Project): Promise<Sequence | null> {
  return project.getActiveSequence();
}
