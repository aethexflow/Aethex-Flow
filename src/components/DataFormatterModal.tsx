import React, { useState } from 'react';
import { X, Braces, Download, Copy, Check, FileSpreadsheet } from 'lucide-react';

interface DataFormatterModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onLogActivity?: (action: string) => void;
}

const SAMPLE_JSON = `[
  { "id": 101, "service": "Video Studio", "region": "Cloudflare Edge", "latency_ms": 14 },
  { "id": 102, "service": "PDF Compressor", "region": "Local Browser", "latency_ms": 9 },
  { "id": 103, "service": "Web Monitor Bot", "region": "Edge Runner", "latency_ms": 22 }
]`;

export const DataFormatterModal: React.FC<DataFormatterModalProps> = ({
  isOpen,
  onClose,
  theme,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';
  const [inputText, setInputText] = useState<string>(SAMPLE_JSON);
  const [outputText, setOutputText] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const formatJson = (pretty: boolean) => {
    setErrorMsg(null);
    try {
      const parsed = JSON.parse(inputText);
      const formatted = pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
      setOutputText(formatted);
      onLogActivity?.(pretty ? 'Formatted & validated JSON dataset' : 'Minified JSON dataset');
    } catch (e: any) {
      setErrorMsg(`Invalid JSON: ${e?.message || 'Parse error'}`);
    }
  };

  const jsonToCsv = () => {
    setErrorMsg(null);
    try {
      const parsed = JSON.parse(inputText);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      if (rows.length === 0) {
        setErrorMsg('JSON array is empty.');
        return;
      }
      const headers = Array.from(
        new Set(rows.flatMap((r) => (r && typeof r === 'object' ? Object.keys(r) : [])))
      );
      const escapeCell = (val: unknown) => {
        const s = String(val ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csvLines = [
        headers.join(','),
        ...rows.map((r) => headers.map((h) => escapeCell((r as Record<string, unknown>)[h])).join(',')),
      ];
      setOutputText(csvLines.join('\n'));
      onLogActivity?.(`Converted ${rows.length} JSON record(s) to CSV`);
    } catch (e: any) {
      setErrorMsg(`JSON -> CSV failed: ${e?.message || 'Invalid JSON'}`);
    }
  };

  const csvToJson = () => {
    setErrorMsg(null);
    const lines = inputText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      setErrorMsg('Provide CSV with header row and at least 1 data row.');
      return;
    }
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    const records = lines.slice(1).map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h || `col_${i + 1}`] = cols[i] ?? '';
      });
      return obj;
    });
    setOutputText(JSON.stringify(records, null, 2));
    onLogActivity?.(`Converted ${records.length} CSV row(s) to JSON`);
  };

  const handleDownload = () => {
    const content = outputText || inputText;
    const isCsv = !content.trim().startsWith('{') && !content.trim().startsWith('[');
    const blob = new Blob([content], { type: isCsv ? 'text/csv' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isCsv ? 'transformed_data.csv' : 'formatted_data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className={`w-full max-w-3xl rounded-2xl overflow-hidden border shadow-2xl ${
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
              <Braces className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">JSON &amp; CSV Transformer</h3>
              <p className="text-xs text-neutral-400">Validate, prettify, minify, and transform JSON &lt;-&gt; CSV locally</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Data Transformer"
            className="p-2 rounded-lg hover:bg-neutral-800/50 text-neutral-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => formatJson(true)}
              className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold"
            >
              Prettify JSON
            </button>
            <button
              type="button"
              onClick={() => formatJson(false)}
              className={`px-3.5 py-2 rounded-xl border font-semibold ${
                isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-200' : 'border-neutral-200 bg-neutral-50 text-neutral-800'
              }`}
            >
              Minify JSON
            </button>
            <button
              type="button"
              onClick={jsonToCsv}
              className={`px-3.5 py-2 rounded-xl border font-semibold flex items-center gap-1.5 ${
                isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-200' : 'border-neutral-200 bg-neutral-50 text-neutral-800'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>JSON → CSV</span>
            </button>
            <button
              type="button"
              onClick={csvToJson}
              className={`px-3.5 py-2 rounded-xl border font-semibold ${
                isDark ? 'border-neutral-800 bg-neutral-900 text-neutral-200' : 'border-neutral-200 bg-neutral-50 text-neutral-800'
              }`}
            >
              CSV → JSON
            </button>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-[11px] uppercase font-bold text-neutral-400">Input Data</span>
              <textarea
                rows={10}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className={`w-full p-3 rounded-xl border font-mono text-[11px] outline-none ${
                  isDark ? 'bg-[#0a0b0f] border-neutral-800 text-white' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                }`}
              />
            </label>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-bold text-emerald-400">Output</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!outputText) return;
                      navigator.clipboard.writeText(outputText);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                    }}
                    className="text-neutral-400 hover:text-white flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="text-red-400 hover:text-red-300 flex items-center gap-1 font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
              <textarea
                readOnly
                rows={10}
                value={outputText}
                placeholder="Click a transform button to view output..."
                className={`w-full p-3 rounded-xl border font-mono text-[11px] ${
                  isDark ? 'bg-[#090a0f] border-neutral-800 text-emerald-300' : 'bg-neutral-50 border-neutral-200 text-neutral-900'
                }`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
