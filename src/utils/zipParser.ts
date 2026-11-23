import JSZip from 'jszip';

export interface ExtractedZipFile {
  filename: string;
  size: number;
  content: string;
  isText: boolean;
}

export interface ZipAnalysisResult {
  fileCount: number;
  totalSize: number;
  files: ExtractedZipFile[];
  summaryText: string;
}

const TEXT_FILE_EXTENSIONS = ['.txt', '.md', '.json', '.csv', '.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.py', '.xml', '.yml', '.yaml', '.sh', '.env', '.log', '.sql'];

export async function parseZipBuffer(arrayBuffer: ArrayBuffer): Promise<ZipAnalysisResult> {
  const zip = new JSZip();
  const loaded = await zip.loadAsync(arrayBuffer);
  
  const files: ExtractedZipFile[] = [];
  let totalSize = 0;
  let fileCount = 0;

  const entries = Object.keys(loaded.files);
  for (const filename of entries) {
    const entry = loaded.files[filename];
    if (entry.dir) continue;
    
    fileCount++;
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    const isText = TEXT_FILE_EXTENSIONS.includes(ext) || !ext || filename.endsWith('README') || filename.endsWith('LICENSE');

    let content = '';
    try {
      if (isText) {
        content = await entry.async('text');
        // Cap large text files at 50KB for safe display
        if (content.length > 50000) {
          content = content.slice(0, 50000) + '\n\n[Content truncated due to size limit...]';
        }
      } else {
        const uint8 = await entry.async('uint8array');
        totalSize += uint8.length;
        content = `[Binary file: ${uint8.length} bytes]`;
        files.push({
          filename,
          size: uint8.length,
          content,
          isText: false,
        });
        continue;
      }
    } catch {
      content = '[Error reading file content]';
    }

    const size = content.length;
    totalSize += size;
    files.push({
      filename,
      size,
      content,
      isText: true,
    });
  }

  const summaryLines = files.map(f => `- ${f.filename} (${f.size} bytes${f.isText ? ', text' : ', binary'})`);
  const summaryText = `[ZIP Archive Analysis]\nTotal Files: ${fileCount}\nTotal Extracted Size: ${totalSize} bytes\nFiles:\n${summaryLines.join('\n')}`;

  return {
    fileCount,
    totalSize,
    files,
    summaryText,
  };
}
