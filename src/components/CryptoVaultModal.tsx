import React, { useState } from 'react';
import { X, ShieldCheck, Lock, Unlock, Key, Copy, Check, Hash } from 'lucide-react';

interface CryptoVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onLogActivity?: (action: string) => void;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export const CryptoVaultModal: React.FC<CryptoVaultModalProps> = ({
  isOpen,
  onClose,
  theme,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';
  const [mode, setMode] = useState<'encrypt' | 'decrypt' | 'hash'>('encrypt');
  const [inputText, setInputText] = useState<string>('AethexFlow Release Secret Payload');
  const [passphrase, setPassphrase] = useState<string>('aethex-vault-key');
  const [outputText, setOutputText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const handleRun = async () => {
    setErrorMsg(null);
    if (!inputText) {
      setErrorMsg('Input payload cannot be empty.');
      return;
    }

    try {
      const enc = new TextEncoder();
      const dec = new TextDecoder();

      if (mode === 'hash') {
        const sha256Buf = await window.crypto.subtle.digest('SHA-256', enc.encode(inputText));
        const sha512Buf = await window.crypto.subtle.digest('SHA-512', enc.encode(inputText));
        setOutputText(
          `SHA-256:\n${bytesToHex(sha256Buf)}\n\nSHA-512:\n${bytesToHex(sha512Buf)}`
        );
        onLogActivity?.('Generated SHA-256 & SHA-512 cryptographic digests');
        return;
      }

      if (!passphrase) {
        setErrorMsg('Passphrase is required for AES-256-GCM key derivation.');
        return;
      }

      if (mode === 'encrypt') {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveAesKey(passphrase, salt);
        const cipherBuf = await window.crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          enc.encode(inputText)
        );
        const envelope = JSON.stringify({
          alg: 'AES-256-GCM',
          kdf: 'PBKDF2-SHA256',
          salt: bytesToBase64(salt),
          iv: bytesToBase64(iv),
          ct: bytesToBase64(new Uint8Array(cipherBuf)),
        });
        setOutputText(btoa(envelope));
        onLogActivity?.('Encrypted payload with WebCrypto AES-256-GCM');
      } else {
        const parsed = JSON.parse(atob(inputText.trim()));
        const salt = base64ToBytes(parsed.salt);
        const iv = base64ToBytes(parsed.iv);
        const ct = base64ToBytes(parsed.ct);
        const key = await deriveAesKey(passphrase, salt);
        const plainBuf = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv as unknown as BufferSource },
          key,
          ct as unknown as BufferSource
        );
        setOutputText(dec.decode(plainBuf));
        onLogActivity?.('Decrypted AES-256-GCM payload locally');
      }
    } catch {
      setErrorMsg(
        mode === 'decrypt'
          ? 'Decryption failed: invalid ciphertext envelope or wrong passphrase.'
          : 'WebCrypto operation failed in this browser context.'
      );
    }
  };

  const handleCopy = () => {
    if (!outputText) return;
    navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className={`w-full max-w-2xl rounded-2xl overflow-hidden border shadow-2xl ${
          isDark ? 'bg-[#12141c] border-neutral-800 text-white' : 'bg-white border-neutral-200 text-neutral-900'
        }`}
      >
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? 'border-neutral-800 bg-neutral-900/50' : 'border-neutral-100 bg-neutral-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/15 text-red-500 flex items-center justify-center border border-red-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">AES-256 Crypto Vault</h3>
              <p className="text-xs text-neutral-400">Real WebCrypto Subtle AES-256-GCM &amp; SHA-256/512 local processor</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Crypto Vault"
            className="p-2 rounded-lg hover:bg-neutral-800/50 text-neutral-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          {/* Mode Tabs */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('encrypt');
                setOutputText('');
                setErrorMsg(null);
              }}
              className={`py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 ${
                mode === 'encrypt'
                  ? 'bg-red-600 text-white border-red-500'
                  : isDark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-400'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-700'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Encrypt</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('decrypt');
                setOutputText('');
                setErrorMsg(null);
              }}
              className={`py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 ${
                mode === 'decrypt'
                  ? 'bg-red-600 text-white border-red-500'
                  : isDark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-400'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-700'
              }`}
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Decrypt</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('hash');
                setOutputText('');
                setErrorMsg(null);
              }}
              className={`py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 ${
                mode === 'hash'
                  ? 'bg-red-600 text-white border-red-500'
                  : isDark
                  ? 'border-neutral-800 bg-neutral-900 text-neutral-400'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-700'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>SHA Hash</span>
            </button>
          </div>

          {mode !== 'hash' && (
            <label className="block space-y-1">
              <span className="text-[11px] uppercase font-bold text-neutral-400 flex items-center gap-1">
                <Key className="w-3 h-3" /> Passphrase (PBKDF2 100k rounds)
              </span>
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className={`w-full p-2.5 rounded-xl border outline-none ${
                  isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                }`}
              />
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-[11px] uppercase font-bold text-neutral-400">
              {mode === 'decrypt' ? 'Encrypted Base64 Envelope' : 'Input Payload'}
            </span>
            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className={`w-full p-3 rounded-xl border font-mono outline-none ${
                isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
              }`}
            />
          </label>

          {errorMsg && (
            <div className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            onClick={handleRun}
            className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold shadow-sm transition-colors"
          >
            {mode === 'encrypt'
              ? 'Encrypt with AES-256-GCM'
              : mode === 'decrypt'
              ? 'Decrypt Payload'
              : 'Generate SHA-256 & SHA-512'}
          </button>

          {outputText && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-bold text-emerald-400">Result</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <textarea
                readOnly
                rows={4}
                value={outputText}
                className={`w-full p-3 rounded-xl border font-mono text-[11px] ${
                  isDark ? 'bg-[#090a0f] border-neutral-800 text-emerald-300' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                }`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
