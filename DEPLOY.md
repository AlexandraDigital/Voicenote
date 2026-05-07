# 🚀 Voicenote Sync Deployment Guide

Your worker now uses Cloudflare environment variables for secure API key management.

## 📋 Prerequisites

- ✅ Voicenote GitHub repo cloned
- ✅ Cloudflare account with Pages & Workers
- ✅ Notion API key (from [notion.com/my-integrations](https://www.notion.com/my-integrations))
- ✅ Notion VoiceNotes Database ID (from your database URL)

---

## 🔧 Step 1: Update Your Worker Code

Replace your current `src/worker.js` with `worker-final.js`:

```bash
# In your Voicenote repo
cp worker-final.js src/worker.js
git add src/worker.js
git commit -m "feat: simplify sync to Notion with env variables"
```

---

## 🔐 Step 2: Add KV Binding

In your `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "NOTES_KV"
id = "YOUR_KV_NAMESPACE_ID"
preview_id = "YOUR_PREVIEW_KV_ID"
```

Get your KV IDs from Cloudflare Dashboard:
1. Go to **Storage → KV Namespaces**
2. Copy the namespace ID

---

## 🔑 Step 3: Add Environment Variables

In Cloudflare Pages/Workers Dashboard:

1. Go to **Settings → Environment Variables**
2. Add two variables:

| Name | Value |
|------|-------|
| `NOTION_API_KEY` | Your Notion API key |
| `NOTION_DATABASE_ID` | Your VoiceNotes database ID |

Make sure these are set for **Production** environment.

---

## 📤 Step 4: Deploy

```bash
# Deploy to Cloudflare
wrangler deploy

# Or if using Pages
git push origin main
```

---

## ✅ Step 5: Test the Sync

1. Open your Voicenote web app
2. Create a test note
3. Click the **Sync** button
4. Check your Notion database - the note should appear!

---

## 🔍 Troubleshooting

**Sync fails?** Check:
- ✅ NOTION_API_KEY is correct
- ✅ NOTION_DATABASE_ID is correct (without spaces or hyphens)
- ✅ Your Notion integration has database access
- ✅ The VoiceNotes database has Title, Content, Color, Tags properties
- ✅ KV binding is configured in wrangler.toml

**Check logs:**
```bash
wrangler tail
```

---

## 📝 Note Properties

Your VoiceNotes database needs these columns:

| Property | Type | Description |
|----------|------|-------------|
| Title | Title | Note title |
| Content | Text | Full note content |
| Color | Text | Color code (e.g., #FFE5B4) |
| Tags | Multi-select | Note tags |

---

## 🎉 You're Done!

Your notes now sync from KV → Notion → Cloudflare Pages automatically with one click!

Need help? Let me know!
