import React, { useState, useRef, useEffect } from 'react';
import { X, RefreshCw, Download, Upload, Sliders, Check, Sparkles } from 'lucide-react';

interface ImageConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onLogActivity?: (action: string) => void;
}

export const ImageConverterModal: React.FC<ImageConverterModalProps> = ({
  isOpen,
  onClose,
  theme,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';
  const [targetFormat, setTargetFormat] = useState<'webp' | 'png' | 'jpeg'>('webp');
  const [quality, setQuality] = useState<number>(85);
  const [scale, setScale] = useState<number>(100);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number; name: string }>({
    width: 800,
    height: 800,
    name: 'sample_asset.png',
  });
  const [convertedBlobUrl, setConvertedBlobUrl] = useState<string | null>(null);
  const [convertedSizeKb, setConvertedSizeKb] = useState<number>(0);
  const [isConverting, setIsConverting] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && !originalImageUrl) {
      // Create sample image
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Gradient backdrop
        const grad = ctx.createRadialGradient(400, 400, 50, 400, 400, 450);
        grad.addColorStop(0, '#dc2626');
        grad.addColorStop(0.7, '#18181b');
        grad.addColorStop(1, '#09090b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 800, 800);

        // Tech geometry
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 3;
        ctx.strokeRect(150, 150, 500, 500);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AETHEXFLOW', 400, 390);

        ctx.fillStyle = '#ef4444';
        ctx.font = '600 24px monospace';
        ctx.fillText('NATIVE IMAGE ACCELERATOR', 400, 435);
      }
      const url = canvas.toDataURL('image/png');
      setOriginalImageUrl(url);
      runConversion(url, targetFormat, quality, scale);
    }
  }, [isOpen]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImageMeta({ width: img.width, height: img.height, name: file.name });
        setOriginalImageUrl(url);
        runConversion(url, targetFormat, quality, scale);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const runConversion = (srcUrl: string, format: 'webp' | 'png' | 'jpeg', q: number, s: number) => {
    setIsConverting(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const targetWidth = Math.round((img.width * s) / 100);
      const targetHeight = Math.round((img.height * s) / 100);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (format === 'jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const mimeType = format === 'webp' ? 'image/webp' : format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const qFactor = q / 100;

      canvas.toBlob(
        (blob) => {
          if (blob) {
            if (convertedBlobUrl) URL.revokeObjectURL(convertedBlobUrl);
            const blobUrl = URL.createObjectURL(blob);
            setConvertedBlobUrl(blobUrl);
            setConvertedSizeKb(Math.round(blob.size / 1024));
            setIsConverting(false);
          }
        },
        mimeType,
        qFactor
      );
    };
    img.src = srcUrl;
  };

  const handleDownload = () => {
    if (!convertedBlobUrl) return;
    const a = document.createElement('a');
    a.href = convertedBlobUrl;
    const baseName = imageMeta.name.split('.')[0] || 'converted';
    a.download = `${baseName}.${targetFormat}`;
    a.click();
    onLogActivity?.(`Converted image to .${targetFormat} (${convertedSizeKb} KB)`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-3xl rounded-2xl overflow-hidden border shadow-2xl transition-all ${
          isDark
            ? 'bg-[#12141c] border-neutral-800 text-white shadow-red-950/40'
            : 'bg-white border-red-200 text-neutral-900 shadow-xl'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isDark ? 'border-neutral-800/80 bg-neutral-900/50' : 'border-neutral-100 bg-neutral-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600/20 text-red-500 flex items-center justify-center border border-red-500/30">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Image Converter</h3>
              <p className="text-xs text-neutral-400">Zero-cloud local transcoding into WebP, PNG, and JPEG</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Image Converter"
            className="p-2 rounded-lg hover:bg-neutral-800/50 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-2">
                Target Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['webp', 'png', 'jpeg'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      setTargetFormat(fmt);
                      if (originalImageUrl) runConversion(originalImageUrl, fmt, quality, scale);
                    }}
                    className={`py-2.5 rounded-xl border text-center font-bold text-xs uppercase tracking-wider transition-all ${
                      targetFormat === fmt
                        ? 'border-red-500 bg-red-500/20 text-white shadow-sm shadow-red-950'
                        : 'border-neutral-800 bg-neutral-900/40 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    .{fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Slider */}
            {targetFormat !== 'png' && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-neutral-300">Compression Quality</span>
                  <span className="font-mono text-red-400">{quality}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={quality}
                  onChange={(e) => {
                    const q = Number(e.target.value);
                    setQuality(q);
                    if (originalImageUrl) runConversion(originalImageUrl, targetFormat, q, scale);
                  }}
                  className="w-full accent-red-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>
            )}

            {/* Resolution Scaling */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-neutral-300">Output Scale</span>
                <span className="font-mono text-red-400">{scale}% ({Math.round(imageMeta.width * scale / 100)} × {Math.round(imageMeta.height * scale / 100)}px)</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[100, 75, 50, 25].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setScale(s);
                      if (originalImageUrl) runConversion(originalImageUrl, targetFormat, quality, s);
                    }}
                    className={`py-1.5 rounded-lg border text-xs font-semibold ${
                      scale === s
                        ? 'border-red-500 bg-red-500/20 text-white'
                        : 'border-neutral-800 bg-neutral-900/40 text-neutral-400'
                    }`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>

            {/* Upload or change image */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 rounded-xl border border-dashed border-neutral-700 hover:border-red-500 bg-neutral-900/40 text-neutral-300 hover:text-white flex items-center justify-center gap-2 text-xs font-medium"
              >
                <Upload className="w-3.5 h-3.5 text-red-500" />
                <span>Upload Custom Image</span>
              </button>
            </div>

            {/* Download button */}
            <button
              type="button"
              onClick={handleDownload}
              disabled={!convertedBlobUrl}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Download .{targetFormat.toUpperCase()} ({convertedSizeKb} KB)</span>
            </button>
          </div>

          {/* Preview */}
          <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-neutral-800 bg-neutral-950/60">
            <span className="text-[10px] uppercase font-bold text-neutral-400 mb-2">Live Preview</span>
            {convertedBlobUrl ? (
              <img
                src={convertedBlobUrl}
                alt="Converted preview"
                className="max-h-[240px] max-w-full object-contain rounded-lg shadow-lg border border-neutral-800"
              />
            ) : (
              <div className="h-[240px] flex items-center justify-center text-xs text-neutral-400">
                Converting...
              </div>
            )}
            <div className="mt-3 text-center">
              <span className="font-mono text-xs text-emerald-400 font-semibold">
                Target: .{targetFormat.toUpperCase()} • {convertedSizeKb} KB
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
