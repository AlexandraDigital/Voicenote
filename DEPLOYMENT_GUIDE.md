# Voicenote Notion Sync - Deployment Guide

## What You're Deploying

- **Worker:** Backend API for Notion ↔ Cloudflare sync
- **Mobile Web App:** Responsive frontend (works on phone & Galaxy watch)
- **On-demand sync:** Manual trigger via "Sync with Notion" button

---

## Prerequisites

1. **Cloudflare account:** futuresuccess105@gmail.com ✓
2. **GitHub repo:** AlexandraDigital/Voicenote ✓
3. **Notion API key & Database ID** (stored in Cloudflare secrets)
4. **Node.js 18+** installed locally

---

## Step 1: Set Up Notion API

### 1.1 Get Notion API Key

1. Go to https://www.notion.com/my-integrations
2. Create a new integration:
   - Name: "Voicenote Worker"
   - Associated workspace: Your workspace
3. Copy the **Internal Integration Token** (secret key)
4. Share your VoiceNote database with this integration:
   - Open your Notion database
   - Click **Share** → Add the integration

### 1.2 Get Your Database ID

1. Open your VoiceNote database in Notion
2. Copy the URL: `https://notion.so/workspace/VoiceNote-<DATABASE_ID>`
3. The `<DATABASE_ID>` is the long string at the end (remove dashes if copied from URL)

### 1.3 Verify Your Database Schema

Your Notion database **must have these properties:**
- **Title** (text) - Note title
- **Content** (rich text) - Note body
- **Color** (select) - Options: red, orange, yellow, green, blue, purple, pink, gray
- **Tags** (multi-select) - Note tags

---

## Step 2: Update Your GitHub Repo

### 2.1 Add Files to Your Repo

Copy these files to your repo root:

```
AlexandraDigital/Voicenote/
├── src/
│   └── worker.js          (paste content from voicenote-worker.js)
├── public/
│   └── index.html         (paste content from index.html)
├── wrangler.toml          (paste content from wrangler.toml)
├── package.json           (update with below)
└── README.md
```

### 2.2 Create `package.json`

```json
{
  "name": "voicenote-worker",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "wrangler": "^3.56.0"
  }
}
```

### 2.3 Update `wrangler.toml`

Update the routes with your actual Cloudflare domain (already set to `voicenote-bgd.pages.dev`).

---

## Step 3: Create Cloudflare KV Namespace

1. Log in to Cloudflare Dashboard: https://dash.cloudflare.com
2. Go to **Workers & Pages** → **KV** (in sidebar)
3. Create new namespace:
   - Name: `VOICENOTE_KV`
4. Copy the **Namespace ID** 
5. Update `wrangler.toml`:
   ```toml
   [env.production]
   kv_namespaces = [
     { binding = "VOICENOTE_KV", id = "YOUR_NAMESPACE_ID", preview_id = "YOUR_PREVIEW_ID" }
   ]
   ```

---

## Step 4: Add Secrets to Cloudflare

Your secrets are already in Cloudflare, but verify they exist:

1. Cloudflare Dashboard → **Workers & Pages** → **Settings** → **Environment variables**
2. Ensure these secrets exist:
   - `NOTION_API_KEY` - Your Notion integration token
   - `NOTION_DATABASE_ID` - Your Notion database ID

If they don't exist, add them:

```bash
wrangler secret put NOTION_API_KEY
# Paste your Notion API key

wrangler secret put NOTION_DATABASE_ID
# Paste your database ID
```

---

## Step 5: Deploy the Worker

### 5.1 Local Setup

```bash
# Clone repo (if not done)
git clone https://github.com/AlexandraDigital/Voicenote.git
cd Voicenote

# Install dependencies
npm install

# Test locally (optional)
npm run dev
# Open http://localhost:8787
```

### 5.2 Deploy to Cloudflare

```bash
npm run deploy
```

This deploys the Worker to your Cloudflare account.

---

## Step 6: Update Cloudflare Pages Settings

1. Cloudflare Dashboard → **Workers & Pages** → **Pages** → **voicenote-bgd**
2. Go to **Settings** → **Functions**
3. Ensure the Worker is set to route requests to `/api/*` paths
4. Update your Pages build:
   - **Build command:** `npm install` (if needed)
   - **Build output directory:** `public/`
   - **Root directory:** `/`

---

## Step 7: Update Pages Deployment

1. Push your updated files to GitHub:
   ```bash
   git add .
   git commit -m "Add Notion sync Worker and mobile app"
   git push origin main
   ```

2. Cloudflare Pages will auto-deploy from your repo
3. Once deployed, visit: https://voicenote-bgd.pages.dev

---

## Testing the Sync

### 7.1 Test the Web App

1. Open https://voicenote-bgd.pages.dev on your phone
2. Tap **+** to create a new note
3. Fill in: Title, Content, Color, Tags
4. Tap **Create**
5. Tap **"Sync with Notion"** to push to Notion
6. Check your Notion database — the note should appear!

### 7.2 Test Bidirectional Sync

1. Create a note directly in Notion
2. On the web app, tap **"Sync with Notion"**
3. The new note should appear in the app

### 7.3 Test Editing

1. Edit a note in the app
2. Tap **Update**
3. Tap **"Sync with Notion"**
4. Check Notion — it should be updated

---

## API Endpoints

Your Worker exposes these endpoints:

```
GET  /api/notes                    - Fetch all notes (cached from KV)
GET  /api/notes?force=true         - Force sync from Notion
POST /api/notes                    - Create new note
PUT  /api/notes/:id                - Update note
DELETE /api/notes/:id              - Delete note
POST /api/sync                     - Manual sync trigger
```

---

## Mobile Web App Features

✅ **View notes** with color coding  
✅ **Create new notes** (title, content, color, tags)  
✅ **Edit existing notes**  
✅ **Delete notes**  
✅ **Manual sync** with Notion  
✅ **Responsive design** (phone, tablet, Galaxy watch)  
✅ **Color-coded borders** for quick visual identification  

---

## Troubleshooting

### "Sync failed" error

1. Check your Cloudflare secrets:
   ```bash
   wrangler secret list
   ```
2. Verify Notion API key is valid
3. Check if database ID is correct
4. Ensure Notion properties match (Title, Content, Color, Tags)

### Notes not appearing after sync

1. Open browser console (F12) → Console tab
2. Look for error messages
3. Check that your Notion database has all required properties
4. Verify the Notion integration is shared with your database

### Galaxy Watch Not Showing Content

The web app is fully responsive. To view on Galaxy Watch:
1. Open your Cloudflare Pages URL on the watch's browser
2. The app will scale to the watch screen size
3. Use the sync button to refresh

---

## Next Steps

After deployment:
- **Mobile Push Notifications:** Add web notifications for sync events
- **Offline Support:** Use Service Workers for offline access
- **Auto-sync:** Set up Cloudflare cron jobs for scheduled syncs
- **Custom Domain:** Route sync through your own domain

---

## Support

If you encounter issues:
1. Check Cloudflare logs: Dashboard → **Workers** → **Logs**
2. Test API directly: `curl https://voicenote-bgd.pages.dev/api/notes`
3. Verify Notion API access: https://developers.notion.com/docs

---

**Deployed on:** futuresuccess105@gmail.com  
**Repository:** AlexandraDigital/Voicenote  
**Live Site:** https://voicenote-bgd.pages.dev