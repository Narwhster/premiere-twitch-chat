import type { Action, Project, ProjectItem, Sequence } from "@adobe/premierepro";
import { fromByteArray, toByteArray } from "base64-js";
import type { Folder } from "./globals";
import { activeProject, activeSequence, fs, ppro, uxp } from "./globals";
import { fail, ok } from "./result";
import type { Result } from "./result";
import { targetTrack } from "./timeline";
import type { Clip } from "./timeline";

export type Recording = { projectItemId: string; name: string };
export type RenderFile = { name: string; path: string; frames: number };
export type Placement = {
  atTicks: string;
  frameHeight: number;
  frameRate: number;
  frameTicks: number;
  secondTicks: number;
};

const syncProperty = "twitchChatReplay.sync";
const renderFolderProperty = "twitchChatReplay.renderFolder";
const settingsKey = "settings";
const clipCacheMs = 1000;
const requestTimeoutMs = 15_000;

async function openProject(): Promise<Result<Project>> {
  const project = await activeProject();
  return project === null ? fail({ kind: "no-sequence" }) : ok(project);
}

async function openSequence(): Promise<Result<{ project: Project; sequence: Sequence }>> {
  const project = await openProject();
  if (!project.ok) return project;
  const sequence = await activeSequence(project.value);
  return sequence === null
    ? fail({ kind: "no-sequence" })
    : ok({ project: project.value, sequence });
}

async function readClips(sequence: Sequence): Promise<Clip[]> {
  const clips: Clip[] = [];
  const trackCount = await sequence.getVideoTrackCount();
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    const track = await sequence.getVideoTrack(trackIndex);
    for (const item of track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false)) {
      clips.push({
        projectItemId: (await item.getProjectItem()).getId(),
        trackIndex,
        start: (await item.getStartTime()).seconds,
        end: (await item.getEndTime()).seconds,
        inPoint: (await item.getInPoint()).seconds,
        speed: await item.getSpeed(),
      });
    }
  }
  return clips;
}

function cachedTimeline() {
  let cache: { sequenceId: string; readAt: number; clips: Clip[] } | null = null;
  return async (): Promise<Result<{ position: number; clips: Clip[] }>> => {
    const open = await openSequence();
    if (!open.ok) return open;
    const { sequence } = open.value;
    const position = (await sequence.getPlayerPosition()).seconds;
    const sequenceId = sequence.guid.toString();
    if (cache?.sequenceId !== sequenceId || Date.now() - cache.readAt > clipCacheMs) {
      cache = { sequenceId, readAt: Date.now(), clips: await readClips(sequence) };
    }
    return ok({ position, clips: cache.clips });
  };
}

async function placement(): Promise<Result<Placement>> {
  const open = await openSequence();
  if (!open.ok) return open;
  const { sequence } = open.value;
  const frameRate = (await sequence.getSettings()).getVideoFrameRate();
  return ok({
    atTicks: (await sequence.getPlayerPosition()).ticks,
    frameHeight: (await sequence.getFrameSize()).height,
    frameRate: frameRate.value,
    frameTicks: frameRate.ticksPerFrame,
    secondTicks: Number(ppro.TickTime.TIME_ONE_SECOND.ticks),
  });
}

async function recordings(): Promise<Result<Recording[]>> {
  const open = await openSequence();
  if (!open.ok) return open;
  const { sequence } = open.value;
  const found = new Map<string, Recording>();
  const trackCount = await sequence.getVideoTrackCount();
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    const track = await sequence.getVideoTrack(trackIndex);
    for (const item of track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false)) {
      const projectItem = await item.getProjectItem();
      const id = projectItem.getId();
      if (found.has(id)) continue;
      const clip = ppro.ClipProjectItem.cast(projectItem);
      if (await clip.isSequence()) continue;
      const path = await clip.getMediaFilePath();
      const masters = await clip.findItemsMatchingMediaPath(path, true);
      if (!masters.some((master) => master.getId() === id)) continue;
      found.set(id, { projectItemId: id, name: projectItem.name });
    }
  }
  return ok([...found.values()]);
}

function transact(project: Project, label: string, create: () => Action[]): boolean {
  let done = false;
  project.lockedAccess(() => {
    done = project.executeTransaction((compound) => {
      for (const action of create()) compound.addAction(action);
    }, label);
  });
  return done;
}

async function loadProjectValue(name: string): Promise<Result<string | null>> {
  const project = await openProject();
  if (!project.ok) return project;
  const properties = await ppro.Properties.getProperties(project.value);
  return ok(properties.hasValue(name) ? properties.getValue(name) : null);
}

async function saveProjectValue(
  name: string,
  value: string,
  label: string,
): Promise<Result<undefined>> {
  const project = await openProject();
  if (!project.ok) return project;
  const properties = await ppro.Properties.getProperties(project.value);
  const saved = transact(project.value, label, () => [
    properties.createSetValueAction(name, value, ppro.Constants.PropertyType.PERSISTENT),
  ]);
  return saved ? ok(undefined) : fail({ kind: "premiere", action: "save to the project" });
}

async function savedRenderFolder(): Promise<Result<Folder | null>> {
  const token = await loadProjectValue(renderFolderProperty);
  if (!token.ok) return token;
  if (token.value === null) return ok(null);
  const entry = await uxp.storage.localFileSystem
    .getEntryForPersistentToken(token.value)
    .catch(() => null);
  return ok(entry?.isFolder === true ? entry : null);
}

async function renderFolderName(): Promise<Result<string | null>> {
  const folder = await savedRenderFolder();
  return folder.ok ? ok(folder.value?.name ?? null) : folder;
}

async function chooseRenderFolder(): Promise<Result<string>> {
  const fileSystem = uxp.storage.localFileSystem;
  const folder = await fileSystem.getFolder();
  if (folder === null) return fail({ kind: "no-folder" });
  const token = await fileSystem.createPersistentToken(folder);
  const saved = await saveProjectValue(renderFolderProperty, token, "Choose Twitch chat folder");
  return saved.ok ? ok(folder.name) : saved;
}

async function writeFile(name: string, base64: string): Promise<Result<string>> {
  const folder = await savedRenderFolder();
  if (!folder.ok) return folder;
  if (folder.value === null) return fail({ kind: "no-folder" });
  const file = await folder.value.createFile(name, { overwrite: true });
  await file.write(new Uint8Array(toByteArray(base64)).buffer, {
    format: uxp.storage.formats.binary,
    append: true,
  });
  return ok(file.nativePath);
}

function tempUrl(name: string): string {
  return `plugin-temp:/${name}`;
}

async function openMov(name: string): Promise<Result<number>> {
  return ok(await fs.open(tempUrl(name), "w+"));
}

async function writeMov(fd: number, base64: string, position: number): Promise<Result<undefined>> {
  const bytes = new Uint8Array(toByteArray(base64));
  await fs.write(fd, bytes.buffer, 0, bytes.length, position);
  return ok(undefined);
}

async function moveIntoRenderFolder(name: string): Promise<Result<string>> {
  const folder = await savedRenderFolder();
  if (!folder.ok) return folder;
  if (folder.value === null) return fail({ kind: "no-folder" });
  const temp = await uxp.storage.localFileSystem.getEntryWithUrl(tempUrl(name));
  await temp.moveTo(folder.value, { newName: name, overwrite: true });
  return ok((await folder.value.getEntry(name)).nativePath);
}

async function finishMov(fd: number, name: string): Promise<Result<string>> {
  await fs.close(fd);
  const moved = await guard("write the render", moveIntoRenderFolder)(name);
  if (!moved.ok) await fs.unlink(tempUrl(name));
  return moved;
}

async function discardMov(fd: number, name: string): Promise<Result<undefined>> {
  await fs.close(fd);
  await fs.unlink(tempUrl(name));
  return ok(undefined);
}

async function importedItem(project: Project, file: RenderFile): Promise<ProjectItem | null> {
  for (const item of await (await project.getRootItem()).getItems()) {
    if (
      item.name === file.name &&
      (await ppro.ClipProjectItem.cast(item).getMediaFilePath()) === file.path
    ) {
      return item;
    }
  }
  return null;
}

async function place(file: RenderFile, atTicks: string): Promise<Result<number>> {
  const open = await openSequence();
  if (!open.ok) return open;
  const { project, sequence } = open.value;
  const root = ppro.ProjectItem.cast(await project.getRootItem());
  const imported = await project.importFiles([file.path], true, root, false);
  const item = imported ? await importedItem(project, file) : null;
  if (item === null) return fail({ kind: "premiere", action: "import the render" });
  const at = ppro.TickTime.createWithTicks(atTicks);
  const length = ppro.TickTime.createWithFrameAndFrameRate(
    file.frames,
    (await sequence.getSettings()).getVideoFrameRate(),
  );
  const target = targetTrack(await readClips(sequence), at.seconds, at.seconds + length.seconds);
  const trackCount = await sequence.getVideoTrackCount();
  const editor = ppro.SequenceEditor.getEditor(sequence);
  const audioTrackForSilentClip = 0;
  const trimmed = transact(project, "Set Twitch chat length", () => [
    ppro.ClipProjectItem.cast(item).createSetInOutPointsAction(
      ppro.TickTime.createWithSeconds(0),
      length,
    ),
  ]);
  if (!trimmed) return fail({ kind: "premiere", action: "set the clip's length" });
  const placed = transact(project, "Place Twitch chat", () => [
    target < trackCount
      ? editor.createOverwriteItemAction(item, at, target, audioTrackForSilentClip)
      : editor.createInsertProjectItemAction(item, at, target, audioTrackForSilentClip, true),
  ]);
  return placed ? ok(target + 1) : fail({ kind: "premiere", action: "place the clip" });
}

async function download<T>(
  url: string,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
): Promise<Result<{ status: number; body: T }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  // oxlint-disable-next-line effect/noTryCatch -- fetch and response-body reads reject; this boundary returns failure values and clears its timeout
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return ok({ status: response.status, body: await read(response) });
  } catch {
    return fail({ kind: "offline" });
  } finally {
    clearTimeout(timer);
  }
}

function guard<A extends unknown[], T>(
  action: string,
  run: (...args: A) => Promise<Result<T>>,
): (...args: A) => Promise<Result<T>> {
  return async (...args) => {
    // oxlint-disable-next-line effect/noTryCatch -- Premiere and UXP operations reject; the host adapter converts them to failure values
    try {
      return await run(...args);
    } catch (error) {
      console.error(error);
      return fail({ kind: "premiere", action });
    }
  };
}

export function createApi() {
  return {
    timeline: guard("read the timeline", cachedTimeline()),
    placement: guard("read the playhead", placement),
    recordings: guard("read the sequence", recordings),
    loadSync: guard("read the saved sync", () => loadProjectValue(syncProperty)),
    saveSync: guard("save the sync", (value: string) =>
      saveProjectValue(syncProperty, value, "Save Twitch chat sync"),
    ),
    loadSettings: guard("read the settings", async () => ok(localStorage.getItem(settingsKey))),
    saveSettings: guard("save the settings", async (value: string) => {
      localStorage.setItem(settingsKey, value);
      return ok(undefined);
    }),
    renderFolderName: guard("read the render folder", renderFolderName),
    chooseRenderFolder: guard("save the render folder", chooseRenderFolder),
    fetchText: (
      url: string,
      init: { method?: string; headers?: Record<string, string>; body?: string } = {},
    ) => download(url, init, (response) => response.text()),
    fetchBase64: (url: string) =>
      download(url, {}, async (response) =>
        fromByteArray(new Uint8Array(await response.arrayBuffer())),
      ),
    writeFile: guard("write the render", writeFile),
    openMov: guard("write the render", openMov),
    writeMov: guard("write the render", writeMov),
    finishMov: guard("write the render", finishMov),
    discardMov: guard("delete the unfinished render", discardMov),
    place: guard("place the clip", place),
  };
}
export type API = ReturnType<typeof createApi>;
