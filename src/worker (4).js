// ── CORS headers added to every response ──────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // POST /sync → push notes to Notion
    if (url.pathname === '/sync' && request.method === 'POST') {
      return await syncNotesToNotion(request, env);
    }

    // GET /import → pull notes from Notion
    if (url.pathname === '/import' && request.method === 'GET') {
      return await getNotesFromNotion(env);
    }

    // Health check
    return new Response(
      JSON.stringify({ status: 'ok', message: 'VoiceNotes Worker ready' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  },
};

// ── Format a raw 32-char database ID to dashed UUID form ──────────────────
function formatDatabaseId(id) {
  if (!id) return id;
  const clean = id.replace(/-/g, '');
  if (clean.length !== 32) return id;
  return `${clean.slice(0,8)}-${clean.slice(8,12)}-${clean.slice(12,16)}-${clean.slice(16,20)}-${clean.slice(20)}`;
}

// ── POST /sync ─────────────────────────────────────────────────────────────
async function syncNotesToNotion(request, env) {
  const notionToken  = env.NOTION_API_KEY;
  const databaseId   = formatDatabaseId(env.NOTION_DATABASE_ID);

  if (!notionToken)  return jsonResponse({ error: 'NOTION_API_KEY not configured' }, 500);
  if (!databaseId)   return jsonResponse({ error: 'NOTION_DATABASE_ID not configured' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // App sends { notes: [...] }
  const notes = Array.isArray(body) ? body : (body.notes ?? []);

  if (notes.length === 0) {
    return jsonResponse({ message: 'No notes to sync', synced: 0, failed: 0 });
  }

  // First, fetch existing Notion pages so we can update rather than duplicate
  let existingPages = [];
  try {
    const listRes = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100 }),
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      existingPages = listData.results || [];
    }
  } catch { /* proceed without dedup */ }

  // Build a map of NoteID → Notion page ID for upsert logic
  const existingMap = {};
  for (const page of existingPages) {
    const noteId = page.properties['NoteID']?.rich_text?.[0]?.text?.content;
    if (noteId) existingMap[noteId] = page.id;
  }

  let synced = 0;
  let failed = 0;
  const errors = [];

  for (const note of notes) {
    try {
      const tagsArray = Array.isArray(note.tags) ? note.tags : [];
      const noteIdStr = String(note.id);

      const properties = {
        'Name':    { title:     [{ text: { content: (note.title   || 'Untitled').slice(0, 2000) } }] },
        'Content': { rich_text: [{ text: { content: (note.content || '').slice(0, 2000) } }] },
        'Color':   { rich_text: [{ text: { content: String(note.colorIdx ?? 2) } }] },
        'Tags':    { multi_select: tagsArray.map(t => ({ name: String(t).slice(0, 100) })) },
        'NoteID':  { rich_text: [{ text: { content: noteIdStr } }] },
      };

      // Add Created date if present
      if (note.date) {
        try {
          properties['Created'] = { date: { start: new Date(note.date).toISOString() } };
        } catch { /* skip bad date */ }
      }

      const existingPageId = existingMap[noteIdStr];

      let res;
      if (existingPageId) {
        // Update existing page
        res = await fetch(`https://api.notion.com/v1/pages/${existingPageId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties }),
        });
      } else {
        // Create new page
        res = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${notionToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
        });
      }

      if (res.ok) {
        synced++;
      } else {
        const err = await res.json();
        failed++;
        errors.push(`"${note.title}": ${err.message || err.code || res.status}`);
      }
    } catch (err) {
      failed++;
      errors.push(`"${note.title}": ${err.message}`);
    }
  }

  const message = failed === 0
    ? `Synced ${synced} note${synced !== 1 ? 's' : ''} to Notion!`
    : `Synced ${synced}, failed ${failed}`;

  return jsonResponse({ message, synced, failed, errors });
}

// ── GET /import ────────────────────────────────────────────────────────────
async function getNotesFromNotion(env) {
  const notionToken = env.NOTION_API_KEY;
  const databaseId  = formatDatabaseId(env.NOTION_DATABASE_ID);

  if (!notionToken) return jsonResponse({ error: 'NOTION_API_KEY not configured' }, 500);
  if (!databaseId)  return jsonResponse({ error: 'NOTION_DATABASE_ID not configured' }, 500);

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100 }),
    });

    if (!res.ok) {
      const err = await res.json();
      return jsonResponse({ error: err.message || `Notion API error ${res.status}` }, res.status);
    }

    const data = await res.json();

    // Map Notion pages back to VoiceNotes note shape
    const notes = data.results.map(page => {
      const colorIdxRaw = page.properties['Color']?.rich_text?.[0]?.text?.content;
      return {
        notionPageId: page.id,
        title:        page.properties['Name']?.title?.[0]?.text?.content    || 'Untitled',
        content:      page.properties['Content']?.rich_text?.[0]?.text?.content || '',
        colorIdx:     colorIdxRaw !== undefined ? Number(colorIdxRaw) : 2,
        tags:         page.properties['Tags']?.multi_select?.map(t => t.name) || [],
        date:         page.properties['Created']?.date?.start || page.created_time || new Date().toISOString(),
      };
    });

    // App expects { notes: [...] }
    return jsonResponse({ notes });
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}
