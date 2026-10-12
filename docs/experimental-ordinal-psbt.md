# Fractal Pokedex mobile Ordinal transfers

## Current behavior

Fractal Bitcoin transfers initiated from UniSat Mobile use the verified PSBT path in `client/src/components/UniSatWalletConnect.tsx`. The site does not call native `sendInscription` for this mobile Fractal path. Bitcoin transfers and desktop transfers continue to use UniSat's native inscription-transfer method.

The PSBT is constructed locally from the selected inscription output and separate fee UTXOs. Before UniSat is asked to sign, the page displays the network, recipient, inscription, recipient output, wallet change, exact fee, fee rate and estimated virtual size. The user can cancel at that review step without signing or broadcasting.

After explicit approval in UniSat, the client verifies signatures and the finalized transaction against the reviewed inputs, outputs, fee accounting and fee rate. It also rechecks the wallet account, public key and network before broadcasting the verified transaction through the Fractal Mempool API. A wallet signature is never requested automatically.

## Fees and RBF

The transaction signals opt-in Replace-by-Fee using sequence `0xfffffffd` on every input. This only signals that the transaction may be replaceable under applicable network policy; the Pokedex site does **not** construct or submit a replacement transaction and provides no fee-bump control. The fee rate is taken from the live fee-estimate service and the exact total fee is shown in the pre-sign review. Any later replacement must be handled separately in a compatible wallet/tool after checking the original transaction status.

The constructor refuses dust outputs, unsupported input scripts, inconsistent inscription locations, fee inputs that may contain known inscriptions, invalid signatures, changed outputs, unexpected input order, or fee-accounting mismatches. Runes and Alkanes are not transferred by this feature; fee UTXOs carrying these assets are excluded.

## UniSat safe-UTXO Worker contract

The Pokedex uses the existing shared Cloudflare Worker `fractal-ordinal-live` for fee UTXO attestation. The Worker was updated and deployed with the Ordinal Punks repository's server-side change ([PR #117](https://github.com/Demro-Labs/ordinal-punks-collection/pull/117)); this Pokedex change does not modify Cloudflare settings, bindings or secrets. The UniSat API key remains server-side and is not sent to the browser.

The current client requires the explicit `inscriptionsRunesAlkanesChecked: true` marker, `isLowFee: false`, `isOpInRBF: false`, and an empty `inscriptions` array. The Worker checks outpoint details and protocol balances fail-closed, and limits each inspected page to 25 UTXOs. The Pokedex clients request 25-item pages to match that contract. A missing, malformed, oversized or unverified response stops PSBT preparation before signing.

## Ambiguous outcomes

If UniSat returns an incomplete native response (including the `toAddress` error), the transfer returns no valid transaction ID, or Mempool's broadcast response is uncertain, the site locks further transfer attempts for the current tab. The user must first check UniSat activity and the selected network's Mempool. A new attempt can be unlocked only after explicitly confirming that check. The site does not automatically retry an uncertain transfer.

## Validation and remaining manual check

Offline validation uses deterministic test-only keys and mocked UniSat/Worker/Mempool responses. It covers PSBT construction and signature verification, supported input/output scripts, RBF sequence, exact-fee review acceptance/cancellation, asset-attestation failures, missing safety flags and ambiguous outcomes. The current run passed 39 tests, TypeScript checking and the production build. No live wallet was asked to sign, no real UTXO was unlocked, and no transaction was broadcast during these checks.

Before relying on the flow with a real mainnet wallet, verify in the target UniSat Mobile version that `signPsbt` returns the documented PSBT shape for the supported input types. Review the Pokedex preview and UniSat's signing screen carefully. Do not approve if the network, recipient, inscription, outputs or fees differ.

## References

- [UniSat Wallet API](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet)
- [UniSat connect with UniSat Mobile](https://docs.unisat.io/developer-support/open-api-documentation/unisat-wallet/connect-with-unisat-mobile-wallet)
- [UniSat Runes indexer API](https://github.com/unisat-wallet/unisat-dev-docs/blob/master/open-api/auto-generated/docs/runes-indexer.md)
- [UniSat Alkanes indexer API](https://github.com/unisat-wallet/unisat-dev-docs/blob/master/open-api/auto-generated/docs/alkanes-indexer.md)
- [Bitcoin Core opt-in RBF FAQ](https://bitcoincore.org/en/faq/optin_rbf/)
- [Mempool REST API](https://mempool.space/docs/api/rest)
