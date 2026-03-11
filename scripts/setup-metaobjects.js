/**
 * Crée la définition Metaobject "acces_rituel" dans Shopify.
 * À exécuter une seule fois : node scripts/setup-metaobjects.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const STORE_URL   = process.env.SHOPIFY_STORE_URL;
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

const GRAPHQL_URL = `https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`;

async function graphql(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ADMIN_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

// ─── Définition du Metaobject ─────────────────────────────────────────────────

const CREATE_DEFINITION = `
  mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
    metaobjectDefinitionCreate(definition: $definition) {
      metaobjectDefinition {
        id
        type
        name
        fieldDefinitions { key name type { name } }
      }
      userErrors { field message }
    }
  }
`;

const definition = {
  type: 'acces_rituel',
  name: 'Accès Rituel',
  displayNameKey: 'nom_client',
  fieldDefinitions: [
    {
      key: 'token',
      name: 'Token (unique par client)',
      type: 'single_line_text_field',
      required: true,
      validations: [{ name: 'min_length', value: '8' }],
    },
    {
      key: 'nom_client',
      name: 'Nom du client',
      type: 'single_line_text_field',
    },
    {
      key: 'audio_matin',
      name: 'Audio — Matin',
      type: 'file_reference',
    },
    {
      key: 'audio_journee',
      name: 'Audio — Journée',
      type: 'file_reference',
    },
    {
      key: 'audio_soir',
      name: 'Audio — Soir',
      type: 'file_reference',
    },
    {
      key: 'actif',
      name: 'Accès actif',
      type: 'boolean',
    },
  ],
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔧 Création du Metaobject "acces_rituel" dans Shopify...\n');

  const data = await graphql(CREATE_DEFINITION, { definition });
  const { metaobjectDefinition, userErrors } = data.metaobjectDefinitionCreate;

  if (userErrors?.length) {
    // Si la définition existe déjà, c'est OK
    const alreadyExists = userErrors.some(e => e.message.includes('already exists') || e.message.includes('taken'));
    if (alreadyExists) {
      console.log('ℹ️  La définition "acces_rituel" existe déjà — rien à faire.');
      return;
    }
    console.error('❌ Erreurs :', JSON.stringify(userErrors, null, 2));
    process.exit(1);
  }

  console.log('✅ Metaobject créé avec succès !');
  console.log(`   ID   : ${metaobjectDefinition.id}`);
  console.log(`   Type : ${metaobjectDefinition.type}`);
  console.log('\n📋 Champs créés :');
  metaobjectDefinition.fieldDefinitions.forEach(f =>
    console.log(`   - ${f.key} (${f.type.name})`)
  );

  console.log('\n👉 Prochaine étape :');
  console.log('   Shopify Admin > Contenu > Metaobjects > Accès Rituel > + Ajouter une entrée');
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
