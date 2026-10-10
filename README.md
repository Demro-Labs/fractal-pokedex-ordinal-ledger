# Fractal Pokédex Ordinal Ledger

Catalogue visuel du **Fractal Pokédex Ordinal Ledger**, avec consultation des inscriptions, métadonnées, galerie, données live UniSat et outils wallet.

## Fonctionnalités

- Galerie paginée des inscriptions du Pokédex avec images et métadonnées locales.
- Recherche et consultation des informations d’une inscription : inscription ID, nom, description, token ID, fichier et traits.
- Panneau de détail avec propriétaire, créateur et état de listing UniSat lorsque les données live sont disponibles.
- Chargement automatique des inscriptions détenues après connexion du wallet UniSat.
- Sélection des inscriptions éligibles au transfert sans exposer les inscriptions ou actifs protocolaires verrouillés.
- Transfert sécurisé par PSBT avec contrôle de la sortie d’inscription et prévention des sorties dust.
- Chaque transfert doit être approuvé explicitement dans UniSat ; le site ne signe ni ne diffuse automatiquement de transaction.
- Upload et inscription UniSat avec création d’ordre, paiement et approbation dans le wallet.
- Marché live du Pokédex alimenté par le Worker Cloudflare et l’API UniSat.
- Liens directs vers la collection et les inscriptions sur UniSat.

## Wallet et transfert

La connexion se fait via l’extension UniSat. Une fois le wallet connecté, les inscriptions détenues sont chargées automatiquement.

Le flux de transfert PSBT utilise l’adresse destinataire fournie par l’utilisateur et ne sélectionne que des inscriptions compatibles. Les UTXO de frais sont récupérés via :

```text
GET https://fractal-ordinal-live.servostar23.workers.dev/api/spendable-utxos
```

Le Worker vérifie l’adresse, le montant, le script, l’absence d’inscription et l’absence d’actifs protocolaires signalés avant de retourner un UTXO utilisable. Il ne peut pas contourner la politique dust du réseau.

> Vérifier soigneusement l’adresse destinataire et le récapitulatif dans UniSat avant toute signature.

## Upload et inscription

Le panneau d’inscription permet de préparer un fichier, créer un ordre UniSat et suivre son statut. La clé API UniSat est conservée côté Worker Cloudflare dans le secret `UNISAT_API_KEY` et n’est jamais exposée au navigateur.

Le paiement, la signature et l’approbation finale sont toujours réalisés par l’utilisateur dans UniSat.

## Architecture live

Les fonctions live utilisent le Worker Cloudflare partagé :

```text
https://fractal-ordinal-live.servostar23.workers.dev
```

Routes principales :

- `/api/market` — données du marché live du Pokédex ;
- `/api/live-inscription` — propriétaire, créateur et listing d’une inscription ;
- `/api/spendable-utxos` — UTXO de frais admissibles au transfert PSBT ;
- `/api/inscribe/order` — création et suivi des ordres d’inscription.

Les réponses live peuvent être incomplètes ou temporairement indisponibles. Le frontend utilise des valeurs par défaut sûres afin que les détails locaux de l’inscription restent consultables.

## Développement local

```bash
pnpm install
pnpm run dev
```

Validation TypeScript et build de production :

```bash
pnpm run check
pnpm run build
```

Le projet utilise React 19, Vite, Tailwind CSS 4 et TypeScript. Pour lancer le serveur produit après compilation :

```bash
pnpm run start
```

## Déploiement

Le site est publié automatiquement sur GitHub Pages depuis `main` par le workflow du dépôt.

URL de production :

```text
https://demro-labs.github.io/fractal-pokedex-ordinal-ledger/
```

Vite utilise automatiquement la base `/fractal-pokedex-ordinal-ledger/` lors du build GitHub Pages.

## Données et assets

Les métadonnées, le manifeste de collection, les images optimisées et les assets de marque sont stockés dans `client/public/assets/`. La consultation locale ne dépend pas du marché live.

## Sécurité et limites

- La clé UniSat reste côté Worker et n’est jamais incluse dans le bundle frontend.
- UniSat demande l’approbation de l’utilisateur pour les signatures, paiements et inscriptions.
- Le flux PSBT ne contourne pas la politique dust de Fractal Bitcoin.
- Les informations de marché, de propriétaire et d’inscription dépendent de l’API UniSat.
