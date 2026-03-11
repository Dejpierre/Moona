/**
 * Client Shopify Admin API & Storefront API
 * Usage: node scripts/shopify-client.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

const ADMIN_API_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;
const GRAPHQL_URL = `${ADMIN_API_URL}/graphql.json`;

// ─── Admin API REST ───────────────────────────────────────────────────────────

async function adminFetch(endpoint, options = {}) {
  const url = `${ADMIN_API_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_TOKEN,
      ...options.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

// ─── Admin API GraphQL ────────────────────────────────────────────────────────

async function graphqlFetch(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const shopify = {
  // Infos du store
  getShop: () => adminFetch('/shop.json'),

  // Produits
  getProducts: (params = '') => adminFetch(`/products.json${params}`),
  getProduct: (id) => adminFetch(`/products/${id}.json`),

  // Commandes
  getOrders: (params = '') => adminFetch(`/orders.json${params}`),
  getOrder: (id) => adminFetch(`/orders/${id}.json`),

  // Clients
  getCustomers: (params = '') => adminFetch(`/customers.json${params}`),
  getCustomer: (id) => adminFetch(`/customers/${id}.json`),

  // Thèmes
  getThemes: () => adminFetch('/themes.json'),

  // GraphQL
  graphql: graphqlFetch,
};

// ─── Test de connexion ────────────────────────────────────────────────────────

async function testConnection() {
  console.log('🔌 Test de connexion Shopify...');
  console.log(`   Store: ${STORE_URL}`);
  console.log(`   API version: ${API_VERSION}`);
  console.log('');

  try {
    const { shop } = await shopify.getShop();
    console.log('✅ Connexion réussie !');
    console.log(`   Nom: ${shop.name}`);
    console.log(`   Email: ${shop.email}`);
    console.log(`   Plan: ${shop.plan_name}`);
    console.log(`   Domaine: ${shop.domain}`);
    console.log(`   Devise: ${shop.currency}`);
    console.log('');

    const { products } = await shopify.getProducts('?limit=3');
    console.log(`📦 ${products.length} produits récupérés (sur les 3 premiers)`);
    products.forEach(p => console.log(`   - ${p.title} (${p.status})`));

    const { themes } = await shopify.getThemes();
    const activeTheme = themes.find(t => t.role === 'main');
    console.log(`\n🎨 Thème actif: ${activeTheme?.name || 'inconnu'}`);
  } catch (err) {
    console.error('❌ Erreur de connexion:', err.message);
    process.exit(1);
  }
}

module.exports = shopify;

// Run test si exécuté directement
if (require.main === module) {
  testConnection();
}
