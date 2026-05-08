# VoiceNotes — Galaxy Watch + Notion Sync Setup

This guide walks you through the full stack:
**Galaxy Watch app → Cloudflare Worker → KV storage → Notion database → Phone browser**

---

## Architecture Overview

```
Galaxy Watch (Wear OS / Tizen)
       │  POST /watch/quick
       ▼
Cloudflare Worker  ─── KV (NOTES_KV) ──► Phone / Browser (index.html)
       │
       │  POST /sync/push   POST /sync/pull
       ▼
  Notion Database
```

Notes created on the watch are **immediately saved to KV** and **auto-pushed to Notion**. Your phone pulls the latest from Notion any time you open the app or hit "Import from Notion."

---

## Step 1 — Notion Database Setup

### 1a. Create the Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click **"New integration"**
3. Name: `VoiceNotes`
4. Capabilities: check **Read content**, **Update content**, **Insert content**
5. Click **Submit** and copy the **Internal Integration Token** (starts with `ntn_`)

### 1b. Create the Notion Database

In Notion, create a new **full-page database** (table view) with these properties:

| Property name | Type     | Notes                            |
|---------------|----------|----------------------------------|
| `Title`       | Title    | Required — the note title        |
| `Content`     | Text     | Note body                        |
| `Color`       | Text     | Hex color string e.g. `#fff7ed` |
| `Tags`        | Multi-select | Note tags                   |
| `NoteID`      | Text     | Internal ID — do not edit        |
| `Created`     | Date     | Original creation timestamp      |

### 1c. Connect the Integration to Your Database

1. Open your database in Notion
2. Click **⋯ (More)** in the top-right corner
3. Click **Connections** → find **VoiceNotes** → click **Confirm**

### 1d. Get Your Database ID

Your database URL looks like:
```
https://www.notion.so/YOUR-WORKSPACE/XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX?v=...
```
The 32-character string before `?v=` is your **Database ID**.

---

## Step 2 — Deploy the Cloudflare Worker

### 2a. Prerequisites

```bash
npm install -g wrangler
wrangler login
```

### 2b. Create the KV Namespace

```bash
wrangler kv:namespace create NOTES_KV
```

Copy the `id` it prints and paste it into `wrangler.toml`:
```toml
kv_namespaces = [
  { binding = "NOTES_KV", id = "PASTE_ID_HERE" }
]
```

### 2c. Add Secrets (never put keys in wrangler.toml)

```bash
wrangler secret put NOTION_API_KEY
# paste your ntn_... token when prompted

wrangler secret put NOTION_DATABASE_ID
# paste your 32-char database ID when prompted
```

### 2d. Deploy

```bash
wrangler deploy
```

You'll get a URL like:
```
https://voicenote-worker.YOUR-SUBDOMAIN.workers.dev
```

### 2e. Update the Frontend

In `js/app.js`, replace the placeholder:
```javascript
const WORKER_URL = "https://voicenote-worker.YOUR-SUBDOMAIN.workers.dev";
```

### 2f. Test the Worker

```bash
# Health check
curl https://voicenote-worker.YOUR-SUBDOMAIN.workers.dev/health

# Create a test note
curl -X POST https://voicenote-worker.YOUR-SUBDOMAIN.workers.dev/notes \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","content":"Hello from curl","tags":["test"]}'

# Push to Notion
curl -X POST https://voicenote-worker.YOUR-SUBDOMAIN.workers.dev/sync/push
```

---

## Step 3 — Deploy the Web App to Cloudflare Pages

```bash
# From the project root
wrangler pages deploy . --project-name voicenotes-app
```

Or connect via the Cloudflare dashboard: **Pages → Create project → Connect to Git**.

Add an environment variable in Pages settings:
```
WORKER_URL = https://voicenote-worker.YOUR-SUBDOMAIN.workers.dev
```

---

## Step 4 — Galaxy Watch Integration

Galaxy Watch uses **Wear OS** (newer models like Watch 6/7) or **Tizen** (older models). Both can call your worker's HTTP endpoints.

### Option A — Galaxy Watch Web App (Easiest)

Samsung Galaxy Watch supports **web apps** via Tizen Web IDE or Galaxy Watch Studio.

Create a minimal watch web app that calls your worker:

```html
<!-- watch/index.html -->
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { background:#000; color:#fff; font-family:sans-serif; margin:0; padding:10px; }
    button { width:100%; padding:12px; margin:4px 0; border:none; border-radius:8px;
             background:#0ea5e9; color:#fff; font-size:14px; }
    #notes { font-size:12px; overflow-y:auto; max-height:200px; }
    .note-item { border-bottom:1px solid #333; padding:6px 0; }
    textarea { width:100%; background:#111; color:#fff; border:1px solid #333;
               border-radius:6px; padding:8px; font-size:13px; }
  </style>
</head>
<body>
  <textarea id="newNote" rows="3" placeholder="Quick note..."></textarea>
  <button onclick="quickAdd()">+ Add Note</button>
  <button onclick="loadNotes()">↻ Refresh</button>
  <div id="status"></div>
  <div id="notes"></div>

  <script>
    const WORKER = "https://voicenote-worker.YOUR-SUBDOMAIN.workers.dev";

    async function quickAdd() {
      const content = document.getElementById("newNote").value.trim();
      if (!content) return;
      setStatus("Saving...");
      try {
        const r = await fetch(WORKER + "/watch/quick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content })
        });
        if (r.ok) {
          document.getElementById("newNote").value = "";
          setStatus("✓ Saved" + (await r.json()).notion?.synced ? " & synced" : "");
          loadNotes();
        }
      } catch (e) { setStatus("Error: " + e.message); }
    }

    async function loadNotes() {
      setStatus("Loading...");
      try {
        const r = await fetch(WORKER + "/watch/notes");
        const { notes } = await r.json();
        document.getElementById("notes").innerHTML = notes.map(n =>
          `<div class="note-item"><b>${n.title}</b><br><small>${n.preview}</small></div>`
        ).join("");
        setStatus(notes.length + " notes");
      } catch (e) { setStatus("Offline"); }
    }

    function setStatus(msg) {
      document.getElementById("status").textContent = msg;
    }

    loadNotes();
  </script>
</body>
</html>
```

**Deploy to watch:**
1. Open **Samsung Tizen IDE** or **Galaxy Watch Studio**
2. Create a new Web App project
3. Replace the default index.html with the above
4. Update `WORKER` URL
5. Build and install via USB or Galaxy Store Developer Mode

### Option B — Galaxy Watch Wear OS (Native/Flutter)

For Wear OS Galaxy Watches (Watch 4, 5, 6, 7):

```kotlin
// In your Wear OS app (Kotlin)
val workerUrl = "https://voicenote-worker.YOUR-SUBDOMAIN.workers.dev"

suspend fun quickAddNote(content: String): Boolean {
    return withContext(Dispatchers.IO) {
        try {
            val client = OkHttpClient()
            val body = JSONObject().apply { put("content", content) }
            val request = Request.Builder()
                .url("$workerUrl/watch/quick")
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()
            client.newCall(request).execute().isSuccessful
        } catch (e: Exception) { false }
    }
}

suspend fun fetchNotes(): List<WatchNote> {
    return withContext(Dispatchers.IO) {
        val client = OkHttpClient()
        val request = Request.Builder().url("$workerUrl/watch/notes").build()
        val response = client.newCall(request).execute()
        val json = JSONObject(response.body!!.string())
        val arr = json.getJSONArray("notes")
        (0 until arr.length()).map {
            val n = arr.getJSONObject(it)
            WatchNote(n.getString("id"), n.getString("title"), n.getString("preview"))
        }
    }
}
```

Add to `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET" />
```

---

## Step 5 — Auto-Sync Schedule (Optional)

Set up a Cloudflare Cron Trigger to auto-sync every hour:

Add to `wrangler.toml`:
```toml
[triggers]
crons = ["0 * * * *"]
```

Add a `scheduled` handler to `src/worker.js`:
```javascript
export default {
  async fetch(request, env) { /* ... existing code ... */ },

  async scheduled(event, env, ctx) {
    // Auto push+pull every hour
    ctx.waitUntil(syncAuto(env));
  }
};
```

Redeploy: `wrangler deploy`

---

## API Reference

| Method | Endpoint          | Description                            |
|--------|-------------------|----------------------------------------|
| GET    | `/health`         | Check worker + Notion status           |
| GET    | `/notes`          | All notes (full payload)               |
| GET    | `/notes?slim=1`   | Notes with id/title/tags only          |
| POST   | `/notes`          | Create note `{title, content, tags}`   |
| GET    | `/notes/:id`      | Single note                            |
| PUT    | `/notes/:id`      | Update note                            |
| DELETE | `/notes/:id`      | Delete note                            |
| POST   | `/sync/push`      | KV → Notion                            |
| POST   | `/sync/pull`      | Notion → KV (newer-wins merge)         |
| POST   | `/sync/auto`      | Push then pull                         |
| GET    | `/watch/notes`    | Slim list for watch (latest 50)        |
| POST   | `/watch/quick`    | Add note from watch, auto-syncs Notion |

---

## Troubleshooting

**"Missing NOTION_API_KEY"** — Run `wrangler secret put NOTION_API_KEY` again, then redeploy.

**"Notion query failed 404"** — Your `NOTION_DATABASE_ID` is wrong. Double-check the 32-char ID from the database URL.

**"Notion query failed 401"** — Your integration token is wrong or the integration wasn't connected to the database (Step 1c).

**Watch can't reach worker** — Make sure the watch is on WiFi or LTE. Galaxy Watch web apps require network access to be enabled in the app's `config.xml`:
```xml
<access origin="https://voicenote-worker.YOUR-SUBDOMAIN.workers.dev" subdomains="false"/>
```

**Notes not appearing after pull** — Open browser devtools and check for CORS errors. If you deployed to Pages, ensure `WORKER_URL` is correct in `app.js`.
