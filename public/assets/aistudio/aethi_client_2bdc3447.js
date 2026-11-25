export class AethexFlowClient {
  constructor(workerBaseUrl, deviceId, adminApiKey = "") {
    this.baseUrl = workerBaseUrl.replace(/\/+$/, "");
    this.deviceId = deviceId;
    this.adminApiKey = adminApiKey;
  }

  _headers(extra = {}) {
    const h = { "Content-Type": "application/json", ...extra };
    if (this.adminApiKey) h["X-Admin-Key"] = this.adminApiKey;
    return h;
  }

  // 1. Load ONLY chat titles from D1 on page load
  async getChatTitles(limit = 50) {
    const res = await fetch(
      `${this.baseUrl}/api/chat/titles?device_id=${encodeURIComponent(this.deviceId)}&limit=${limit}`
    );
    return res.json();
  }

  // 2. Save/update ONLY chat title in D1
  async saveChatTitle(threadId, title) {
    const res = await fetch(`${this.baseUrl}/api/chat/title`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        device_id: this.deviceId,
        thread_id: threadId,
        title,
      }),
    });
    return res.json();
  }

  // 3. Dispatch a signed command (task or chat_save) into D1 queue
  async dispatchCommand(kind, data) {
    const res = await fetch(`${this.baseUrl}/api/command/dispatch`, {
      method: "POST",
      headers: this._headers(),
      body: JSON.stringify({
        device_id: this.deviceId,
        kind,
        data,
      }),
    });
    return res.json();
  }

  // 4. Poll command status until completed/failed
  async waitForCommand(commandId, pollMs = 700, maxWaitMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const res = await fetch(
        `${this.baseUrl}/api/command/status?command_id=${encodeURIComponent(commandId)}`
      );
      const json = await res.json();
      if (json.ok && (json.status === "completed" || json.status === "failed")) {
        return json;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return { ok: false, error: "timeout" };
  }

  // 5. On-demand: fetch full chat messages ONLY when user opens a thread
  async openChatThread(threadId, limit = 200) {
    const dispatched = await this.dispatchCommand("chat_get_thread", {
      thread_id: threadId,
      limit,
    });
    if (!dispatched.ok || !dispatched.command_id) {
      return { ok: false, error: dispatched.error || "dispatch_failed" };
    }
    const statusRes = await this.waitForCommand(dispatched.command_id, 500, 30000);
    if (!statusRes.ok || !statusRes.result) {
      return { ok: false, error: statusRes.error || "thread_fetch_failed" };
    }
    return {
      ok: true,
      thread_id: threadId,
      messages: statusRes.result.messages || [],
    };
  }
}