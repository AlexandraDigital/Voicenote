/**
 * Voicenote Notion ↔ Cloudflare Sync Worker
 * Handles bidirectional sync between Notion and Cloudflare KV
 * Supports manual export/import for backup and sync
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // GET /api/notes - Fetch all notes from KV (or sync from Notion)
      if (path === '/api/notes' && request.method === 'GET') {
        const force = url.searchParams.get('force') === 'true';
        
        if (force) {
          // Force sync from Notion
          const notes = await syncNotesFromNotion(env);
          return new Response(JSON.stringify(notes), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Return cached notes from KV
        const cached = await env.VOICENOTE_KV.get('notes', 'json');
        return new Response(JSON.stringify(cached || []), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // POST /api/notes - Create new note (and sync to Notion)
      if (path === '/api/notes' && request.method === 'POST') {
        const note = await request.json();
        const notionId = await createNoteInNotion(note, env);
        
        // Store in KV
        const notes = await env.VOICENOTE_KV.get('notes', 'json') || [];
        const newNote = { ...note, id: notionId, synced: true };
        notes.push(newNote);
        await env.VOICENOTE_KV.put('notes', JSON.stringify(notes));

        return new Response(JSON.stringify(newNote), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // PUT /api/notes/:id - Update note (and sync to Notion)
      if (path.match(/^\/api\/notes\/[^/]+$/) && request.method === 'PUT') {
        const id = path.split('/').pop();
        const updates = await request.json();
        
        // Update in Notion
        await updateNoteInNotion(id, updates, env);
        
        // Update in KV
        const notes = await env.VOICENOTE_KV.get('notes', 'json') || [];
        const index = notes.findIndex(n => n.id === id);
        if (index !== -1) {
          notes[index] = { ...notes[index], ...updates, synced: true };
          await env.VOICENOTE_KV.put('notes', JSON.stringify(notes));
        }

        return new Response(JSON.stringify(notes[index]), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // DELETE /api/notes/:id - Delete note
      if (path.match(/^\/api\/notes\/[^/]+$/) && request.method === 'DELETE') {
        const id = path.split('/').pop();
        
        // Delete from Notion
        await deleteNoteInNotion(id, env);
        
        // Remove from KV
        const notes = await env.VOICENOTE_KV.get('notes', 'json') || [];
        const filtered = notes.filter(n => n.id !== id);
        await env.VOICENOTE_KV.put('notes', JSON.stringify(filtered));

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // POST /api/sync - Manual sync from Notion to KV
      if (path === '/api/sync' && request.method === 'POST') {
        const notes = await syncNotesFromNotion(env);
        return new Response(JSON.stringify({ synced: notes.length, notes }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // GET /api/export - Export all notes as JSON (backup)
      if (path === '/api/export' && request.method === 'GET') {
        const notes = await env.VOICENOTE_KV.get('notes', 'json') || [];
        const exportData = {
          exported: new Date().toISOString(),
          count: notes.length,
          notes: notes,
        };

        return new Response(JSON.stringify(exportData, null, 2), {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="voicenotes-export.json"',
          },
        });
      }

      // POST /api/import - Import notes from JSON and sync to Notion
      if (path === '/api/import' && request.method === 'POST') {
        const importData = await request.json();
        const notes = importData.notes || importData;

        // Validate notes array
        if (!Array.isArray(notes)) {
          return new Response(JSON.stringify({ error: 'Invalid format. Expected array of notes.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Create each note in Notion
        const results = [];
        for (const note of notes) {
          try {
            const notionId = await createNoteInNotion(note, env);
            results.push({
              title: note.title,
              notionId,
              status: 'synced',
            });
          } catch (err) {
            results.push({
              title: note.title,
              status: 'error',
              error: err.message,
            });
          }
        }

        // Update KV cache with all notes
        const kvNotes = await env.VOICENOTE_KV.get('notes', 'json') || [];
        const updatedNotes = [...kvNotes];
        for (let i = 0; i < notes.length; i++) {
          if (results[i].status === 'synced') {
            const existingIndex = updatedNotes.findIndex(n => n.title === notes[i].title);
            if (existingIndex === -1) {
              updatedNotes.push({ ...notes[i], id: results[i].notionId, synced: true });
            }
          }
        }
        await env.VOICENOTE_KV.put('notes', JSON.stringify(updatedNotes));

        return new Response(JSON.stringify({
          imported: results.length,
          results,
          timestamp: new Date().toISOString(),
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

/**
 * Sync notes from Notion to KV
 */
async function syncNotesFromNotion(env) {
  const notionToken = env.NOTION_API_KEY;
  const databaseId = env.NOTION_DATABASE_ID;

  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2024-02-15',
    },
    body: JSON.stringify({}),
  });

  const data = await response.json();
  const notes = data.results.map(page => ({
    id: page.id,
    title: getPropertyValue(page, 'Title'),
    content: getPropertyValue(page, 'Content'),
    color: getPropertyValue(page, 'Color'),
    tags: getPropertyValue(page, 'Tags'),
    created: page.created_time,
    updated: page.last_edited_time,
  }));

  await env.VOICENOTE_KV.put('notes', JSON.stringify(notes));
  return notes;
}

/**
 * Create note in Notion
 */
async function createNoteInNotion(note, env) {
  const notionToken = env.NOTION_API_KEY;
  const databaseId = env.NOTION_DATABASE_ID;

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2024-02-15',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        Title: { title: [{ text: { content: note.title || 'Untitled' } }] },
        Content: { rich_text: [{ text: { content: note.content || '' } }] },
        Color: { select: { name: note.color || 'gray' } },
        Tags: { multi_select: (note.tags || []).map(t => ({ name: t })) },
      },
    }),
  });

  const data = await response.json();
  if (!data.id) {
    throw new Error(data.message || 'Failed to create note in Notion');
  }
  return data.id;
}

/**
 * Update note in Notion
 */
async function updateNoteInNotion(pageId, updates, env) {
  const notionToken = env.NOTION_API_KEY;

  const properties = {};
  if (updates.title) properties.Title = { title: [{ text: { content: updates.title } }] };
  if (updates.content) properties.Content = { rich_text: [{ text: { content: updates.content } }] };
  if (updates.color) properties.Color = { select: { name: updates.color } };
  if (updates.tags) properties.Tags = { multi_select: updates.tags.map(t => ({ name: t })) };

  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2024-02-15',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
}

/**
 * Delete note in Notion
 */
async function deleteNoteInNotion(pageId, env) {
  const notionToken = env.NOTION_API_KEY;

  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${notionToken}`,
      'Notion-Version': '2024-02-15',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      archived: true,
    }),
  });
}

/**
 * Helper: Extract property value from Notion page
 */
function getPropertyValue(page, propertyName) {
  const prop = page.properties[propertyName];
  if (!prop) return null;

  switch (prop.type) {
    case 'title':
      return prop.title.map(t => t.plain_text).join('');
    case 'rich_text':
      return prop.rich_text.map(t => t.plain_text).join('');
    case 'select':
      return prop.select?.name || null;
    case 'multi_select':
      return prop.multi_select.map(s => s.name);
    default:
      return null;
  }
}