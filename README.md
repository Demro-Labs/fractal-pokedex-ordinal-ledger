# Fractal Pokédex Ordinal Ledger

A production-ready visual archive for the **Fractal Pokédex Ordinal Ledger**, a collection of 1,025 Pokédex Ordinals inscribed on Fractal Bitcoin. The site combines a local catalogue with live market information, inscription metadata, UniSat wallet operations, transfer tooling, inscription preparation, and UniScan links.

## Production site

- **Live application:** https://demro-labs.github.io/fractal-pokedex-ordinal-ledger/
- **Repository:** https://github.com/Demro-Labs/fractal-pokedex-ordinal-ledger
- **Shared live Worker:** https://fractal-ordinal-live.servostar23.workers.dev

## Product overview

The application uses two complementary data layers:

1. **Local catalogue layer** — Pokédex metadata, inscription identifiers, traits, image assets, and collection presentation are stored with the application and remain available without live API access.
2. **Live service layer** — market values, ownership details, wallet balances, UTXOs, inscription orders, and transaction information are requested from live services when the relevant feature is used.

This separation provides a reliable catalogue while making the changing, network-dependent parts of the product clearly visible as live data.

## Main features

### Pokédex catalogue

- Browse the complete 1,025-item Pokédex collection.
- View optimized local Pokédex images and metadata.
- Search and inspect inscription ID, number, name, description, file, token ID, and traits.
- Open an inscription detail view with live owner, creator, and listing information when available.
- Open collection and inscription pages on UniSat or UniScan.
- Continue browsing local metadata and images when live services are unavailable.

### Live market data

The market panel receives live Pokédex statistics through the shared Cloudflare Worker. Depending on provider availability, the interface can display floor price, volume, market capitalization, listings, and related marketplace information. Live values are external data and are kept separate from the local Pokédex metadata.

### UniSat wallet session

The wallet panel provides explicit session controls:

- **Connect UniSat** requests access to the selected UniSat account.
- **Disconnect UniSat** clears the active application session and attempts the provider disconnect method when supported by the installed UniSat version.
- **Clear session** stops an active inscription load, clears the address and network from the interface, resets live dashboard values, and removes loaded wallet inscriptions and transfer state.
- **Load my inscriptions** manually fetches the inscriptions owned by the connected wallet.
- **Stop loading** cancels the active loading run and prevents late provider responses from restoring stale results.
- Connecting does not silently load the wallet’s entire inscription set; loading is user-controlled.

While a supported session is active, the live wallet dashboard can show:

- active network;
- confirmed and unconfirmed balance;
- total and available balance;
- unavailable balance;
- public key when returned by UniSat;
- UTXO count and aggregate UTXO value;
- loaded inscription count and last refresh time;
- connected address and a direct UniScan address link.

The dashboard refreshes approximately every 15 seconds. A value can be shown as unavailable when the wallet is locked, the provider method is missing, or UniSat temporarily fails to respond.

### Inscription gallery, search, and display modes

The **My inscriptions** panel shows the inscriptions returned by UniSat, ten items per page.

Three display modes are available:

- **Mosaic** — large square previews designed for visual browsing.
- **Compact** — a denser multi-column layout for scanning many inscriptions.
- **List** — a one-column detailed layout with wide previews.

The gallery also supports:

- search by inscription ID, inscription number, or location;
- automatic reset to the first page when the search query changes;
- match count and total loaded count;
- **Open result in UniScan**, which opens the first match on the correct Bitcoin or Fractal UniScan inscription route;
- a live detail link on each card;
- a transfer action on each eligible card;
- three distinct gray tones for Previous, page/match status, and Next pagination controls.

### Inscription selection and transfer

The transfer workflow keeps signing and broadcasting under the user’s control:

1. Select a Pokédex inscription from the wallet gallery or detail view.
2. Enter and validate a recipient address.
3. Review the live pre-confirmation receipt.
4. Review the inscription, recipient, network, fee, and UTXO information.
5. Approve the transaction in UniSat.
6. Track the returned transaction through the relevant mempool endpoint.

The interface only offers recognized, transferable inscriptions. Inscription outputs and detected protocol assets are excluded from fee-UTXO selection to reduce the risk of spending an asset accidentally. The final UniSat review screen remains authoritative and must be checked before approval.

The secure fee-UTXO route is:

```text
GET https://fractal-ordinal-live.servostar23.workers.dev/api/spendable-utxos
```

The Worker validates the request, address, output script, amount, inscription status, protocol-asset status, and other safety conditions. It does not and cannot bypass Fractal Bitcoin dust policy.

### Upload and inscription preparation

The inscription panel supports:

- selecting or dropping a file;
- reviewing file name, MIME type, size, and content information;
- creating an inscription order through the Worker;
- displaying a live pre-confirmation receipt;
- opening the required approval flow in UniSat;
- tracking order and transaction status.

The site never signs or broadcasts an inscription payment on behalf of the user. Payment and final approval remain inside UniSat.

### Mobile ownership proof

On mobile UniSat, a fresh BIP-322 signature proves control of the selected address before an ordinal transfer, FB send, or file-inscription payment. For Inscribe, the order is **review receipt → confirm payment → sign the ownership proof → separately open UniSat transaction approval**. The ownership proof does not create a login session or authorize a payment. The existing desktop transaction flow is unchanged.

## Architecture

```text
Browser / React UI
        |
        | local Pokédex metadata and images
        v
client/public/assets/
        |
        | live requests
        v
Cloudflare Worker
https://fractal-ordinal-live.servostar23.workers.dev
        |
        +--> UniSat APIs
        +--> market data providers
        +--> mempool / transaction endpoints
```

### Frontend

- React 19 with TypeScript.
- Vite for development and production builds.
- Tailwind CSS 4 for responsive layout and visual styling.
- `lucide-react` for interface icons.
- UniSat provider integration in the wallet components.
- Local Pokédex manifests, metadata, and images under `client/public/assets/`.

### Backend and Worker integration

The application server is bundled from `server/index.ts`. Protected and live operations are routed through the Cloudflare Worker so provider secrets are not exposed in the browser.

Important Worker routes include:

- `/api/market` — live Pokédex market statistics;
- `/api/live-inscription` — live owner, creator, and listing information;
- `/api/spendable-utxos` — admissible fee UTXOs for transfers;
- `/api/inscribe/order` — inscription order creation and status;
- `/api/auth/ownership/challenge` and `/api/auth/ownership/verify` — short-lived mobile ownership proofs only, never transaction authorization;
- transaction and mempool-related routes used by receipts and confirmation tracking.

The Worker stores the UniSat API key in the server-side secret `UNISAT_API_KEY`. It must never be included in frontend source, static assets, or a public build artifact.

## Data and assets

Local collection content is stored under:

```text
client/public/assets/
```

The asset tree contains Pokédex manifests, metadata, optimized images, and brand assets. Local data is the fallback source for catalogue browsing; live endpoints are used for ownership, market, wallet, order, and transaction information that can change over time.

Live responses can be partial, delayed, rate-limited, or temporarily unavailable. The UI should preserve local Pokédex content and display an explicit unavailable state rather than treating missing live values as authoritative.

## Local development

Requirements:

- Node.js compatible with the repository toolchain;
- pnpm 11;
- a browser with the UniSat Wallet extension for wallet testing.

Install dependencies and start the Vite development server:

```bash
pnpm install
pnpm run dev
```

Run the TypeScript validation:

```bash
pnpm run check
```

Create the production frontend and server bundle:

```bash
pnpm run build
```

Run the compiled server:

```bash
pnpm run start
```

Useful additional command:

```bash
pnpm run preview
```

## Deployment

The site is deployed automatically to GitHub Pages from `main` by the workflow in `.github/workflows/`.

The footer's **Version GitHub déployée** links to the exact commit used for the Pages build and shows its commit date. The Pages workflow injects this metadata at build time.

The Cloudflare Worker is intentionally shared with Ordinal Punks. Its source of truth and deployment workflow live in `Demro-Labs/ordinal-punks-collection`; this repository must not add a second Worker with the same name or deploy an incomplete copy over the shared service. The Pokedex frontend already uses the shared Worker URL above, and the Worker allowlist includes the Pokedex collection and origin.

The latest Punks production updates are therefore already active for Pokedex through that shared service: Buffer initialization before BIP-322, a local `workerd` smoke test, Smart Placement, privacy-conscious sampled logs, and post-deployment checks for both collections and auth origins. The corrected Cloudflare Production run is [#38456102630](https://github.com/Demro-Labs/ordinal-punks-collection/actions/runs/38456102630). Operational recovery steps are in the [shared Worker Production runbook](https://github.com/Demro-Labs/ordinal-punks-collection/blob/main/workers/PRODUCTION-RUNBOOK.md).

Before releasing a Pokedex frontend change, the shared live contract can be checked without wallet credentials:

```bash
base=https://fractal-ordinal-live.servostar23.workers.dev
origin=https://demro-labs.github.io
curl -fsS "$base/api/market?collectionId=pokedex&start=0&limit=1" -H "Origin: $origin"
curl -i "$base/api/fractal/balance?address=invalid" -H "Origin: $origin"
# Safe Inscribe route probe: rejected before order creation; expected HTTP 415.
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$base/api/inscribe/order" \
  -H "Origin: $origin" -H 'Content-Type: text/plain' --data-binary 'pokedex-health-probe'
```

The first request must return Pokedex market JSON; the second must return HTTP `400` without exposing any server secret; the final probe must return `415` without creating an order. Worker changes are validated and deployed from the Punks repository before they are consumed here. The production workflow then verifies the `opunk` and `pokedex` market routes, anonymous auth sessions for both `site` values, the allowlisted CORS preflights, the `AUTH_STORAGE` Durable Object binding, and only the name/type of the `UNISAT_API_KEY` secret binding. It never reads or prints the secret value. A `403` from a browser-origin-protected route when the `Origin` header is omitted is expected; production probes should use the allowlisted origin as shown above.

The production base path is:

```text
/fractal-pokedex-ordinal-ledger/
```

Vite uses that base path so local images, manifests, and client-side links work correctly under the GitHub Pages subdirectory.

Recommended release validation:

```bash
pnpm run check
pnpm run build
git diff --check
```

Pull requests are expected to pass the repository security, dependency, and CodeQL checks before merge.

Dependabot version-update and security-update pull requests are disabled by repository policy. GitHub vulnerability alerts remain enabled; manually maintained security and build checks continue to run.

## Security and user-control principles

- Connecting or browsing local metadata does not require a wallet signature.
- Every transfer and inscription payment requires explicit user approval in UniSat.
- The Worker’s UniSat API secret is never sent to the frontend.
- Clear session removes wallet data from application state; it does not revoke permissions granted inside UniSat when the provider exposes no disconnect API.
- Transfer preparation excludes detected inscription and protocol-asset UTXOs from fee selection.
- The application does not circumvent dust rules, provider policies, network consensus, or UniSat approval screens.
- Always verify the recipient address, network, output, fee, and final UniSat review screen before approving a transaction.

## License

This repository is released under the MIT license specified in `package.json`.
