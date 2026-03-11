# Moona — Notes projet

## Shopify Theme Push

**Thème live :** Horizon `#195550216541`
**Store :** `moona-9413.myshopify.com`

### Pousser uniquement les fichiers Moona (section + template rituels)
```bash
shopify theme push --store moona-9413.myshopify.com --theme 195550216541 --nodelete --allow-live --only sections/section-rituels.liquid --only templates/page.rituels.json
```

### Restaurer le thème complet depuis le dépôt local
```bash
mkdir -p /tmp/horizon-push
cp -r assets blocks config layout locales sections snippets templates /tmp/horizon-push/
shopify theme push --path /tmp/horizon-push --store moona-9413.myshopify.com --theme 195550216541 --nodelete --allow-live
```

> ⚠️ Ne jamais faire `shopify theme push --live` sans `--only` — cela tente de supprimer tous les fichiers du thème qui ne sont pas en local.
