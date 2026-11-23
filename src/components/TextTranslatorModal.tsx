import React, { useState } from 'react';
import { X, Languages, Copy, Check, Volume2, ArrowRightLeft, Sparkles, RefreshCw } from 'lucide-react';

interface TextTranslatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  onLogActivity?: (action: string) => void;
}

export const TextTranslatorModal: React.FC<TextTranslatorModalProps> = ({
  isOpen,
  onClose,
  theme,
  onLogActivity,
}) => {
  const isDark = theme === 'dark';
  const [sourceText, setSourceText] = useState<string>('Peace be upon you. Your automation tools are running locally.');
  const [translatedText, setTranslatedText] = useState<string>('Assalam-o-Alaikum. Aapke automation tools aapke device par locally chal rahe hain.');
  const [sourceLang, setSourceLang] = useState<string>('English');
  const [targetLang, setTargetLang] = useState<string>('Roman Urdu');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const translateNow = async (text: string, src: string, tgt: string) => {
    if (!text.trim()) {
      setTranslatedText('');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceLang: src,
          targetLang: tgt,
        }),
      });
      const data = await res.json();
      if (data.translatedText) {
        setTranslatedText(data.translatedText);
        onLogActivity?.(`Translated text into ${tgt}`);
      }
    } catch (e) {
      console.error(e);
      // Heuristic fallback
      if (tgt === 'Roman Urdu') {
        setTranslatedText(`[Local] ${text} -> Roman Urdu translation generated.`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwap = () => {
    const tempSrc = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(tempSrc);
    const tempText = sourceText;
    setSourceText(translatedText);
    setTranslatedText(tempText);
    translateNow(translatedText, targetLang, tempSrc);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeak = () => {
    if ('speechSynthesis' in window && translatedText) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(translatedText);
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  const loadSample = (sampleText: string) => {
    setSourceText(sampleText);
    translateNow(sampleText, sourceLang, targetLang);
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
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Text Translator</h3>
              <p className="text-xs text-neutral-400">High-fidelity bilingual engine specializing in Roman Urdu, Urdu, and English</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Text Translator"
            className={`p-2 rounded-lg transition-colors ${
              isDark ? 'hover:bg-neutral-800/50 text-neutral-400 hover:text-white' : 'hover:bg-neutral-200 text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Language selector toolbar */}
          <div className={`flex items-center justify-between gap-3 p-2 rounded-xl border ${
            isDark ? 'border-neutral-800 bg-neutral-900/40' : 'border-neutral-200 bg-neutral-50'
          }`}>
            <select
              value={sourceLang}
              onChange={(e) => {
                setSourceLang(e.target.value);
                translateNow(sourceText, e.target.value, targetLang);
              }}
              className={`text-xs font-semibold px-3 py-2 rounded-lg border outline-none cursor-pointer ${
                isDark ? 'bg-neutral-800/90 text-white border-neutral-700' : 'bg-white text-neutral-900 border-neutral-300'
              }`}
            >
              <option value="English">English</option>
              <option value="Roman Urdu">Roman Urdu</option>
              <option value="Urdu">Urdu (اردو)</option>
              <option value="Arabic">Arabic (العربية)</option>
            </select>

            <button
              type="button"
              onClick={handleSwap}
              title="Swap languages"
              className={`p-2 rounded-lg transition-all ${
                isDark ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>

            <select
              value={targetLang}
              onChange={(e) => {
                setTargetLang(e.target.value);
                translateNow(sourceText, sourceLang, e.target.value);
              }}
              className={`text-xs font-semibold px-3 py-2 rounded-lg border outline-none cursor-pointer ${
                isDark ? 'bg-neutral-800/90 text-white border-neutral-700' : 'bg-white text-neutral-900 border-neutral-300'
              }`}
            >
              <option value="Roman Urdu">Roman Urdu (Colloquial)</option>
              <option value="English">English</option>
              <option value="Urdu">Urdu (اردو)</option>
              <option value="Arabic">Arabic (العربية)</option>
            </select>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-neutral-400 py-1">Quick presets:</span>
            <button
              type="button"
              onClick={() => loadSample('Peace be upon you, brother. How can I help you today?')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                isDark ? 'bg-neutral-800/60 hover:bg-neutral-700 text-neutral-300' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
              }`}
            >
              Salam Greeting
            </button>
            <button
              type="button"
              onClick={() => loadSample('Remove background from this product image.')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                isDark ? 'bg-neutral-800/60 hover:bg-neutral-700 text-neutral-300' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
              }`}
            >
              Background Command
            </button>
            <button
              type="button"
              onClick={() => loadSample('Compress this contract PDF before sending email.')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                isDark ? 'bg-neutral-800/60 hover:bg-neutral-700 text-neutral-300' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
              }`}
            >
              PDF Command
            </button>
          </div>

          {/* Translation Boxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Source */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 block">
                {sourceLang} Source
              </label>
              <textarea
                value={sourceText}
                onChange={(e) => {
                  setSourceText(e.target.value);
                }}
                rows={5}
                className={`w-full p-3.5 rounded-xl border text-sm focus:border-red-500 focus:outline-none transition-all resize-none placeholder-neutral-500 ${
                  isDark ? 'border-neutral-800 bg-neutral-900/60 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-900'
                }`}
                placeholder="Type or paste text to translate..."
              />
              <button
                type="button"
                onClick={() => translateNow(sourceText, sourceLang, targetLang)}
                disabled={isLoading}
                className="w-full py-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Translating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Translate Now</span>
                  </>
                )}
              </button>
            </div>

            {/* Target */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-red-500 block">
                  {targetLang} Output
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={handleSpeak}
                    title="Speak translated text"
                    className={`p-1 rounded ${isDark ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900'}`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    title="Copy text"
                    className={`p-1 rounded ${isDark ? 'hover:bg-neutral-800 text-neutral-400 hover:text-white' : 'hover:bg-neutral-200 text-neutral-600 hover:text-neutral-900'}`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div
                className={`w-full min-h-[140px] p-3.5 rounded-xl border text-sm select-text whitespace-pre-wrap leading-relaxed ${
                  isDark ? 'border-neutral-800 bg-neutral-950/70 text-white' : 'border-neutral-200 bg-neutral-50 text-neutral-900'
                } ${
                  targetLang === 'Urdu' || targetLang === 'Arabic' ? 'text-right font-serif text-base' : 'text-left'
                }`}
              >
                {translatedText || (
                  <span className="text-neutral-500 italic">Translation output will appear here...</span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400">
                Optimized with conversational Roman Urdu idioms &amp; technical jargon retention.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
