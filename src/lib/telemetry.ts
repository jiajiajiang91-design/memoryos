import { appDataDir, join } from "@tauri-apps/api/path";
import { writeTextFile, readTextFile, createDir, exists } from "@tauri-apps/api/fs";

const APP_FOLDER = "memoryos";
const FILE_NAME = "telemetry.jsonl";

async function ensureTelemetryPath(): Promise<string> {
  const base = await appDataDir();
  const dir = await join(base, APP_FOLDER);
  if (!(await exists(dir))) await createDir(dir, { recursive: true });
  return join(dir, FILE_NAME);
}

export async function getTelemetryPath(): Promise<string> {
  return ensureTelemetryPath();
}

export async function getTelemetryDir(): Promise<string> {
  const base = await appDataDir();
  return join(base, APP_FOLDER);
}

export async function logEvent(
  event: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    const path = await ensureTelemetryPath();
    const line =
      JSON.stringify({ ts: new Date().toISOString(), event, ...payload }) + "\n";
    const existing = (await exists(path)) ? await readTextFile(path) : "";
    await writeTextFile(path, existing + line);
  } catch (e) {
    console.warn("telemetry log failed:", e);
  }
}

export function editPercent(original: string, finalContent: string): number {
  if (!original.length) return finalContent.length > 0 ? 100 : 0;
  return Math.round(
    (Math.abs(finalContent.length - original.length) / original.length) * 100
  );
}
