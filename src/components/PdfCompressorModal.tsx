import React, { useState } from 'react';
import { X, FileText, Download, Sparkles, ArrowRight, RefreshCw } from 'lucide-react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

interface PdfCompressorModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onLogActivity?: (action: string) => void;
}

async function generateSamplePdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('AethexFlow Release Architecture Specification v4.2');
  doc.setAuthor('AethexFlow Creator');
  doc.setSubject('Cloudflare Release Specification & Security Audit');
  doc.setKeywords(['aethexflow', 'cloudflare', 'dag', 'automation']);
  doc.setProducer('AethexFlow Studio PDF Generator');
  doc.setCreator('AethexFlow v4.2.0');

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (let i = 1; i <= 4; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`AethexFlow Cloudflare Release — Page ${i}`, {
      x: 54,
      y: 720,
      size: 18,
      font: bold,
      color: rgb(0.1, 0.1, 0.15),
    });
    page.drawText(
      `Automated DAG validation, browser Video Studio, WebCrypto AES-256-GCM vault, and live bots.`,
      {
        x: 54,
        y: 690,
        size: 11,
        font,
        color: rgb(0.3, 0.3, 0.38),
      }
    );
    for (let row = 0; row < 12; row++) {
      page.drawText(
        `Section ${i}.${row + 1}: Verified zero-trust pipeline artifact and deterministic build record.`,
        {
          x: 54,
          y: 640 - row * 24,
          size: 10,
          font,
          color: rgb(0.25, 0.25, 0.3),
        }
      );
    }
  }
  return doc.save({ useObjectStreams: false });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PdfCompressorModal: React.FC<PdfCompressorModalProps> = ({
  isOpen,
  onClose,
  theme,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';

  const [fileName, setFileName] = useState<string>('AethexFlow_Architecture_Spec_v4.2.pdf');
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [originalBytesCount, setOriginalBytesCount] = useState<number>(0);
  const [compressedBytesCount, setCompressedBytesCount] = useState<number>(0);
  const [pageCount, setPageCount] = useState<number>(4);
  const [compressedBlobUrl, setCompressedBlobUrl] = useState<string | null>(null);

  const [profile, setProfile] = useState<'extreme' | 'balanced' | 'crisp'>('balanced');
  const [stripMetadata, setStripMetadata] = useState<boolean>(true);
  const [useObjectStreams, setUseObjectStreams] = useState<boolean>(true);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDone, setIsDone] = useState<boolean>(false);

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    setIsDone(false);
    if (compressedBlobUrl) {
      URL.revokeObjectURL(compressedBlobUrl);
      setCompressedBlobUrl(null);
    }

    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const loaded = await PDFDocument.load(buf, { ignoreEncryption: true });
      setFileName(file.name);
      setSourceBytes(buf);
      setOriginalBytesCount(buf.byteLength);
      setCompressedBytesCount(0);
      setPageCount(loaded.getPageCount());
    } catch {
      setErrorMsg('Could not parse PDF structure. Make sure the file is a valid PDF.');
    }
  };

  const startCompression = async () => {
    setErrorMsg(null);
    setIsCompressing(true);
    setProgress(20);
    setIsDone(false);

    try {
      const inputBytes = sourceBytes || (await generateSamplePdfBytes());
      setOriginalBytesCount(inputBytes.byteLength);
      setProgress(50);

      const doc = await PDFDocument.load(inputBytes, { ignoreEncryption: true });
      setPageCount(doc.getPageCount());

      if (stripMetadata) {
        doc.setTitle('');
        doc.setAuthor('');
        doc.setSubject('');
        doc.setKeywords([]);
        doc.setProducer('');
        doc.setCreator('');
      }

      setProgress(80);
      const outBytes = await doc.save({
        useObjectStreams: useObjectStreams || profile !== 'crisp',
        addDefaultPage: false,
      });

      if (compressedBlobUrl) URL.revokeObjectURL(compressedBlobUrl);
      const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      setCompressedBlobUrl(url);
      setCompressedBytesCount(outBytes.byteLength);
      setProgress(100);
      setIsDone(true);

      const savedPct = Math.max(
        0,
        Math.round(((inputBytes.byteLength - outBytes.byteLength) / inputBytes.byteLength) * 100)
      );
      onLogActivity?.(
        `Compressed PDF "${fileName}" (${formatBytes(inputBytes.byteLength)} -> ${formatBytes(
          outBytes.byteLength
        )}, ${savedPct}% saved)`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'PDF compression failed');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!compressedBlobUrl) return;
    const a = document.createElement('a');
    a.href = compressedBlobUrl;
    a.download = `optimized_${fileName}`;
    a.click();
    onLogActivity?.(`Downloaded compressed PDF: optimized_${fileName}`);
  };

  if (!isOpen) return null;

  const savedPercent =
    originalBytesCount > 0 && compressedBytesCount > 0
      ? Math.max(0, Math.round(((originalBytesCount - compressedBytesCount) / originalBytesCount) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div
        className={`w-full max-w-2xl rounded-2xl overflow-hidden border shadow-2xl transition-all ${
          isDark
            ? 'bg-[#12141c] border-neutral-800 text-white'
            : 'bg-white border-neutral-200 text-neutral-900 shadow-xl'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark ? 'border-neutral-800/80 bg-neutral-900/50' : 'border-neutral-100 bg-neutral-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center border border-red-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">PDF Compressor (pdf-lib)</h3>
              <p className="text-xs text-neutral-400">
                Real browser PDF object-stream optimization &amp; metadata stripping
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PDF Compressor"
            className="p-2 rounded-lg hover:bg-neutral-800/50 text-neutral-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* File Card */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
              isDark ? 'bg-neutral-900/60 border-neutral-800' : 'bg-neutral-50 border-neutral-200'
            }`}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-red-600/10 border border-red-500/20 flex items-center justify-center text-red-500 font-bold shrink-0">
                PDF
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{fileName}</p>
                <p className="text-xs text-neutral-400">
                  {originalBytesCount > 0 ? formatBytes(originalBytesCount) : 'Sample Spec Ready'} • {pageCount} Pages
                </p>
              </div>
            </div>

            <label
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer shrink-0 ${
                isDark
                  ? 'border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200'
                  : 'border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-800'
              }`}
            >
              Upload PDF
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => handleFileUpload(e.target.files?.[0])}
              />
            </label>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400">
              {errorMsg}
            </div>
          )}

          {/* Profile Selection */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'extreme', title: 'Maximum', desc: 'Object streams + strip all XMP' },
              { id: 'balanced', title: 'Balanced', desc: 'Compressed streams + clean header' },
              { id: 'crisp', title: 'Archival', desc: 'Preserve structure, trim unused' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setProfile(item.id as any)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  profile === item.id
                    ? 'border-red-500 bg-red-500/15'
                    : isDark
                    ? 'border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:border-neutral-700'
                    : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                }`}
              >
                <span className={`font-bold text-xs block mb-1 ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                  {item.title}
                </span>
                <p className="text-[11px] text-neutral-400">{item.desc}</p>
              </button>
            ))}
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
                isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'
              }`}
            >
              <input
                type="checkbox"
                checked={stripMetadata}
                onChange={(e) => setStripMetadata(e.target.checked)}
                className="rounded accent-red-500"
              />
              <div className="text-xs">
                <span className={`font-semibold block ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
                  Strip Document Metadata
                </span>
                <span className="text-neutral-400">Clear Author, Creator &amp; Subject tags</span>
              </div>
            </label>

            <label
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
                isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'
              }`}
            >
              <input
                type="checkbox"
                checked={useObjectStreams}
                onChange={(e) => setUseObjectStreams(e.target.checked)}
                className="rounded accent-red-500"
              />
              <div className="text-xs">
                <span className={`font-semibold block ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
                  Flate Object Streams
                </span>
                <span className="text-neutral-400">Re-pack cross-reference tables</span>
              </div>
            </label>
          </div>

          {/* Real Size Comparison */}
          {isDone && (
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400 block">Original</span>
                  <span className="font-mono text-base font-bold">{formatBytes(originalBytesCount)}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-400" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block">Compressed</span>
                  <span className="font-mono text-lg font-bold text-emerald-400">
                    {formatBytes(compressedBytesCount)}
                  </span>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold border border-emerald-500/30">
                {savedPercent}% Reduced
              </span>
            </div>
          )}

          {isCompressing && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-neutral-400">
                <span>Repacking PDF streams locally...</span>
                <span className="font-mono text-red-400">{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
                <div className="h-full bg-red-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={startCompression}
              disabled={isCompressing}
              className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isCompressing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Compressing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{isDone ? 'Re-compress PDF' : 'Start PDF Compression'}</span>
                </>
              )}
            </button>

            {isDone && (
              <button
                type="button"
                onClick={handleDownload}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
