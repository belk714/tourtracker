// Cloudflare Worker — Tour Tracker GitHub Proxy
// Handles add/remove artist requests and updates artists.json in the repo

const REPO = 'belk714/tourtracker';
const FILE_PATH = 'artists.json';
const BRANCH = 'main';

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const GITHUB_TOKEN = env.GITHUB_TOKEN;
    if (!GITHUB_TOKEN) {
      return new Response(JSON.stringify({ error: 'Missing GITHUB_TOKEN' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // GET /artists — return current list
      if (request.method === 'GET' && path === '/artists') {
        const { artists } = await getArtists(GITHUB_TOKEN);
        return new Response(JSON.stringify(artists), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // POST /artists — add an artist { "name": "Artist Name" }
      if (request.method === 'POST' && path === '/artists') {
        const body = await request.json();
        const name = (body.name || '').trim();
        if (!name) {
          return new Response(JSON.stringify({ error: 'Missing name' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const { artists, sha } = await getArtists(GITHUB_TOKEN);
        if (artists.some(a => a.toLowerCase() === name.toLowerCase())) {
          return new Response(JSON.stringify({ artists, message: 'Already exists' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        artists.push(name);
        artists.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        await saveArtists(GITHUB_TOKEN, artists, sha, `Add ${name}`);
        return new Response(JSON.stringify({ artists, message: `Added ${name}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // DELETE /artists — remove an artist { "name": "Artist Name" }
      if (request.method === 'DELETE' && path === '/artists') {
        const body = await request.json();
        const name = (body.name || '').trim();
        if (!name) {
          return new Response(JSON.stringify({ error: 'Missing name' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const { artists, sha } = await getArtists(GITHUB_TOKEN);
        const filtered = artists.filter(a => a !== name);
        if (filtered.length === artists.length) {
          return new Response(JSON.stringify({ artists, message: 'Not found' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        await saveArtists(GITHUB_TOKEN, filtered, sha, `Remove ${name}`);
        return new Response(JSON.stringify({ artists: filtered, message: `Removed ${name}` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// UTF-8 safe base64 decode
function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

// UTF-8 safe base64 encode
function utf8ToBase64(str) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function getArtists(token) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'TourTracker-Worker', 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!r.ok) throw new Error(`GitHub GET failed: ${r.status}`);
  const data = await r.json();
  const content = base64ToUtf8(data.content);
  return { artists: JSON.parse(content), sha: data.sha };
}

async function saveArtists(token, artists, sha, message) {
  const content = utf8ToBase64(JSON.stringify(artists, null, 2));
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'TourTracker-Worker', 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content, sha, branch: BRANCH })
  });
  if (!r.ok) throw new Error(`GitHub PUT failed: ${r.status}`);
}
