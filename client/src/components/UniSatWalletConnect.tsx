import { useEffect, useState } from "react";
import { ExternalLink, Wallet } from "lucide-react";

type UniSatChain = {
  enum?: string;
  name?: string;
  network?: string;
};

type UniSatProvider = {
  requestAccounts: () => Promise<string[]>;
  getChain?: () => Promise<UniSatChain>;
  switchChain?: (chain: "FRACTAL_BITCOIN_MAINNET") => Promise<UniSatChain>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    unisat?: UniSatProvider;
  }
}

const FRACTAL_MAINNET = "FRACTAL_BITCOIN_MAINNET";
const MARKETPLACE_URL = "https://fractal.unisat.io/market/collection?collectionId=pokedex";

function shortAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function UniSatWalletConnect() {
  const [providerAvailable, setProviderAvailable] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [chain, setChain] = useState<UniSatChain | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const provider = window.unisat;
    setProviderAvailable(Boolean(provider));
    if (!provider) return;

    const handleAccounts = (...args: unknown[]) => {
      const accounts = args[0];
      setAddress(Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null);
    };
    const handleChain = () => {
      void provider.getChain?.().then(setChain).catch(() => setChain(null));
    };

    provider.on?.("accountsChanged", handleAccounts);
    provider.on?.("chainChanged", handleChain);
    provider.on?.("networkChanged", handleChain);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccounts);
      provider.removeListener?.("chainChanged", handleChain);
      provider.removeListener?.("networkChanged", handleChain);
    };
  }, []);

  const connect = async () => {
    const provider = window.unisat;
    setError("");
    if (!provider) {
      setProviderAvailable(false);
      setError("Install or enable the official UniSat Wallet extension, then try again.");
      return;
    }
    if (!provider.getChain) {
      setError("Update UniSat Wallet to a version that supports chain detection.");
      return;
    }

    setBusy(true);
    try {
      const accounts = await provider.requestAccounts();
      const selectedAddress = accounts[0];
      if (!selectedAddress) throw new Error("UniSat did not return an account.");
      const selectedChain = await provider.getChain();
      setAddress(selectedAddress);
      setChain(selectedChain);
      if (selectedChain.enum !== FRACTAL_MAINNET) {
        setError("Wallet connected, but it is not on Fractal Bitcoin mainnet.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "UniSat connection was cancelled or failed.");
    } finally {
      setBusy(false);
    }
  };

  const switchToFractal = async () => {
    const provider = window.unisat;
    if (!provider?.switchChain) {
      setError("Update UniSat Wallet to enable Fractal Bitcoin network switching.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const selectedChain = await provider.switchChain(FRACTAL_MAINNET);
      setChain(selectedChain);
      if (selectedChain.enum !== FRACTAL_MAINNET) {
        setError("UniSat did not confirm Fractal Bitcoin mainnet.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Network switch was cancelled or failed.");
    } finally {
      setBusy(false);
    }
  };

  const connectedToFractal = Boolean(address && chain?.enum === FRACTAL_MAINNET);

  return (
    <div className="flex flex-col gap-3 border border-[#2c323a] bg-[#14191f] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d9d3c6]">
          <Wallet size={14} className="text-[#d99a54]" />
          {connectedToFractal ? "UniSat · Fractal Bitcoin" : "UniSat Wallet · Fractal Bitcoin"}
        </p>
        <p className="mt-1 font-mono text-[10px] text-[#7f8b99]" aria-live="polite">
          {connectedToFractal
            ? `Connected: ${shortAddress(address!)}`
            : address
              ? `Connected to ${chain?.name ?? "another network"}; switch to Fractal to continue.`
              : providerAvailable
                ? "Connect only when you choose. No signature is requested here."
                : "UniSat Wallet extension not detected."}
        </p>
        {connectedToFractal && (
          <p className="mt-1 font-mono text-[9px] text-[#718092]">
            Clear session hides this address here; revoke site access in UniSat to remove its permission.
          </p>
        )}
        {error && <p className="mt-2 font-mono text-[10px] text-[#e08b7d]" role="alert">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {connectedToFractal ? (
          <button
            type="button"
            onClick={() => { setAddress(null); setChain(null); setError(""); }}
            className="border border-[#3b434d] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#d9d3c6] hover:border-[#d99a54]"
          >
            Clear session
          </button>
        ) : address ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void switchToFractal()}
            className="border border-[#d99a54] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#f2bd63] disabled:opacity-50"
          >
            {busy ? "Waiting for UniSat…" : "Switch to Fractal"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void connect()}
            className="border border-[#d99a54] bg-[#d99a54] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#0b0d10] disabled:opacity-50"
          >
            {busy ? "Waiting for UniSat…" : "Connect UniSat"}
          </button>
        )}
        <a
          href={MARKETPLACE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 border border-[#3b434d] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#9ea7b3] hover:border-[#d99a54] hover:text-[#f3efe5]"
        >
          Open UniSat market <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
