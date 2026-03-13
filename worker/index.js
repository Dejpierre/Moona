/**
 * Cloudflare Worker — API Rituels (multi-store)
 *
 * GET /api/audio?t=TOKEN&c=matin|journee|soir
 *   → identifie le store via l'Origin de la requête
 *   → valide le token dans Shopify Metaobjects
 *   → retourne { url: "https://cdn.shopify.com/..." }
 *
 * Secrets à configurer dans Cloudflare (wrangler secret put) :
 *   MOONA_ADMIN_API_TOKEN      token admin pour moona-9413.myshopify.com
 *   ANDROMEDA_ADMIN_API_TOKEN  token admin pour andromeda-paris.myshopify.com
 */

const API_VERSION = '2024-10';

const VALID_CATEGORIES = ['matin', 'journee', 'soir'];

// ─── Config multi-store ────────────────────────────────────────────────────────
// Clé = Origin exact de la requête, valeur = { storeUrl, tokenEnvKey }

const STORE_CONFIG = {
  'https://moona-9413.myshopify.com': {
    storeUrl: 'moona-9413.myshopify.com',
    tokenEnvKey: 'MOONA_ADMIN_API_TOKEN',
  },
  'https://andromeda-paris.myshopify.com': {
    storeUrl: 'andromeda-paris.myshopify.com',
    tokenEnvKey: 'ANDROMEDA_ADMIN_API_TOKEN',
  },
};

// ─── GraphQL query ─────────────────────────────────────────────────────────────

const QUERY = `
  query GetRituelByToken($query: String!) {
    metaobjects(type: "acces_rituel", first: 1, query: $query) {
      nodes {
        fields {
          key
          value
          reference {
            ... on GenericFile {
              url
            }
            ... on MediaImage {
              image { url }
            }
            ... on Video {
              sources { url mimeType }
            }
          }
        }
      }
    }
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  });
}

function corsPreflightResponse(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function getFieldValue(fields, key) {
  return fields.find(f => f.key === key)?.value ?? null;
}

function getAudioUrl(fields, category) {
  const fieldKey = `audio_${category}`;
  const field = fields.find(f => f.key === fieldKey);
  if (!field) return null;

  if (field.reference?.url) return field.reference.url;
  if (field.reference?.image?.url) return field.reference.image.url;
  if (field.reference?.sources?.length) {
    const preferred = field.reference.sources.find(s =>
      s.mimeType?.startsWith('audio/')
    ) || field.reference.sources[0];
    return preferred?.url ?? null;
  }

  return null;
}

// ─── Fetch Shopify metaobject ─────────────────────────────────────────────────

async function fetchRituel(token, storeUrl, adminToken) {
  const url = `https://${storeUrl}/admin/api/${API_VERSION}/graphql.json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': adminToken,
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { query: `token:${token}` },
    }),
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status}`);
  }

  const data = await res.json();

  if (data.errors?.length) {
    throw new Error(`GraphQL: ${JSON.stringify(data.errors)}`);
  }

  return data.data?.metaobjects?.nodes?.[0] ?? null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const storeConfig = STORE_CONFIG[origin];

    // Preflight CORS — répondre pour tous les origins connus
    if (request.method === 'OPTIONS') {
      if (!storeConfig) return new Response(null, { status: 403 });
      return corsPreflightResponse(origin);
    }

    // Origin non autorisé
    if (!storeConfig) {
      return json({ error: 'Origin non autorisé' }, 403, origin);
    }

    const url = new URL(request.url);

    if (url.pathname !== '/api/audio') {
      return json({ error: 'Not found' }, 404, origin);
    }

    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }

    const token    = url.searchParams.get('t')?.trim();
    const category = url.searchParams.get('c')?.trim().toLowerCase();

    if (!token || !category) {
      return json({ error: 'Paramètres manquants (t, c)' }, 400, origin);
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return json({ error: 'Catégorie invalide' }, 400, origin);
    }

    if (!/^[a-zA-Z0-9_\-]{8,64}$/.test(token)) {
      return json({ error: 'Token invalide' }, 400, origin);
    }

    const adminToken = env[storeConfig.tokenEnvKey];
    if (!adminToken) {
      console.error(`[Worker] Secret manquant : ${storeConfig.tokenEnvKey}`);
      return json({ error: 'Erreur de configuration serveur' }, 500, origin);
    }

    try {
      const metaobject = await fetchRituel(token, storeConfig.storeUrl, adminToken);

      if (!metaobject) {
        return json({ error: 'Token non reconnu' }, 401, origin);
      }

      const { fields } = metaobject;

      const actif = getFieldValue(fields, 'actif');
      if (actif === 'false') {
        return json({ error: 'Accès désactivé' }, 403, origin);
      }

      const audioUrl = getAudioUrl(fields, category);

      if (!audioUrl) {
        return json({ error: `Aucun audio disponible pour "${category}"` }, 404, origin);
      }

      return json({ url: audioUrl }, 200, origin);

    } catch (err) {
      console.error('[Worker]', err.message);
      return json({ error: 'Erreur serveur' }, 500, origin);
    }
  },
};
