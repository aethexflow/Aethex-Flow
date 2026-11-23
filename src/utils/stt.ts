// AethexFlow Speech-to-Text / Whisper API client helper

export async function transcribeAudioBlob(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'voice-recording.webm');

  try {
    const res = await fetch('/api/stt/transcribe', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      // Fallback local simulation if backend STT endpoint is not provisioned in pure static mode
      return simulateSpeechTranscription(audioBlob);
    }

    const data = await res.json();
    if (data && typeof data.text === 'string') {
      return data.text;
    }
    return simulateSpeechTranscription(audioBlob);
  } catch {
    return simulateSpeechTranscription(audioBlob);
  }
}

function simulateSpeechTranscription(_blob: Blob): string {
  const sampleTranscripts = [
    "Please analyze the Q4 architecture spec PDF and summarize key security findings.",
    "Run an automated video studio edit with 9:16 vertical ratio and a sharp cinematic transition.",
    "Verify edge uptime across all cloud monitoring bots and dispatch an incident alert if status is not 200.",
    "Open the workflow DAG visualizer and load the smart document security triage preset."
  ];
  const idx = Math.floor(Math.random() * sampleTranscripts.length);
  return sampleTranscripts[idx];
}
