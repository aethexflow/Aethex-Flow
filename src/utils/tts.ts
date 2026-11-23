// AethexFlow TTS Utility (Piper priority with natural browser fallback)

export function cleanTextForSpeech(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/```[\s\S]*?```/g, ' [Code block omitted for speech] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_~`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speakWithAethiTTS(text: string, onStart?: () => void, onEnd?: () => void): void {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported in this environment.');
    onEnd?.();
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel(); // Stop any ongoing speech

  const utterance = new SpeechSynthesisUtterance(cleaned);
  utterance.rate = 1.02;
  utterance.pitch = 1.0;

  // Attempt to pick a natural / high quality voice (Google, Microsoft natural, English natural, avoiding David/Zira/eSpeak)
  const voices = synth.getVoices();
  const preferredVoice = voices.find((v) => {
    const name = v.name.toLowerCase();
    return (
      (name.includes('google') || name.includes('natural') || name.includes('enhanced') || name.includes('siri') || name.includes('aaliyah') || name.includes('olivia') || name.includes('serena')) &&
      !name.includes('david') &&
      !name.includes('zira') &&
      !name.includes('espeak')
    );
  }) || voices.find((v) => v.lang.startsWith('en') && !v.name.toLowerCase().includes('david') && !v.name.toLowerCase().includes('zira')) || voices[0];

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.onstart = () => {
    onStart?.();
  };

  utterance.onend = () => {
    onEnd?.();
  };

  utterance.onerror = () => {
    onEnd?.();
  };

  synth.speak(utterance);
}

export function stopAethiTTS(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
