# Cloudflare Pages Deployment Guide

Deploy your Notion sync backend to Cloudflare Pages in minutes!

## Prerequisites
- Cloudflare account (free tier works)
- GitHub account (already have it!)
- Notion API key
- Notion database ID

## Step 1: Get Cloudflare Credentials

### 1.1 Get your Account ID
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. In the right sidebar, find your Account ID
3. Copy it (you'll need this)

### 1.2 Create API Token
1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Choose "Create Custom Token"
4. Under Permissions:
   - Select "Workers Scripts" → "Edit"
   - Select "Account Settings" → "Read"
5. Click "Continue to summary"
6. Review and click "Create Token"
7. **Copy the token** (you'll use it once)

## Step 2: Add GitHub Secrets

1. Go to your GitHub repo: https://github.com/AlexandraDigital/Voicenote
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**

Add these 4 secrets:

| Secret Name | Value | Where to get it |
|-------------|-------|-----------------|
| `CLOUDFLARE_API_TOKEN` | Your API token from Step 1.2 | Cloudflare dashboard |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID from Step 1.1 | Cloudflare dashboard |
| `NOTION_API_KEY` | Your Notion API key | notion.so/my-integrations |
| `NOTION_DATABASE_ID` | Your database ID | Your Notion database URL |

### How to get NOTION_DATABASE_ID:
1. Open your Notion database
2. Look at the URL: `https://www.notion.so/[LONG-ID]?v=...`
3. The long ID (without the `?v=...` part) is your database ID
4. Example: `35929f4c08ff803a8b90f8aa48b4447a`

## Step 3: Deploy!

1. Go to your GitHub repo
2. Click **Actions** tab
3. Select **Deploy to Cloudflare Pages** workflow
4. Click **Run workflow** → **Run workflow**

✅ Your backend will deploy in about 1-2 minutes!

## Step 4: Get Your Backend URL

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click **Workers & Pages**
3. Find your deployment: `voicenote-notion-sync`
4. Copy the URL (looks like: `https://voicenote-notion-sync.yourname.workers.dev`)

## Step 5: Update Your App

Update your VoiceNote app with the backend URL:

1. Edit your `app.js` file
2. Find the line with `const apiEndpoint`
3. Replace it with your Cloudflare URL:

```javascript
const apiEndpoint = 'https://voicenote-notion-sync.yourname.workers.dev';
```

4. Commit and deploy your app

## Testing Your Setup

### Test 1: Check backend health
```bash
curl https://voicenote-notion-sync.yourname.workers.dev/api/notes
```

Should return: `{"notes": []}`

### Test 2: Create a note from app
1. Open your VoiceNote app
2. Click "Menu" → "Export" → "Export to Notion"
3. Check your Notion database - you should see your note!

### Test 3: Import notes
1. Add a note directly in your Notion database
2. Open VoiceNote app
3. Click "Menu" → "Import" → "Import from Notion"
4. Your new note should appear!

## Troubleshooting

### Deployment fails in GitHub Actions
- Check that all 4 secrets are set correctly
- Make sure your API token hasn't expired
- Check the logs in GitHub Actions tab

### Backend returns 403 error
- Your Notion API key is invalid or expired
- Your database ID is incorrect
- The Notion integration doesn't have permission to your database

### Notes don't sync
- Check your Cloudflare Worker logs: Dashboard → Workers & Pages → your worker → Logs
- Make sure `NOTION_DATABASE_ID` matches your actual database
- Verify the Notion integration has access to your database

### Backend URL shows 404
- Wait 2-3 minutes after deployment
- Clear your browser cache
- Try accessing the URL directly in browser

## Next Steps

✅ Backend is running on Cloudflare
✅ Notes sync to Notion
✅ Access notes from phone, watch, desktop via Notion

Optional: Set up push notifications or create a native mobile app!

## Support

For issues:
1. Check GitHub Actions logs (Actions tab in your repo)
2. Check Cloudflare Worker logs (Workers & Pages dashboard)
3. Verify all secrets are correct
4. Test with curl commands above
