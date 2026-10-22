# UniSat et Cloudflare — configuration des réseaux

## Worker partagé

Fractal Pokédex et Ordinal Punks utilisent le même Worker Cloudflare : `https://fractal-ordinal-live.servostar23.workers.dev`. Le Worker et son fichier `wrangler.jsonc` sont maintenus dans le dépôt `Demro-Labs/ordinal-punks-collection`. **Ne pas créer un second Worker Cloudflare pour le Pokédex** : cela pourrait dupliquer les règles réseau, les sessions et les protections API.

La configuration frontend peut être remplacée au build avec `VITE_LIVE_DATA_URL`; sa valeur par défaut est le point d’entrée `/api/live-inscription` du Worker partagé. Ne pas ajouter de clés UniSat ou de tokens Cloudflare aux variables `VITE_*`, car celles-ci sont exposées au navigateur.

## Routage UniSat

| Réseau UniSat | Valeur réseau | API amont | Binding Cloudflare géré dans le dépôt Worker |
| --- | --- | --- | --- |
| Fractal Bitcoin mainnet | `FRACTAL_BITCOIN_MAINNET` | `https://open-api-fractal.unisat.io` | `UNISAT_API_KEY` |
| Bitcoin mainnet | `BITCOIN_MAINNET` | `https://open-api.unisat.io` | `UNISAT_BITCOIN_API` |

Les clés doivent rester séparées par réseau. Des clés de secours facultatives peuvent être configurées côté Worker sous `UNISAT_API_KEY_FALLBACK` et `UNISAT_BITCOIN_API_FALLBACK`; elles ne sont pas des valeurs frontend. Les endpoints BTC/Fractal et leurs clés sont choisis côté Worker selon le réseau demandé.

## Déploiement et secrets

Le dépôt Pokédex déploie son frontend via son propre workflow de site; il ne déploie pas le Worker partagé. Les changements de `workers/**`, `wrangler.jsonc` et du workflow Cloudflare doivent être faits dans le dépôt Ordinal Punks, où le workflow `.github/workflows/deploy-cloudflare-worker.yml` contrôle la publication du Worker.

Les secrets de publication `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID` sont utilisés par le workflow du dépôt Worker. Les secrets UniSat (`UNISAT_API_KEY`, `UNISAT_BITCOIN_API` et les éventuels fallbacks) se configurent dans Cloudflare Worker. Ne jamais mettre ces valeurs dans le dépôt, dans `VITE_*`, ou dans le JavaScript livré au navigateur.

## Sécurité UTXO

Cette documentation ne change pas les règles de Local Vault. Les UTXO contenant ou pouvant contenir une inscription, un Rune ou un Alkane ne doivent jamais être sélectionnés pour payer des frais. Si le scan est incomplet, incohérent ou limité par l’API, l’action doit échouer de manière fermée plutôt que de supposer que les sorties sont sûres.
