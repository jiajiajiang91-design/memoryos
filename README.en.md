# ◇ MemoryOS

> Turn context scattered across AI tools into working memory that carries forward.

[中文](./README.md) · [Download v0.4.0](../../releases) · [Report an issue](../../issues)

MemoryOS is a desktop app for working memory across AI tools. It turns project goals, decisions, constraints, progress, and reusable methods into structured memory, so ChatGPT, Claude, Gemini, Cursor, Codex, and others can pick up the work faster in a new conversation.

It is not a chat-history warehouse and does not try to preserve everything. MemoryOS focuses on three product questions: **what is worth remembering, what should be read now, and whether an AI-written update can be trusted.**

> **v0.4.0 · Memory-entry libraries**: memory moves from a single card to independent entries with IDs, types, sources, importance, and relationships. It adds ranked opening context, in-session retrieval, archive and restore, while keeping legacy cards as a fallback.

---

## Why MemoryOS

Most AI products keep memory inside their own boundaries. Switch tools or open a new conversation and the user has to explain the project again. As context grows, new problems appear: prompts become too long, obsolete decisions leak into the present, and AI suggestions can be mistaken for user decisions.

MemoryOS turns those problems into one controlled product loop:

| User problem | MemoryOS response |
|---|---|
| Repeating project context in every new chat | One working memory shared across AI workflows |
| Too much context and no clear priority | Ranked opening memory within a 1,200-character budget |
| Older details disappear when they do not fit | On-demand retrieval through `search_memory` |
| Current and superseded decisions get mixed | Stable entry IDs; superseded content is archived, not deleted |
| AI suggestions look like user decisions | Sources are separated at write time; adjustments require review |

---

## The product loop

### 1. Write: turn a conversation into reusable memory

At the end of a session, the AI proposes new or changed memory entries instead of rewriting one long document. Every entry preserves its type and source: user-confirmed content, AI suggestions, AI inferences, and third-party material remain distinct.

### 2. Read: push at the start, pull when needed

At the start of a conversation, MemoryOS ranks entries using type, source certainty, freshness, manual importance, and relationships, then selects the most useful context within a fixed budget.

When the conversation needs an older decision, convention, or method that was not included, an MCP-connected AI can call `search_memory`. Retrieval supports keywords, entry IDs, similar wording, linked entries, and archived history.

### 3. Govern: AI proposes, the user confirms

New entries and AI-proposed relationships, merges, or archive actions go to the inbox first. They change official memory only after confirmation. Rejected suggestions are recorded to prevent repetition. Outdated entries can be archived and later restored instead of being permanently deleted.

---

## Memory architecture

### Three libraries

- **Project library** — goals, decisions, status, and handoffs that belong to one project
- **Global library** — identity and collaboration preferences that apply across projects; the structured form of About Me
- **Skill library** — reusable methods, templates, and lessons that can follow you between projects

Entries can move between the three libraries. Project and skill memory participate in opening-context selection, while global preferences provide cross-project background.

### Two views

- **For me** — the complete library for grouped browsing, search, filters, editing, importance changes, archive actions, and a relationship graph
- **For AI** — the exact compact context used at the start, with a live character count and visibility into entries that did not fit

The importance shown in the interface and the order used for AI reading share the same scoring model, keeping the human and AI views aligned.

---

## Ways to use it

### Copy and paste: works with any AI

1. Copy the start-session prompt from MemoryOS
2. Let the AI load the selected memory and pick up the project
3. Work as usual
4. At the end, ask for a summary and new memory entries, then import and review them in MemoryOS

### Direct MCP connection: Claude Desktop and compatible clients

After installing `memoryos.mcpb` and selecting a workspace, the AI can:

- list projects
- read opening memory
- retrieve historical memory during a conversation
- write the session summary and update proposals to the review inbox

For browser-based AIs that cannot access local files directly, use copy and paste. Both paths feed the same memory system.

---

## Core capabilities

- Memory entries with stable IDs, types, sources, importance, and relationships
- Project / global / skill libraries
- Human and AI views of the same memory
- Ranking based on type, source, freshness, manual priority, and relationships
- Keyword, ID, filter, similar-wording, and linked retrieval
- Draggable, zoomable relationship graph
- Archive, restore, duplicate merge, and supersession
- Review inbox, rejection, and repeat-suggestion prevention
- Per-project migration to entry-based reading with a legacy-card fallback
- Full Chinese and English interface

---

## Install

### Windows installer

Download the v0.4.0 `.exe` or `.msi` from [Releases](../../releases).

Windows may show an “unknown publisher” warning because the project does not yet have a code-signing certificate. Select “More info → Run anyway.”

### Run from source

Requires Node.js 18+, Rust 1.70+, and on Windows, Visual Studio Build Tools with Desktop development with C++.

```bash
git clone https://github.com/jiajiajiang91-design/memoryos.git
cd memoryos
npm install
npm run tauri dev
```

Production build:

```bash
npm run tauri build
```

---

## Data and privacy

MemoryOS stores data in `~/Documents/MemoryOS/` by default:

```text
MemoryOS/
├── about_me.md
├── entries/
│   ├── global.jsonl
│   └── skill.jsonl
└── projects/
    └── <project-name>/
        ├── project.json
        ├── entries.jsonl
        ├── cards.md
        ├── decisions.md
        └── sessions/
```

- No account required
- No automatic chat-history scraping
- No memory uploaded to a MemoryOS server
- Deleted projects go to the system recycle bin and can be undone
- Libraries can be exported and re-imported as Markdown; copying the workspace is a complete backup

---

## Stack

Tauri 1.5 · React 18 · TypeScript · Tailwind CSS · Vite · MCP

---

## Versions

- [x] v0.1 — core workflow, project management, Windows installer, bilingual UI
- [x] v0.2 — MCP connection, memory inbox, Claude Desktop extension
- [x] v0.3 — memory cards, trust mode, new interface
- [x] **v0.4 — memory-entry libraries, three-library/two-view model, ranked reading, retrieval and relationships, entry-native write-back**

Possible next directions, not yet prioritized: more AI clients, macOS / Linux, code signing, true semantic retrieval, and read-access controls.

---

## License

[MIT](LICENSE) © 2026 Jiajia
