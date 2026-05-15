/**
 * VoiceNotes Worker — Cloudflare Worker
 * Full two-way Notion sync + Galaxy Watch support
 *
 * Required Secrets (Cloudflare dashboard → Workers → Settings → Variables):
 *   NOTION_API_KEY        — Notion integration token (ntn_...)
 *   NOTION_DATABASE_ID    — Target Notion database ID
 *
 * Required KV binding (wrangler.toml):
 *   NOTES_KV
 *
 * Endpoints:
 *   GET    /notes          — List all notes (?slim=1 for watch)
 *   POST   /notes          — Create note
 *   GET    /notes/:id      — Get single note
 *   PUT    /notes/:id      — Update note
 *   DELETE /notes/:id      — Delete note
 *   POST   /sync/push      — Push KV notes → Notion
 *   POST   /sync/pull      — Pull Notion pages → KV (merge, newer wins)
 *   POST   /sync/auto      — Push then pull in one call
 *   GET    /watch/notes    — Slim note list for Galaxy Watch
 *   POST   /watch/quick    — Quick-add from Galaxy Watch
 *   GET    /health         — Status check
 */

const NOTION_VERSION = '2022-06-28';
const NOTION_API = 'https://api.notion.com/v1';

// ─── RESPONSE HELPERS ────────────────────────────────────────────────────────

function corsHeaders(request) {
  const origin = request?.headers?.get('Origin') || '';

  const allowed =
    !origin ||
    origin.endsWith('.pages.dev') ||
    origin.endsWith('.workers.dev') ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1') ||
    origin === 'https://voicenote-bgd.pages.dev';

  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : 'https://voicenote-bgd.pages.dev',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Watch-Client',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, req = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

function err(message, status = 400, req = null) {
  return json({ error: message }, status, req);
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method;

    try {
      if (path === '/health' && method === 'GET') {
        return json({
          ok: true,
          notion: !!(env.NOTION_API_KEY && env.NOTION_DATABASE_ID),
          kv: !!env.NOTES_KV,
          ts: new Date().toISOString(),
        }, 200, request);
      }

      // Notes CRUD
      if (path === '/notes' && method === 'GET')  return getNotes(env, url);
      if (path === '/notes' && method === 'POST') return createNote(request, env);

      const noteMatch = path.match(/^\/notes\/([^/]+)$/);
      if (noteMatch) {
        const id = noteMatch[1];
        if (method === 'GET')    return getNote(id, env);
        if (method === 'PUT')    return updateNote(id, request, env);
        if (method === 'DELETE') return deleteNote(id, env);
      }

      // Sync
      if (path === '/sync/push' && method === 'POST') return syncPush(env);
      if (path === '/sync/pull' && method === 'POST') return syncPull(env);
      if (path === '/sync/auto' && method === 'POST') return syncAuto(env);

      // Galaxy Watch
      if (path === '/watch/notes' && method === 'GET')  return watchNotes(env);
      if (path === '/watch/quick' && method === 'POST') return watchQuickAdd(request, env);

      return err('Not found', 404, request);
    } catch (e) {
      console.error(e);
      return err(e.message || 'Internal server error', 500, request);
    }
  },
};

// ─── NOTE HELPERS ─────────────────────────────────────────────────────────────

function makeNote(data, existingId = null) {
  const now = new Date().toISOString();
  return {
    id: existingId || Date.now().toString(),
    title: (data.title || 'Untitled').slice(0, 200),
    content: (data.content || '').slice(0, 10000),
    color: data.color || '#fff7ed',
    tags: Array.isArray(data.tags) ? data.tags.slice(0, 10) : [],
    created: data.created || now,
    updated: now,
    notionId: data.notionId || null,
  };
}

async function allNotes(env) {
  if (!env.NOTES_KV) throw new Error('Missing NOTES_KV binding.');

  const { keys } = await env.NOTES_KV.list();
  const notes = [];
  for (const k of keys) {
    try {
      const n = await env.NOTES_KV.get(k.name, 'json');
      if (n && typeof n === 'object') notes.push({ ...n, id: k.name });
    } catch (e) {
      console.error(`Skipping invalid note in KV key ${k.name}:`, e);
    }
  }
  return notes;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

async function getNotes(env, url) {
  const notes = await allNotes(env);
  if (url.searchParams.get('slim') === '1') {
    return json(notes.map(n => ({ id: n.id, title: n.title, updated: n.updated, tags: n.tags })));
  }
  return json(notes);
}

async function getNote(id, env) {
  const note = await env.NOTES_KV.get(id, 'json');
  if (!note) return err('Note not found', 404);
  return json({ ...note, id });
}

async function createNote(request, env) {
  const data = await request.json();
  const noteId = data.id ? String(data.id) : null;
  const existing = noteId ? await env.NOTES_KV.get(noteId, 'json') : null;
  const note = makeNote({ ...existing, ...data, notionId: data.notionId || existing?.notionId }, noteId);
  await env.NOTES_KV.put(note.id, JSON.stringify(note));
  return json(note, 201);
}

async function updateNote(id, request, env) {
  const existing = await env.NOTES_KV.get(id, 'json');
  if (!existing) return err('Note not found', 404);
  const data = await request.json();
  const updated = makeNote({ ...existing, ...data }, id);
  await env.NOTES_KV.put(id, JSON.stringify(updated));
  return json(updated);
}

async function deleteNote(id, env) {
  if (!(await env.NOTES_KV.get(id))) return err('Note not found', 404);
  await env.NOTES_KV.delete(id);
  return json({ ok: true });
}

// ─── NOTION HELPERS ───────────────────────────────────────────────────────────

function notionHeaders(env) {
  return {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function requireNotion(env) {
  if (!env.NOTION_API_KEY || !env.NOTION_DATABASE_ID) {
    throw new Error('Missing NOTION_API_KEY or NOTION_DATABASE_ID. Add them as Worker secrets in the Cloudflare dashboard.');
  }
}

function noteToNotionBody(note, databaseId) {
  return {
    parent: { database_id: databaseId },
    properties: {
      Name: { title: [{ text: { content: note.title || 'Untitled' } }] },
      Content: { rich_text: [{ text: { content: (note.content || '').slice(0, 2000) } }] },
      Color: { rich_text: [{ text: { content: note.color || '#fff7ed' } }] },
      Tags: { multi_select: (note.tags || []).map(t => ({ name: t })) },
    },
  };
}

function notionPageToNote(page) {
  const p = page.properties || {};
  const txt = (prop) => prop?.rich_text?.[0]?.plain_text || '';
  return {
    title: p.Name?.title?.[0]?.plain_text || 'Untitled',
    content: txt(p.Content),
    color: txt(p.Color) || '#fff7ed',
    tags: (p.Tags?.multi_select || []).map(t => t.name),
    created: p.Created?.date?.start || page.created_time,
    updated: page.last_edited_time,
    notionId: page.id,
    id: txt(p.NoteID) || null,
  };
}

// ─── SYNC PUSH: KV → Notion ───────────────────────────────────────────────────

async function syncPush(env) {
  requireNotion(env);

  const notes = await allNotes(env);
  const results = { pushed: 0, updated: 0, failed: 0, errors: [] };

  for (const note of notes) {
    try {
      if (note.notionId) {
        const res = await fetch(`${NOTION_API}/pages/${note.notionId}`, {
          method: 'PATCH',
          headers: notionHeaders(env),
          body: JSON.stringify({ properties: noteToNotionBody(note, env.NOTION_DATABASE_ID).properties }),
        });
        if (res.ok) {
          results.updated++;
          continue;
        }
        if (res.status !== 404) {
          const e = await res.text();
          results.failed++;
          results.errors.push(`${note.id}: ${e.slice(0, 200)}`);
          continue;
        }
        // If 404/archived, fall through to create.
      }

      const res = await fetch(`${NOTION_API}/pages`, {
        method: 'POST',
        headers: notionHeaders(env),
        body: JSON.stringify(noteToNotionBody(note, env.NOTION_DATABASE_ID)),
      });

      if (res.ok) {
        const page = await res.json();
        const saved = { ...note, notionId: page.id };
        await env.NOTES_KV.put(note.id, JSON.stringify(saved));
        results.pushed++;
      } else {
        const e = await res.text();
        results.failed++;
        results.errors.push(`${note.id}: ${e.slice(0, 200)}`);
      }
    } catch (e) {
      results.failed++;
      results.errors.push(`${note.id}: ${e.message}`);
    }
  }

  return json({ ...results, ts: new Date().toISOString() });
}

// ─── SYNC PULL: Notion → KV ───────────────────────────────────────────────────

async function syncPull(env) {
  requireNotion(env);
  const results = { pulled: 0, skipped: 0, failed: 0, errors: [] };

  let cursor;
  const pages = [];

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API}/databases/${env.NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      headers: notionHeaders(env),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const e = await res.text();
      return err(`Notion query failed: ${e.slice(0, 200)}`, 502);
    }

    const data = await res.json();
    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  for (const page of pages) {
    try {
      const note = notionPageToNote(page);
      const kvKey = note.id || `notion_${page.id}`;

      const existing = await env.NOTES_KV.get(kvKey, 'json');
      if (existing) {
        const notionTs = new Date(note.updated).getTime();
        const kvTs = new Date(existing.updated).getTime();
        if (notionTs <= kvTs) {
          results.skipped++;
          continue;
        }
      }

      await env.NOTES_KV.put(kvKey, JSON.stringify({ ...note, id: kvKey }));
      results.pulled++;
    } catch (e) {
      results.failed++;
      results.errors.push(`${page.id}: ${e.message}`);
    }
  }

  return json({ ...results, ts: new Date().toISOString() });
}

// ─── SYNC AUTO ────────────────────────────────────────────────────────────────

async function syncAuto(env) {
  requireNotion(env);
  const pushData = await (await syncPush(env)).json();
  const pullData = await (await syncPull(env)).json();
  return json({ push: pushData, pull: pullData, ts: new Date().toISOString() });
}

// ─── GALAXY WATCH ────────────────────────────────────────────────────────────

async function watchNotes(env) {
  const notes = await allNotes(env);
  const slim = notes
    .sort((a, b) => new Date(b.updated) - new Date(a.updated))
    .slice(0, 50)
    .map(n => ({
      id: n.id,
      title: n.title.slice(0, 60),
      preview: (n.content || '').slice(0, 80),
      tags: (n.tags || []).slice(0, 3),
      updated: n.updated,
    }));
  return json({ notes: slim, count: slim.length, ts: new Date().toISOString() });
}

async function watchQuickAdd(request, env) {
  const data = await request.json();
  if (!data.content && !data.title) return err('content or title required');

  const note = makeNote({
    title: data.title || (data.content || '').slice(0, 60),
    content: data.content || '',
    tags: data.tags || ['watch'],
    color: '#eff6ff',
  });

  await env.NOTES_KV.put(note.id, JSON.stringify(note));

  // Auto-push to Notion if configured
  let notionResult = null;
  if (env.NOTION_API_KEY && env.NOTION_DATABASE_ID) {
    try {
      const res = await fetch(`${NOTION_API}/pages`, {
        method: 'POST',
        headers: notionHeaders(env),
        body: JSON.stringify(noteToNotionBody(note, env.NOTION_DATABASE_ID)),
      });
      if (res.ok) {
        const page = await res.json();
        note.notionId = page.id;
        await env.NOTES_KV.put(note.id, JSON.stringify(note));
        notionResult = { synced: true, notionId: page.id };
      } else {
        notionResult = { synced: false };
      }
    } catch (_) {
      notionResult = { synced: false };
    }
  }

  return json({ note, notion: notionResult }, 201);
}
