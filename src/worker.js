/**
 * Voicenote Worker - Sync to Notion
 * Uses Cloudflare environment variables for API keys
 */

export default {
  async fetch(request, env) {
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
      // Notes management endpoints
      if (path === '/notes' && request.method === 'GET') {
        return await getNotes(env, corsHeaders);
      }
      if (path === '/notes' && request.method === 'POST') {
        return await createNote(request, env, corsHeaders);
      }
      if (path.match(/^\/notes\/[^/]+$/) && request.method === 'PUT') {
        const noteId = path.split('/')[2];
        return await updateNote(noteId, request, env, corsHeaders);
      }
      if (path.match(/^\/notes\/[^/]+$/) && request.method === 'DELETE') {
        const noteId = path.split('/')[2];
        return await deleteNote(noteId, env, corsHeaders);
      }

      // Sync to Notion endpoint
      if (path === '/sync' && request.method === 'POST') {
        return await syncToNotion(env, corsHeaders);
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), { 
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Get all notes from KV
async function getNotes(env, corsHeaders) {
  try {
    const keys = await env.NOTES_KV.list();
    const notes = [];

    for (const key of keys.keys) {
      const note = await env.NOTES_KV.get(key.name, 'json');
      if (note) {
        notes.push({ id: key.name, ...note });
      }
    }

    return new Response(JSON.stringify(notes), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Create a new note
async function createNote(request, env, corsHeaders) {
  try {
    const data = await request.json();
    const noteId = Date.now().toString();
    const note = {
      title: data.title || 'Untitled',
      content: data.content || '',
      color: data.color || '#FFE5B4',
      tags: data.tags || [],
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };

    await env.NOTES_KV.put(noteId, JSON.stringify(note));

    return new Response(JSON.stringify({ id: noteId, ...note }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Update a note
async function updateNote(noteId, request, env, corsHeaders) {
  try {
    const data = await request.json();
    const existing = await env.NOTES_KV.get(noteId, 'json');

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Note not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const updated = {
      ...existing,
      ...data,
      updated: new Date().toISOString()
    };

    await env.NOTES_KV.put(noteId, JSON.stringify(updated));

    return new Response(JSON.stringify({ id: noteId, ...updated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Delete a note
async function deleteNote(noteId, env, corsHeaders) {
  try {
    const existing = await env.NOTES_KV.get(noteId);

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Note not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    await env.NOTES_KV.delete(noteId);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Sync all notes to Notion
async function syncToNotion(env, corsHeaders) {
  try {
    // Check for required env variables
    if (!env.NOTION_API_KEY || !env.NOTION_DATABASE_ID) {
      return new Response(
        JSON.stringify({ error: 'Missing NOTION_API_KEY or NOTION_DATABASE_ID environment variables' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get all notes from KV
    const keys = await env.NOTES_KV.list();
    const syncResults = {
      synced: 0,
      failed: 0,
      errors: []
    };

    for (const key of keys.keys) {
      try {
        const note = await env.NOTES_KV.get(key.name, 'json');
        if (!note) continue;

        // Create/update page in Notion
        const notionResponse = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.NOTION_API_KEY}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            parent: { database_id: env.NOTION_DATABASE_ID },
            properties: {
              'Title': {
                title: [{ text: { content: note.title || 'Untitled' } }]
              },
              'Content': {
                rich_text: [{ text: { content: note.content || '' } }]
              },
              'Color': {
                rich_text: [{ text: { content: note.color || '#FFE5B4' } }]
              },
              'Tags': {
                multi_select: (note.tags || []).map(tag => ({ name: tag }))
              }
            }
          })
        });

        if (notionResponse.ok) {
          syncResults.synced++;
        } else {
          syncResults.failed++;
          const errorData = await notionResponse.text();
          syncResults.errors.push(`Note ${key.name}: ${errorData}`);
        }
      } catch (error) {
        syncResults.failed++;
        syncResults.errors.push(`Note ${key.name}: ${error.message}`);
      }
    }

    return new Response(JSON.stringify(syncResults), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
