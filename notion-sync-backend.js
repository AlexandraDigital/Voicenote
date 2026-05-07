/**
 * Notion Sync Backend for VoiceNotes
 * 
 * This server handles exporting/importing notes to/from Notion.
 * Deploys to Vercel, Heroku, or any Node.js hosting.
 * 
 * Environment Variables Required:
 * - NOTION_API_KEY: Your Notion integration token
 * - NOTION_DATABASE_ID: Your VoiceNote database ID
 * 
 * Usage:
 * npm install notion dotenv express cors
 * node notion-sync-backend.js
 * 
 * Then point your web app to: https://your-deploy-url.com/api/notion-sync
 */

const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Notion client
const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID || "35929f4c08ff803a8b90f8aa48b4447a";

/**
 * GET / - Health check
 */
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'VoiceNotes Notion Sync Backend',
    notionConnected: !!process.env.NOTION_API_KEY
  });
});

/**
 * POST /api/notion-sync
 * Handles both export (notes → Notion) and import (Notion → notes)
 */
app.post('/api/notion-sync', async (req, res) => {
  try {
    const { action, notes, databaseId } = req.body;

    if (action === 'export') {
      return await exportNotesToNotion(notes, databaseId || DATABASE_ID, res);
    } else if (action === 'import') {
      return await importNotesFromNotion(databaseId || DATABASE_ID, res);
    } else {
      res.status(400).json({ error: 'Invalid action. Use "export" or "import".' });
    }
  } catch (error) {
    console.error('Notion sync error:', error);
    res.status(500).json({ 
      error: 'Notion sync failed',
      details: error.message 
    });
  }
});

/**
 * Export notes from VoiceNotes app to Notion database
 */
async function exportNotesToNotion(notes, databaseId, res) {
  try {
    if (!process.env.NOTION_API_KEY) {
      return res.status(401).json({ 
        error: 'NOTION_API_KEY not configured',
        message: 'Please set NOTION_API_KEY environment variable'
      });
    }

    const created = [];
    
    for (const note of notes) {
      try {
        const page = await notion.pages.create({
          parent: { database_id: databaseId },
          properties: {
            'File Name': {
              title: [{ text: { content: note['File Name'] || 'Untitled' } }]
            },
            'File Type': {
              select: { name: 'Audio' }
            },
            'File Size': {
              rich_text: [{ text: { content: note['File Size'] || '0' } }]
            },
            'Status': {
              status: { name: 'Active' }
            },
            'Upload Date': {
              date: {
                start: note['Upload Date'] || new Date().toISOString()
              }
            }
          },
          children: [
            {
              object: 'block',
              type: 'heading_2',
              heading_2: {
                rich_text: [{ text: { content: 'Note Content' } }]
              }
            },
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ text: { content: note.content || '' } }]
              }
            }
          ]
        });

        created.push({
          id: page.id,
          title: note['File Name']
        });
      } catch (noteError) {
        console.warn(`Failed to create note "${note['File Name']}"`, noteError.message);
        // Continue with next note on error
      }
    }

    res.json({
      success: true,
      message: `Exported ${created.length} notes to Notion`,
      created: created,
      total: notes.length
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Export failed',
      details: error.message 
    });
  }
}

/**
 * Import notes from Notion database to VoiceNotes app
 */
async function importNotesFromNotion(databaseId, res) {
  try {
    if (!process.env.NOTION_API_KEY) {
      return res.status(401).json({ 
        error: 'NOTION_API_KEY not configured',
        message: 'Please set NOTION_API_KEY environment variable'
      });
    }

    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 100 // Notion API limit
    });

    const notes = [];

    for (const page of response.results) {
      const props = page.properties;
      
      // Extract note data from Notion page properties
      const note = {
        'File Name': props['File Name']?.title?.[0]?.plain_text || 'Untitled',
        'File Type': props['File Type']?.select?.name || 'Audio',
        'File Size': props['File Size']?.rich_text?.[0]?.plain_text || '0',
        'Status': props['Status']?.status?.name || 'Active',
        'Upload Date': props['Upload Date']?.date?.start || new Date().toISOString(),
        content: '', // We'll try to extract from blocks
        tags: [],
        colorIdx: 0
      };

      // Try to get content from page blocks
      try {
        const blocks = await notion.blocks.children.list({ block_id: page.id });
        const contentBlocks = blocks.results
          .filter(b => b.type === 'paragraph')
          .map(b => b.paragraph?.rich_text?.[0]?.plain_text || '')
          .join('\n');
        
        if (contentBlocks) {
          note.content = contentBlocks;
        }
      } catch (blockError) {
        console.warn('Could not fetch blocks for page', page.id);
      }

      notes.push(note);
    }

    res.json({
      success: true,
      message: `Imported ${notes.length} notes from Notion`,
      notes: notes,
      total: notes.length
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Import failed',
      details: error.message 
    });
  }
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Server error',
    message: err.message 
  });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 VoiceNotes Notion Sync Backend running on port ${port}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Notion API Key: ${process.env.NOTION_API_KEY ? 'Configured' : 'NOT SET'}`);
});

module.exports = app;
