# VoiceNotes ↔ Notion Sync Setup Guide

Your VoiceNote app can now sync with Notion! 📝✨

## What's New

✅ **Export to Notion** - Save all your voice notes to your Notion database  
✅ **Import from Notion** - Pull notes back from Notion into the app  
✅ **Automatic Sync** - Backend handles the heavy lifting  

---

## Step 1: Get Your Notion API Key

1. Go to [notion.so/my-integrations](https://notion.so/my-integrations)
2. Click **"Create new integration"**
3. Name it: `VoiceNotes Sync`
4. Select your workspace
5. Click **"Submit"**
6. Copy your **API Key** (you'll need this)

---

## Step 2: Give Permission to Your Database

1. Go to your **VoiceNote** database in Notion
2. Click the **⋯ (more)** menu in the top right
3. Select **"Connections"**
4. Find and click **"VoiceNotes Sync"** integration
5. Click **"Confirm"**

---

## Step 3: Deploy the Backend Service

You have two options:

### Option A: Deploy to Vercel (Easiest) 🚀

1. Create a GitHub repo with these files:
   - `notion-sync-backend.js`
   - `package.json`
   - `.env.local` (with your NOTION_API_KEY)

2. Go to [vercel.com](https://vercel.com) and connect your repo
3. Add environment variable:
   - `NOTION_API_KEY`: Your API key from Step 1
4. Deploy!
5. Copy your deployment URL (e.g., `https://your-app.vercel.app`)

### Option B: Deploy to Heroku

1. Install Heroku CLI
2. Create a Procfile:
   ```
   web: node notion-sync-backend.js
   ```
3. Run:
   ```bash
   heroku create your-voicenotes-backend
   heroku config:set NOTION_API_KEY="your-api-key"
   git push heroku main
   ```
4. Copy your Heroku URL (e.g., `https://your-voicenotes-backend.herokuapp.com`)

### Option C: Local Development

1. Install Node.js (v16+)
2. In this folder, run:
   ```bash
   npm install
   npm start
   ```
3. Your backend runs at `http://localhost:3001`
4. Use ngrok to expose: `ngrok http 3001`

---

## Step 4: Update Your Web App

Edit your VoiceNote web app and update the `NOTION_CONFIG` in your app.js:

```javascript
const NOTION_CONFIG = {
  databaseId: "35929f4c08ff803a8b90f8aa48b4447a",
  dataSourceId: "35929f4c-08ff-8016-be10-000bb394681b",
  apiEndpoint: "https://YOUR-BACKEND-URL.com/api/notion-sync"
  // ↑ Replace with your actual backend URL
};
```

---

## Step 5: Test the Sync

1. Open your VoiceNote app
2. Open the **Menu (☰)**
3. Click **"Export"** → Select **"Export to Notion"**
4. You should see: ✅ "Notes synced to Notion! Check your database."
5. Go to your Notion database - your notes should be there! 🎉

---

## Using Notion Sync

### Export Notes to Notion
1. Click **Menu** (☰)
2. Click **"Export"**
3. Choose **"Export to Notion"** (or cancel to download as JSON)
4. Notes sync to your Notion database

### Import Notes from Notion
1. Click **Menu** (☰)
2. Click **"Import"**
3. Choose **"Import from Notion"** (or cancel to upload JSON)
4. Notes from Notion appear in your app

---

## Environment Variables

Your backend needs these in a `.env` file:

```
NOTION_API_KEY=ntn_xxx...xxxxx
NOTION_DATABASE_ID=35929f4c08ff803a8b90f8aa48b4447a
PORT=3001
```

---

## Troubleshooting

### "NOTION_API_KEY not configured"
- Check that your backend has the API key in environment variables
- On Vercel: Settings → Environment Variables
- On Heroku: Settings → Config Vars

### "Could not connect to backend"
- Make sure your `apiEndpoint` URL is correct in app.js
- Check that your backend is running: Visit the URL in your browser
- Check CORS headers - backend should allow your app's domain

### Notes not appearing in Notion
- Check that the integration has permission (Step 2)
- Make sure the database ID matches your actual database
- Check backend logs for error messages

### Import returns empty
- Make sure your Notion database has notes with the properties listed below
- Check that the database ID is correct
- Verify the integration has read access

---

## Database Schema

Your VoiceNote database should have these properties:

| Property | Type | Required |
|----------|------|----------|
| Name | Title | ✅ Yes |
| Content | Text | Optional |
| Color | Text | Optional |
| Tags | Multi-select | Optional |
| NoteID | Text | Optional |
| Created | Date | Optional |

---

## Advanced: Automatic Sync

Want to sync automatically? You can set up a trigger:

1. Use IFTTT or Zapier to periodically call your backend
2. Or modify the app to auto-sync on save:
   ```javascript
   // Add after saveNote() function
   if (settings.autoSyncNotion) {
     exportNotesToNotion();
   }
   ```

---

## Need Help?

- **Backend won't start?** - Check Node.js version: `node -v`
- **CORS errors?** - Make sure backend has `cors()` middleware
- **Notion API errors?** - Check your token is correct and has permissions
- **Still stuck?** - Check backend console logs for detailed error messages

---

## Security Notes

🔒 **Keep your API key secret!**
- Never commit `.env` to GitHub
- Don't share your API key publicly
- Rotate keys if compromised

✅ **Use environment variables** for API keys  
✅ **Deploy backend on a trusted server**  
✅ **Use HTTPS** for all connections

---

Enjoy your synced notes! 🎉📝
