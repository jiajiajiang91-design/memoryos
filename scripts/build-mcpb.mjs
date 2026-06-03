#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const serverDir = path.join(repoRoot, "server");
const serverPackagePath = path.join(serverDir, "package.json");
const serverEntry = path.join(serverDir, "dist", "index.mjs");
const stagingDir = path.join(serverDir, ".mcpb-build", "memoryos");
const outputDir = path.join(serverDir, "mcpb");
const outputFile = path.join(outputDir, "memoryos.mcpb");

const args = new Set(process.argv.slice(2));
const skipServerBuild = args.has("--skip-server-build");

function log(message) {
  console.log(`[memoryos-mcpb] ${message}`);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function buildServer() {
  if (skipServerBuild) return;
  log("building server/dist/index.mjs");
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error("npm_execpath is not set. Run this script via npm run build:mcpb.");
  }
  execFileSync(process.execPath, [npmExecPath, "--prefix", serverDir, "run", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

function manifest(serverPackage) {
  return {
    manifest_version: "0.3",
    name: "memoryos",
    display_name: "MemoryOS",
    version: serverPackage.version,
    description:
      "Local-first project working memory for MemoryOS. Pull project context and stage session handoffs for desktop review.",
    long_description:
      "MemoryOS exposes local project working memory through MCP. Tools read project context and stage handoffs into the MemoryOS Inbox; they do not write formal memory files until the user reviews them in the desktop app.",
    author: {
      name: "Jiajia",
    },
    homepage: "https://github.com/jiajiajiang91-design/memoryos",
    documentation: "https://github.com/jiajiajiang91-design/memoryos",
    support: "https://github.com/jiajiajiang91-design/memoryos/issues",
    icon: "icon.png",
    license: "MIT",
    server: {
      type: "node",
      entry_point: "server/index.mjs",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/server/index.mjs"],
        env: {
          MEMORYOS_WORKSPACE: "${user_config.workspace_path}",
        },
      },
    },
    tools: [
      {
        name: "list_projects",
        description: "List MemoryOS projects in the configured local workspace.",
      },
      {
        name: "get_project_memory",
        description:
          "Read project working memory: about_me, project context, decisions, and latest compact context.",
      },
      {
        name: "save_session_handoff",
        description:
          "Stage a structured session handoff into the MemoryOS Inbox for desktop review. This does not write formal memory files.",
      },
    ],
    prompts: [
      {
        name: "end_session",
        description:
          "Ask the model to summarize the session and call save_session_handoff with structured fields.",
        arguments: ["project"],
        text:
          "Summarize this session for MemoryOS, then call save_session_handoff for ${arguments.project}. Do not paste Markdown; use the structured tool fields.",
      },
    ],
    compatibility: {
      platforms: ["darwin", "win32", "linux"],
      runtimes: {
        node: ">=18.0.0",
      },
    },
    user_config: {
      workspace_path: {
        type: "directory",
        title: "MemoryOS workspace",
        description:
          "Select the MemoryOS workspace folder that contains about_me.md and projects/.",
        required: true,
        default: "${DOCUMENTS}/MemoryOS",
      },
    },
  };
}

function validateManifest(data) {
  const required = ["manifest_version", "name", "version", "description", "author", "server"];
  for (const key of required) {
    if (!data[key]) throw new Error(`manifest missing required field: ${key}`);
  }
  if (data.manifest_version !== "0.3") {
    throw new Error(`manifest_version must be 0.3, got ${data.manifest_version}`);
  }
  if (data.server.type !== "node") throw new Error("server.type must be node");
  if (data.server.entry_point !== "server/index.mjs") {
    throw new Error("server.entry_point must be server/index.mjs");
  }
  const config = data.server.mcp_config;
  if (config.command !== "node") throw new Error("server.mcp_config.command must be node");
  if (!config.args?.includes("${__dirname}/server/index.mjs")) {
    throw new Error("server.mcp_config.args must reference ${__dirname}/server/index.mjs");
  }
  if (config.env?.MEMORYOS_WORKSPACE !== "${user_config.workspace_path}") {
    throw new Error("MEMORYOS_WORKSPACE must be sourced from user_config.workspace_path");
  }
  if (data.user_config?.workspace_path?.type !== "directory") {
    throw new Error("user_config.workspace_path must be a directory picker");
  }
}

async function prepareStaging(data) {
  if (!(await pathExists(serverEntry))) {
    throw new Error("server/dist/index.mjs does not exist. Run npm --prefix server run build first.");
  }

  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.mkdir(path.join(stagingDir, "server"), { recursive: true });
  await fs.copyFile(serverEntry, path.join(stagingDir, "server", "index.mjs"));
  await fs.writeFile(path.join(stagingDir, "manifest.json"), JSON.stringify(data, null, 2));

  const iconSource = path.join(repoRoot, "src-tauri", "icons", "128x128.png");
  if (await pathExists(iconSource)) {
    await fs.copyFile(iconSource, path.join(stagingDir, "icon.png"));
  }

  await fs.writeFile(
    path.join(stagingDir, "package.json"),
    JSON.stringify(
      {
        name: "memoryos-mcp-bundle",
        version: data.version,
        type: "module",
        private: true,
      },
      null,
      2
    )
  );
}

async function listFiles(dir, base = dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(abs, base)));
    } else if (entry.isFile()) {
      out.push({
        abs,
        rel: path.relative(base, abs).replace(/\\/g, "/"),
      });
    }
  }
  return out;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function u16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value & 0xffff, 0);
  return buf;
}

function u32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return buf;
}

async function createZip(sourceDir, outFile) {
  const files = await listFiles(sourceDir);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const data = await fs.readFile(file.abs);
    const stat = await fs.stat(file.abs);
    const name = Buffer.from(file.rel, "utf8");
    const crc = crc32(data);
    const { dosTime, dosDate } = dosDateTime(stat.mtime);

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
    ]);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, Buffer.concat([...localParts, central, end]));
  return files.map((file) => file.rel);
}

async function main() {
  buildServer();
  const serverPackage = await readJson(serverPackagePath);
  const data = manifest(serverPackage);
  validateManifest(data);
  await prepareStaging(data);
  const entries = await createZip(stagingDir, outputFile);
  log(`wrote ${path.relative(repoRoot, outputFile)} (${entries.length} files)`);
  for (const entry of entries) log(`  - ${entry}`);
}

main().catch((err) => {
  console.error("[memoryos-mcpb] failed:", err);
  process.exit(1);
});
