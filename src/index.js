/**
 * Notion Sync Backend for VoiceNote App
 * Runs on Cloudflare Workers
 */

export default {
  async fetch(request, env, ctx) {
    // Enable CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // GET /api/notes - Fetch all notes from Notion
      if (request.method === 'GET' && path === '/api/notes') {
        return await fetchNotesFromNotion(env, corsHeaders);
      }

      // POST /api/notes - Create new note in Notion
      if (request.method === 'POST' && path === '/api/notes') {
        const body = await request.json();
        return await createNoteInNotion(body, env, corsHeaders);
      }

      // PUT /api/notes/:id - Update note in Notion
      if (request.method === 'PUT' && path.startsWith('/api/notes/')) {
        const noteId = path.split('/').pop();
        const body = await request.json();
        return await updateNoteInNotion(noteId, body, env, corsHeaders);
      }

      // DELETE /api/notes/:id - Delete note from Notion
      if (request.method === 'DELETE' && path.startsWith('/api/notes/')) {
        const noteId = path.split('/').pop();
        return await deleteNoteFromNotion(noteId, env, corsHeaders);
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

async function fetchNotesFromNotion(env, corsHeaders) {
  const response = await fetch(
    `https://api.notion.com/v1/databases/${env.NOTION_DATABASE_ID}/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sorts: [{
          property: 'Upload Date',
          direction: 'descending',
        }],
      }),
    }
  );

  const data = await response.json();
  const notes = data.results.map((page) => ({
    id: page.id,
    title: page.properties['File Name']?.title?.[0]?.plain_text || 'Untitled',
    type: page.properties['File Type']?.select?.name || 'Document',
    uploadDate: page.properties['Upload Date']?.date?.start || new Date().toISOString(),
    status: page.properties['Status']?.select?.name || 'Active',
    fileSize: page.properties['File Size']?.number || 0,
  }));

  return new Response(JSON.stringify({ notes }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function createNoteInNotion(body, env, corsHeaders) {
  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: env.NOTION_DATABASE_ID },
      properties: {
        'File Name': {
          title: [{ text: { content: body.title || 'Untitled' } }],
        },
        'File Type': {
          select: { name: body.type || 'Document' },
        },
        'Upload Date': {
          date: { start: new Date().toISOString() },
        },
        'Status': {
          select: { name: body.status || 'Active' },
        },
        'File Size': {
          number: body.fileSize || 0,
        },
      },
    }),
  });

  const note = await response.json();
  return new Response(JSON.stringify(note), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function updateNoteInNotion(pageId, body, env, corsHeaders) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        'Status': {
          select: { name: body.status || 'Active' },
        },
      },
    }),
  });

  const note = await response.json();
  return new Response(JSON.stringify(note), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function deleteNoteFromNotion(pageId, env, corsHeaders) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${env.NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      archived: true,
    }),
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
