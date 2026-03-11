/**
 * Cloudflare Worker — API Rituels Moona
 *
 * GET /api/audio?t=TOKEN&c=matin|journee|soir
 *   → valide le token dans Shopify Metaobjects
 *   → retourne { url: "https://cdn.shopify.com/..." }
 *
 * Variables d'environnement à configurer dans Cloudflare :
 *   SHOPIFY_STORE_URL        ex: moona-9413.myshopify.com
 *   SHOPIFY_ADMIN_API_TOKEN  ex: shpss_...
 *   SHOPIFY_API_VERSION      ex: 2024-10
 *   ALLOWED_ORIGIN           ex: https://moona-9413.myshopify.com
 */

const VALID_CATEGORIES = ['matin', 'journee', 'soir'];

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

  // Fichier générique (mp3, wav, etc.)
  if (field.reference?.url) return field.reference.url;
  // Image (peu probable pour audio, mais au cas où)
  if (field.reference?.image?.url) return field.reference.image.url;
  // Vidéo/audio Shopify
  if (field.reference?.sources?.length) {
    const preferred = field.reference.sources.find(s =>
      s.mimeType?.startsWith('audio/')
    ) || field.reference.sources[0];
    return preferred?.url ?? null;
  }

  return null;
}

// ─── Fetch Shopify metaobject ─────────────────────────────────────────────────

async function fetchRituel(token, env) {
  const url = `https://${env.SHOPIFY_STORE_URL}/admin/api/${env.SHOPIFY_API_VERSION || '2024-10'}/graphql.json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_API_TOKEN,
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
    const origin = env.ALLOWED_ORIGIN || '*';
    const url = new URL(request.url);

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return corsPreflightResponse(origin);
    }

    // Route unique
    if (url.pathname !== '/api/audio') {
      return json({ error: 'Not found' }, 404, origin);
    }

    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405, origin);
    }

    const token    = url.searchParams.get('t')?.trim();
    const category = url.searchParams.get('c')?.trim().toLowerCase();

    // Validation des paramètres
    if (!token || !category) {
      return json({ error: 'Paramètres manquants (t, c)' }, 400, origin);
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return json({ error: 'Catégorie invalide' }, 400, origin);
    }

    // Sécurité : token ne doit pas contenir de caractères GraphQL dangereux
    if (!/^[a-zA-Z0-9_\-]{8,64}$/.test(token)) {
      return json({ error: 'Token invalide' }, 400, origin);
    }

    try {
      const metaobject = await fetchRituel(token, env);

      // Token introuvable
      if (!metaobject) {
        return json({ error: 'Token non reconnu' }, 401, origin);
      }

      const { fields } = metaobject;

      // Accès désactivé
      const actif = getFieldValue(fields, 'actif');
      if (actif === 'false') {
        return json({ error: 'Accès désactivé' }, 403, origin);
      }

      // Récupère l'URL audio pour la catégorie demandée
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
