// ── CORS headers added to every response so the browser doesn't block it ──
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // Handle preflight requests (browser sends these before POST)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/sync') {
      if (request.method === 'POST') {
        return await syncNotesToNotion(request, env);
      }
      if (request.method === 'GET') {
        return await getNotesFromNotion(env);
      }
    }

    return new Response('Sync endpoint ready', {
      status: 200,
      headers: CORS_HEADERS,
    });
  },
};

async function syncNotesToNotion(request, env) {
  const notionToken = env.NOTION_API_KEY;
  const databaseId = env.NOTION_DATABASE_ID;

  // ── FIX: tags are now an array from the app, map them correctly ──────────
  const notes = await request.json();
  const results = [];

  for (const note of notes) {
    try {
      const tagsArray = Array.isArray(note.tags) ? note.tags : [];

      const response = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${notionToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: databaseId },
          properties: {
            'Title':   { title:      [{ text: { content: note.title   || 'Untitled' } }] },
            'Content': { rich_text:  [{ text: { content: note.content || '' } }] },
            'Color':   { select:     { name: note.color || 'Blue' } },
            'Tags':    { multi_select: tagsArray.map(t => ({ name: t })) },
          },
        }),
      });

      if (response.ok) {
        results.push({ success: true, noteTitle: note.title });
      } else {
        const error = await response.json();
        results.push({ success: false, noteTitle: note.title, error: error.message });
      }
    } catch (error) {
      results.push({ success: false, noteTitle: note.title, error: error.message });
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function getNotesFromNotion(env) {
  const notionToken = env.NOTION_API_KEY;
  const databaseId = env.NOTION_DATABASE_ID;

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status}`);
    }

    const data = await response.json();

    // ── tags returned as an array so the app can consume them directly ────
    const notes = data.results.map(page => ({
      id:      page.id,
      title:   page.properties['Title']?.title?.[0]?.text?.content   || '',
      content: page.properties['Content']?.rich_text?.[0]?.text?.content || '',
      color:   page.properties['Color']?.select?.name                || 'Blue',
      tags:    page.properties['Tags']?.multi_select?.map(t => t.name) || [],
    }));

    return new Response(JSON.stringify(notes), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}
