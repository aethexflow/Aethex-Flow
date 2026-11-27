/** AethexFlow | Aethi public chat — Cloudflare Pages exact route /api/chat.
 * Add at functions/api/chat.ts. Other /api routes remain in [[path]].ts.
 */
type Message = { role: 'user' | 'assistant' | 'system'; content: string };
type Statement = { bind(...values: unknown[]): Statement; run(): Promise<unknown> };
type DB = { prepare(sql: string): Statement; exec(sql: string): Promise<unknown>; batch?(statements: Statement[]): Promise<unknown> };
type Env = {
  AI?: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  AI_WORKER?: { fetch(request: Request): Promise<Response> };
  AI_WORKER_CHAT_PATH?: string;
  AI_MODEL?: string;
  AI_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  DB?: DB;
};
const DEFAULT_MODEL = '@cf/meta/llama-3.2-3b-instruct';
const SYSTEM = 'You are Aethi, the AethexFlow assistant. Answer accurately in the user’s preferred language, including Urdu, Roman Urdu and English. Use the conversation context. Help with practical tasks, workflows and code. Do not claim you executed an action unless it actually happened. Be honest about missing information.';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
});
const fail = (error: string, status: number) => json({ error, liveAiConnected: false, engine: 'aethi-edge' }, status);
function responseText(data: any): string {
  const value = data?.text ?? data?.response ?? data?.reply ?? data?.result?.response ?? data?.choices?.[0]?.message?.content;
  return typeof value === 'string' ? value.trim() : '';
}
function cleanId(raw: unknown, fallback: string): string {
  return typeof raw === 'string' ? raw.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || fallback : fallback;
}
async function saveChat(db: DB, deviceId: string, threadId: string, title: string, message: string, reply: string, tool: string | undefined) {
  await db.exec(`CREATE TABLE IF NOT EXISTS chat_threads (thread_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, aethi_synced INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS chat_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, device_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, engine TEXT, suggested_tool TEXT, created_at INTEGER NOT NULL);`);
  const now = Date.now();
  const upsert = db.prepare(`INSERT INTO chat_threads (thread_id, device_id, title, created_at, updated_at, aethi_synced) VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(thread_id) DO UPDATE SET updated_at = excluded.updated_at WHERE chat_threads.device_id = excluded.device_id`).bind(threadId, deviceId, title, now, now);
  const insert = (role: string, content: string, engine: string, suggested: string | null, timestamp: number) => db.prepare(`INSERT INTO chat_messages (id, thread_id, device_id, role, content, engine, suggested_tool, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM chat_threads WHERE thread_id = ? AND device_id = ?)`).bind(crypto.randomUUID(), threadId, deviceId, role, content, engine, suggested, timestamp, threadId, deviceId);
  const statements = [upsert, insert('user', message, 'user', null, now), insert('assistant', reply, 'aethexflow-engine', tool || null, now + 1)];
  if (db.batch) {
    const results: any = await db.batch(statements);
    return Array.isArray(results) && results.slice(1).every((r: any) => (r?.meta?.changes ?? 0) > 0);
  }
  await upsert.run();
  const a: any = await statements[1].run();
  const b: any = await statements[2].run();
  return (a?.meta?.changes ?? 0) > 0 && (b?.meta?.changes ?? 0) > 0;
}
export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers: { Allow: 'POST', 'Content-Type': 'application/json' } });
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return fail('Cross-origin chat request rejected.', 403);
  let body: any;
  try { body = await request.json(); } catch { return fail('Invalid JSON request.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Invalid chat request.', 400);
  const attachments = (Array.isArray(body.attachments) ? body.attachments : []).filter((a: any) => a && typeof a === 'object').map((a: any) => ({
    name: typeof a.name === 'string' ? a.name : 'attachment',
    mimeType: typeof a.mimeType === 'string' ? a.mimeType : 'application/octet-stream',
    sizeBytes: Number(a.sizeBytes) || 0,
    textContent: typeof a.textContent === 'string' ? a.textContent : undefined,
    dataBase64: typeof a.dataBase64 === 'string' ? a.dataBase64 : undefined,
  }));
  const message = (typeof body.message === 'string' ? body.message.trim() : '') || (attachments.length ? 'Analyze the attached files.' : '');
  if (!message) return fail('Message or attachment is required.', 400);
  const history: Message[] = (Array.isArray(body.history) ? body.history : []).filter((h: any) => h && ['user', 'assistant'].includes(h.role) && typeof h.content === 'string').map((h: any) => ({ role: h.role, content: h.content }));
  const siteContext = body.siteContext && typeof body.siteContext === 'object' ? body.siteContext : {};
  const contextText = JSON.stringify({ activeTab: siteContext.activeTab || 'chat', availableTools: Array.isArray(siteContext.availableTools) ? siteContext.availableTools : [], theme: siteContext.theme });
  const userText = [message, ...attachments.filter((a: any) => a.textContent).map((a: any) => `\n[File: ${a.name}]\n${a.textContent}`)].join('\n');
  const binary = attachments.filter((a: any) => !a.textContent && a.dataBase64);
  if (attachments.some((a: any) => !a.textContent && !a.dataBase64)) return fail('An attachment has no readable content. Please attach it again.', 422);
  const system = SYSTEM + '\nCurrent workspace context (informational only): ' + contextText;
  const messages: Message[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: userText }];
  const model = env.AI_MODEL?.trim() || DEFAULT_MODEL;
  // Use one provider per request. No paid retry/fallback chain. The configured
  // AI Worker controls its own model; the direct AI binding uses AI_MODEL.
  let reply = '';
  try {
    const provider = env.AI_PROVIDER?.trim().toLowerCase();
    if (provider && !['cloudflare', 'auto', 'gemini'].includes(provider)) return fail('Configured chat provider is not supported by this route. Connect it through the AI Worker or select cloudflare/gemini.', 503);
    if (provider !== 'gemini' && env.AI_WORKER) {
      const route = env.AI_WORKER_CHAT_PATH?.trim() || '/api/chat';
      if (!route.startsWith('/') || route.startsWith('//')) return fail('Invalid AI Worker route configuration.', 503);
      const upstream = await env.AI_WORKER.fetch(new Request('https://aethi.internal' + route, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ message, history, attachments, siteContext, providerProfile: body.providerProfile || 'auto', messages, stream: false }),
      }));
      if (!upstream.ok) return fail(`AI Worker returned HTTP ${upstream.status}. Check its route and model configuration.`, 502);
      const data: any = await upstream.json();
      if (data?.ok === false || data?.liveAiConnected === false || data?.error) return fail('AI Worker reports no live AI connection.', 503);
      reply = responseText(data);
    } else if (provider !== 'gemini' && env.AI) {
      if (binary.length) return fail('The configured text model cannot read binary attachments. Use extracted text or connect a multimodal AI Worker.', 422);
      reply = responseText(await env.AI.run(model, { messages }));
    } else if (provider !== 'cloudflare' && env.GEMINI_API_KEY && env.GEMINI_MODEL) {
      const parts: Record<string, unknown>[] = [{ text: userText }];
      for (const a of binary) parts.push({ inlineData: { mimeType: a.mimeType, data: a.dataBase64 } });
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(env.GEMINI_MODEL) + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [...history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })), { role: 'user', parts }] }),
      });
      if (!res.ok) return fail(`AI provider returned HTTP ${res.status}.`, 502);
      const data: any = await res.json();
      reply = (data?.candidates?.[0]?.content?.parts || []).filter((p: any) => !p.thought && typeof p.text === 'string').map((p: any) => p.text).join('').trim();
    } else return fail('Aethi AI is not configured. Bind AI_WORKER or AI, or explicitly configure GEMINI_API_KEY and GEMINI_MODEL.', 503);
  } catch (error) {
    console.error('Aethi chat provider failure', error instanceof Error ? error.name : 'UnknownError');
    return fail('Aethi AI connection failed or returned invalid data.', 502);
  }
  if (!reply) return fail('The AI returned an empty response.', 502);
  const lower = message.toLowerCase();
  const isVideo = /\b(video|shorts?|reel|timeline|caption|srt|clip|trim|webm)\b|16:9|9:16|1:1/.test(lower);
  const suggestedTool = isVideo ? 'video-studio' : /\b(workflow|dag|conditional|branch)\b/.test(lower) ? 'workflow-dag' : /\b(pdf|compress)\b/.test(lower) ? 'pdf-compressor' : /\b(encrypt|decrypt|aes|hash)\b/.test(lower) ? 'crypto-vault' : /\b(json|csv)\b/.test(lower) ? 'data-formatter' : /\b(bot|monitor|webhook|digest)\b/.test(lower) ? 'bot-rental' : /\b(translate|urdu)\b/.test(lower) ? 'text-translator' : undefined;
  const executedActions: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const theme = lower.match(/^(?:switch|change|set|turn)(?:\s+the)?(?:\s+theme)?(?:\s+to)?\s+(light|dark)(?:\s+mode)?[.!]?$/);
  if (theme) executedActions.push({ type: 'toggle_theme', payload: { theme: theme[1] } });
  if (suggestedTool && /^(open|launch|go to)\s+/.test(lower)) executedActions.push({ type: 'open_tool', payload: { toolId: suggestedTool } });
  const threadId = cleanId(body.threadId, 'thread_' + crypto.randomUUID());
  const deviceId = cleanId(body.deviceId, '');
  const title = message.replace(/\s+/g, ' ').trim().slice(0, 64) || 'New Chat';
  let d1Persisted = false;
  if (env.DB && deviceId) {
    try { d1Persisted = await saveChat(env.DB, deviceId, threadId, title, message, reply, suggestedTool); }
    catch { console.error('Aethi chat storage failed'); }
  }
  return json({ text: reply, engine: 'aethexflow-engine', liveAiConnected: true, threadId, threadTitle: title, d1RetentionHours: 12, d1Persisted, aethiQueued: false, executedActions, toolResults: [], suggestedTool, videoInstruction: isVideo ? message : undefined });
}
