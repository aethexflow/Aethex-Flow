import type { ChatAttachment } from '../types/chat';
import { parseZipBuffer } from './zipParser';

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

export interface FileProcessResult {
  items: ChatAttachment[];
  errors: string[];
  logs: string[];
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function transcribeAudioViaApi(
  dataBase64: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  try {
    const res = await fetch('/api/stt/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataBase64, mimeType, fileName }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.text) return String(json.text);
    }
  } catch {
    // Fallback cleanly without blocking upload
  }
  return `[Audio file attached: ${fileName}]`;
}

export async function processLocalFiles(
  fileList: FileList | File[] | null,
  existingCount = 0
): Promise<FileProcessResult> {
  const items: ChatAttachment[] = [];
  const errors: string[] = [];
  const logs: string[] = [];

  if (!fileList || fileList.length === 0) {
    return { items, errors, logs };
  }

  const remainingSlots = Math.max(0, MAX_ATTACHMENTS - existingCount);
  if (remainingSlots === 0) {
    return {
      items,
      errors: [`Maximum ${MAX_ATTACHMENTS} file attachments per message.`],
      logs,
    };
  }

  const selected = Array.from(fileList).slice(0, remainingSlots);
  for (const file of selected) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(`"${file.name}" exceeds the 6 MB per-file attachment limit.`);
      continue;
    }

    const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const mimeType = file.type || 'application/octet-stream';
    const lowerName = file.name.toLowerCase();

    // 1. ZIP Archives via JSZip parser
    if (lowerName.endsWith('.zip') || mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed') {
      try {
        const buffer = await file.arrayBuffer();
        const zipRes = await parseZipBuffer(buffer);
        const extractedSnippets = zipRes.files
          .filter((f) => f.isText)
          .slice(0, 12)
          .map((f) => `--- ${f.filename} (${f.size} bytes) ---\n${f.content.slice(0, 3500)}`)
          .join('\n\n');

        const textContent = `${zipRes.summaryText}\n\n${extractedSnippets}`.slice(0, 24000);
        items.push({
          id,
          name: file.name,
          mimeType: 'application/zip',
          sizeBytes: file.size,
          textContent,
          kind: 'zip',
        });
        logs.push(`Extracted ZIP "${file.name}" (${zipRes.fileCount} files).`);
      } catch (err: any) {
        errors.push(`Could not extract "${file.name}": ${err?.message || 'invalid ZIP archive'}`);
      }
      continue;
    }

    // 2. Audio attachments (STT transcription + binary attachment)
    if (mimeType.startsWith('audio/') || /\.(mp3|wav|webm|ogg|m4a)$/i.test(lowerName)) {
      try {
        const dataUrl = await readAsDataUrl(file);
        const commaIdx = dataUrl.indexOf(',');
        const dataBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : '';
        const transcript = await transcribeAudioViaApi(dataBase64, mimeType, file.name);
        items.push({
          id,
          name: file.name,
          mimeType,
          sizeBytes: file.size,
          dataBase64,
          textContent: `[Audio Transcript for ${file.name}]: ${transcript}`,
          kind: 'audio',
        });
        logs.push(`Transcribed audio "${file.name}" via Aethi Speech.`);
      } catch {
        errors.push(`Failed to read audio file "${file.name}".`);
      }
      continue;
    }

    // 3. Text, Code, CSV, JSON, Config
    const isTextLike =
      mimeType.startsWith('text/') ||
      /\.(txt|md|json|csv|tsv|ts|tsx|js|jsx|py|html|css|yml|yaml|xml|log|sql)$/i.test(lowerName);

    if (isTextLike) {
      const textContent = (await file.text()).slice(0, 24000);
      items.push({
        id,
        name: file.name,
        mimeType,
        sizeBytes: file.size,
        textContent,
        kind: 'text',
      });
      logs.push(`Loaded text/code file "${file.name}".`);
      continue;
    }

    // 4. Images, PDFs, or generic binary
    try {
      const dataUrl = await readAsDataUrl(file);
      const commaIdx = dataUrl.indexOf(',');
      const dataBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : '';
      const isImage = mimeType.startsWith('image/');
      const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
      items.push({
        id,
        name: file.name,
        mimeType,
        sizeBytes: file.size,
        dataBase64,
        previewUrl: isImage ? dataUrl : undefined,
        kind: isImage ? 'image' : isPdf ? 'pdf' : 'binary',
      });
      logs.push(`Attached ${isImage ? 'image' : isPdf ? 'PDF' : 'binary'} "${file.name}".`);
    } catch {
      errors.push(`Failed to read file "${file.name}".`);
    }
  }

  return { items, errors, logs };
}
