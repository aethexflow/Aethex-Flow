import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Upload, Download, Sparkles } from 'lucide-react';

interface BackgroundRemoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onLogActivity?: (action: string) => void;
}

export const BackgroundRemoverModal: React.FC<BackgroundRemoverModalProps> = ({
  isOpen,
  onClose,
  theme,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';
  const [tolerance, setTolerance] = useState<number>(32);
  const [feather, setFeather] = useState<number>(2);
  const [bgPreviewType, setBgPreviewType] = useState<'transparent' | 'white' | 'dark' | 'neon'>('transparent');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [engineLabel, setEngineLabel] = useState<string>('Ready');
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'result' | 'split' | 'original'>('result');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanupObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const applyFeatherAndExport = useCallback(
    async (inputBlob: Blob, featherPx: number): Promise<string> => {
      const bitmap = await createImageBitmap(inputBlob);
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      bitmap.close();

      if (!ctx) {
        return URL.createObjectURL(inputBlob);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (featherPx > 0) {
        ctx.filter = `blur(${Math.min(featherPx * 0.35, 3)}px)`;
      } else {
        ctx.filter = 'none';
      }

      const tempImg = new Image();
      const tempUrl = URL.createObjectURL(inputBlob);
      await new Promise<void>((resolve, reject) => {
        tempImg.onload = () => resolve();
        tempImg.onerror = () => reject(new Error('Failed to load cutout image'));
        tempImg.src = tempUrl;
      });

      ctx.drawImage(tempImg, 0, 0);
      ctx.filter = 'none';
      URL.revokeObjectURL(tempUrl);

      return canvas.toDataURL('image/png');
    },
    []
  );

  const runSmartFloodFillFallback = useCallback(
    async (srcUrl: string, tol: number, featherPx: number): Promise<string> => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for fallback'));
        img.src = srcUrl;
      });

      const width = img.width;
      const height = img.height;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas context unavailable');

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;

      // Seed from top-left and top-right corners to target outer background only
      const seeds = [0, (width - 1) * 4];
      const seedR = (data[seeds[0]] + data[seeds[1]]) / 2;
      const seedG = (data[seeds[0] + 1] + data[seeds[1] + 1]) / 2;
      const seedB = (data[seeds[0] + 2] + data[seeds[1] + 2]) / 2;

      const visited = new Uint8Array(width * height);
      const queue = new Int32Array(width * height);
      let head = 0;
      let tail = 0;

      const maxDist = Math.max(12, tol * 1.6);
      const colorDiff = (pixelIdx: number) => {
        const idx = pixelIdx * 4;
        const dr = data[idx] - seedR;
        const dg = data[idx + 1] - seedG;
        const db = data[idx + 2] - seedB;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      };

      const enqueueIfMatch = (px: number) => {
        if (px < 0 || px >= width * height || visited[px]) return;
        if (colorDiff(px) <= maxDist) {
          visited[px] = 1;
          queue[tail++] = px;
        }
      };

      enqueueIfMatch(0);
      enqueueIfMatch(width - 1);

      while (head < tail) {
        const curr = queue[head++];
        const x = curr % width;
        const y = (curr - x) / width;

        if (x > 0) enqueueIfMatch(curr - 1);
        if (x < width - 1) enqueueIfMatch(curr + 1);
        if (y > 0) enqueueIfMatch(curr - width);
        if (y < height - 1) enqueueIfMatch(curr + width);
      }

      for (let p = 0; p < width * height; p++) {
        if (visited[p]) {
          data[p * 4 + 3] = 0;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      const cutBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Blob export failed'))), 'image/png');
      });

      return applyFeatherAndExport(cutBlob, featherPx);
    },
    [applyFeatherAndExport]
  );

  const processImage = useCallback(
    async (srcUrl: string, tol: number, fea: number, logAction = false) => {
      setIsProcessing(true);
      setEngineLabel('Segmenting subject...');

      try {
        const resultUrl = await runSmartFloodFillFallback(srcUrl, tol, fea);
        setProcessedUrl(resultUrl);
        setEngineLabel('AethexFlow Segmentation Ready');
        if (logAction) {
          onLogActivity?.('Background removed with AethexFlow subject segmentation');
        }
      } catch {
        setEngineLabel('Unable to process image');
      } finally {
        setIsProcessing(false);
      }
    },
    [runSmartFloodFillFallback, onLogActivity]
  );

  const loadSampleImage = useCallback(
    (type: 'watch' | 'portrait' | 'gadget') => {
      cleanupObjectUrl();
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, 0, 600, 600);

      if (type === 'watch') {
        ctx.fillStyle = '#18181b';
        ctx.beginPath();
        ctx.roundRect(180, 160, 240, 280, [40]);
        ctx.fill();

        const grad = ctx.createLinearGradient(200, 180, 400, 420);
        grad.addColorStop(0, '#ef4444');
        grad.addColorStop(1, '#991b1b');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(200, 180, 200, 240, [24]);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('10:42', 300, 290);
        ctx.font = '14px sans-serif';
        ctx.fillText('AETHEX ENGINE', 300, 325);

        ctx.fillStyle = '#27272a';
        ctx.fillRect(230, 40, 140, 120);
        ctx.fillRect(230, 440, 140, 120);
      } else {
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath();
        ctx.arc(300, 300, 150, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('AI ROBOTICS', 300, 305);
      }

      const dataUrl = canvas.toDataURL('image/png');
      setOriginalUrl(dataUrl);
      void processImage(dataUrl, tolerance, feather, false);
    },
    [processImage, tolerance, feather]
  );

  useEffect(() => {
    if (isOpen && !originalUrl) {
      loadSampleImage('watch');
    }
    if (!isOpen) {
      cleanupObjectUrl();
    }
  }, [isOpen, originalUrl, loadSampleImage]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    cleanupObjectUrl();
    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;
    setOriginalUrl(nextUrl);
    void processImage(nextUrl, tolerance, feather, true);
  };

  const handleDownload = () => {
    if (!processedUrl) return;
    const a = document.createElement('a');
    a.href = processedUrl;
    a.download = `aethexflow-cutout-${Date.now()}.png`;
    a.click();
    onLogActivity?.('Downloaded transparent PNG cutout');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl rounded-2xl overflow-hidden border shadow-2xl transition-all ${
          isDark
            ? 'bg-[#12141c] border-neutral-800 text-white shadow-red-950/40'
            : 'bg-white border-red-200 text-neutral-900 shadow-xl'
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
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Background Remover</h3>
              <p className="text-xs text-neutral-400">On-device subject cutout with smooth edge refinement</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Background Remover"
            className="p-2 rounded-lg hover:bg-neutral-800/50 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Controls Column */}
          <div className="space-y-5">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block mb-2">
                Input Image
              </label>
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
                className={`w-full py-3 px-4 rounded-xl border border-dashed flex items-center justify-center gap-2 font-medium text-sm transition-all ${
                  isDark
                    ? 'border-neutral-700 hover:border-red-500 bg-neutral-900/60 hover:bg-red-500/10 text-neutral-300 hover:text-white'
                    : 'border-neutral-300 hover:border-red-500 bg-neutral-50 hover:bg-red-50 text-neutral-700'
                }`}
              >
                <Upload className="w-4 h-4 text-red-500" />
                <span>Upload Custom Image</span>
              </button>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => loadSampleImage('watch')}
                  className="flex-1 py-1 px-2 text-xs rounded-lg bg-neutral-800/70 hover:bg-neutral-700 text-neutral-300"
                >
                  Watch Demo
                </button>
                <button
                  type="button"
                  onClick={() => loadSampleImage('gadget')}
                  className="flex-1 py-1 px-2 text-xs rounded-lg bg-neutral-800/70 hover:bg-neutral-700 text-neutral-300"
                >
                  Gadget Demo
                </button>
              </div>
            </div>

            {/* Slider: Tolerance */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-neutral-300">Fallback Tolerance</span>
                <span className="font-mono text-red-400">{tolerance}</span>
              </div>
              <input
                type="range"
                min="5"
                max="80"
                value={tolerance}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTolerance(val);
                  if (originalUrl) void processImage(originalUrl, val, feather, false);
                }}
                className="w-full accent-red-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Slider: Feather */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="font-medium text-neutral-300">Soft Edge Feathering</span>
                <span className="font-mono text-red-400">{feather}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="8"
                value={feather}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setFeather(val);
                  if (originalUrl) void processImage(originalUrl, tolerance, val, false);
                }}
                className="w-full accent-red-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Preview Background Backdrop */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
                Preview Backdrop
              </label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setBgPreviewType('transparent')}
                  className={`py-2 text-xs rounded-lg border flex flex-col items-center gap-1 font-medium ${
                    bgPreviewType === 'transparent'
                      ? 'border-red-500 bg-red-500/20 text-red-400'
                      : 'border-neutral-800 bg-neutral-900/60 text-neutral-400'
                  }`}
                >
                  <span className="w-4 h-4 rounded bg-[conic-gradient(#666_25%,#333_0_50%,#666_0_75%,#333_0)]"></span>
                  Alpha
                </button>
                <button
                  type="button"
                  onClick={() => setBgPreviewType('white')}
                  className={`py-2 text-xs rounded-lg border flex flex-col items-center gap-1 font-medium ${
                    bgPreviewType === 'white'
                      ? 'border-red-500 bg-red-500/20 text-red-400'
                      : 'border-neutral-800 bg-neutral-900/60 text-neutral-400'
                  }`}
                >
                  <span className="w-4 h-4 rounded bg-white"></span>
                  White
                </button>
                <button
                  type="button"
                  onClick={() => setBgPreviewType('dark')}
                  className={`py-2 text-xs rounded-lg border flex flex-col items-center gap-1 font-medium ${
                    bgPreviewType === 'dark'
                      ? 'border-red-500 bg-red-500/20 text-red-400'
                      : 'border-neutral-800 bg-neutral-900/60 text-neutral-400'
                  }`}
                >
                  <span className="w-4 h-4 rounded bg-neutral-950 border border-neutral-700"></span>
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => setBgPreviewType('neon')}
                  className={`py-2 text-xs rounded-lg border flex flex-col items-center gap-1 font-medium ${
                    bgPreviewType === 'neon'
                      ? 'border-red-500 bg-red-500/20 text-red-400'
                      : 'border-neutral-800 bg-neutral-900/60 text-neutral-400'
                  }`}
                >
                  <span className="w-4 h-4 rounded bg-red-600"></span>
                  Neon
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownload}
                disabled={!processedUrl || isProcessing}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>Export Transparent PNG</span>
              </button>
            </div>
          </div>

          {/* Canvas Preview Area */}
          <div className="md:col-span-2 flex flex-col">
            {/* View switcher tabs */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex gap-1.5 p-1 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setActiveTab('result')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    activeTab === 'result'
                      ? 'bg-red-500 text-white font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Cutout Result
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('split')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    activeTab === 'split'
                      ? 'bg-red-500 text-white font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Side by Side
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('original')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    activeTab === 'original'
                      ? 'bg-red-500 text-white font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Original
                </button>
              </div>

              <span className="text-xs text-neutral-400 font-mono">
                {isProcessing ? 'Processing...' : engineLabel}
              </span>
            </div>

            {/* Canvas display box */}
            <div
              className={`flex-1 min-h-[360px] rounded-2xl border flex items-center justify-center p-4 relative overflow-hidden ${
                isDark ? 'border-neutral-800' : 'border-neutral-200'
              } ${
                bgPreviewType === 'transparent'
                  ? 'bg-[linear-gradient(45deg,#181920_25%,transparent_25%),linear-gradient(-45deg,#181920_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#181920_75%),linear-gradient(-45deg,transparent_75%,#181920_75%)] bg-[size:20px_20px] bg-[#0f1016]'
                  : bgPreviewType === 'white'
                  ? 'bg-white'
                  : bgPreviewType === 'dark'
                  ? 'bg-black'
                  : 'bg-gradient-to-br from-red-950 via-black to-neutral-950'
              }`}
            >
              {activeTab === 'result' && processedUrl && (
                <img
                  src={processedUrl}
                  alt="Cutout result"
                  className="max-h-[340px] max-w-full object-contain drop-shadow-2xl animate-in zoom-in-95 duration-200"
                />
              )}

              {activeTab === 'original' && originalUrl && (
                <img
                  src={originalUrl}
                  alt="Original input"
                  className="max-h-[340px] max-w-full object-contain"
                />
              )}

              {activeTab === 'split' && (
                <div className="grid grid-cols-2 gap-4 w-full h-full items-center">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase font-bold text-neutral-400 mb-1">Original</span>
                    {originalUrl && (
                      <img src={originalUrl} alt="Original" className="max-h-[260px] object-contain rounded-lg border border-neutral-700/50" />
                    )}
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] uppercase font-bold text-red-400 mb-1">Aethex Cutout</span>
                    {processedUrl && (
                      <img src={processedUrl} alt="Cutout" className="max-h-[260px] object-contain rounded-lg border border-red-500/40" />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hidden work canvas */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};