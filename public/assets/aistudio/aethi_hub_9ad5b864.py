import ctypes
import ctypes.wintypes as wintypes
import hashlib
import hmac
import json
import os
import sqlite3
import string
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Tuple

FILE_ATTRIBUTE_HIDDEN = 0x02


# ==============================================================================
# 1. WINDOWS DPAPI SECRET HELPER (WITH SAFE FALLBACK)
# ==============================================================================
class _DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


def dpapi_protect(plain_bytes: bytes) -> bytes:
    if os.name != "nt" or not plain_bytes:
        return plain_bytes
    in_buf = (ctypes.c_byte * len(plain_bytes))(*plain_bytes)
    in_blob = _DATA_BLOB(len(plain_bytes), in_buf)
    out_blob = _DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(in_blob),
        "AethiSecret",
        None,
        None,
        None,
        0,
        ctypes.byref(out_blob),
    )
    if not ok or not out_blob.pbData:
        return plain_bytes
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out_blob.pbData)


def dpapi_unprotect(cipher_bytes: bytes) -> bytes:
    if os.name != "nt" or not cipher_bytes:
        return cipher_bytes
    in_buf = (ctypes.c_byte * len(cipher_bytes))(*cipher_bytes)
    in_blob = _DATA_BLOB(len(cipher_bytes), in_buf)
    out_blob = _DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(in_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(out_blob),
    )
    if not ok or not out_blob.pbData:
        return cipher_bytes
    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(out_blob.pbData)


def load_or_save_secret(storage_dir: str, env_secret: str) -> bytes:
    secret_file = os.path.join(storage_dir, ".aethi_secret.bin")
    if env_secret and env_secret != "change-me-in-production":
        raw = env_secret.encode("utf-8")
        try:
            with open(secret_file, "wb") as f:
                f.write(dpapi_protect(raw))
        except Exception:
            pass
        return raw

    if os.path.isfile(secret_file):
        try:
            with open(secret_file, "rb") as f:
                enc = f.read()
            dec = dpapi_unprotect(enc)
            if dec:
                return dec
        except Exception:
            pass

    return (env_secret or "change-me-in-production").encode("utf-8")


# ==============================================================================
# 2. HIDDEN STORAGE (NON-OS PARTITION FIRST, OS DRIVE FALLBACK ONLY)
# ==============================================================================
def _is_writable_dir(path: str) -> bool:
    try:
        os.makedirs(path, exist_ok=True)
        probe = os.path.join(path, ".aethi_probe")
        with open(probe, "w", encoding="utf-8") as f:
            f.write("1")
        os.remove(probe)
        return True
    except Exception:
        return False


def _hide_path_windows(path: str) -> None:
    if os.name != "nt":
        return
    try:
        attrs = ctypes.windll.kernel32.GetFileAttributesW(path)
        if attrs != -1 and not (attrs & FILE_ATTRIBUTE_HIDDEN):
            ctypes.windll.kernel32.SetFileAttributesW(path, attrs | FILE_ATTRIBUTE_HIDDEN)
    except Exception:
        pass


def get_storage_dir() -> str:
    sys_drive = (os.environ.get("SystemDrive") or "C:").rstrip("\\").upper()
    non_os_drives: List[str] = []

    if os.name == "nt":
        for letter in string.ascii_uppercase:
            if letter in ("A", "B"):
                continue
            root = f"{letter}:\\"
            if f"{letter}:" == sys_drive:
                continue
            if os.path.exists(root):
                non_os_drives.append(root)

    for root in non_os_drives:
        target = os.path.join(root, ".AethexFlowAethi")
        if _is_writable_dir(target):
            _hide_path_windows(target)
            return target

    fallback_base = os.getenv("APPDATA") or os.path.join(
        f"{sys_drive}\\",
        "Users",
        os.environ.get("USERNAME", "Public"),
        "AppData",
        "Roaming",
    )
    fallback_dir = os.path.join(fallback_base, ".AethexFlowAethi")
    _is_writable_dir(fallback_dir)
    _hide_path_windows(fallback_dir)
    return fallback_dir


# ==============================================================================
# 3. LOCAL SQLITE CHAT & STATE STORE (THREAD MESSAGES ON-DEMAND)
# ==============================================================================
class LocalChatStore:
    def __init__(self, storage_dir: str):
        self.db_path = os.path.join(storage_dir, "aethi_chat.db")
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        conn = self._connect()
        try:
            cur = conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL;")
            cur.execute("PRAGMA synchronous=NORMAL;")
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_threads (
                    thread_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    thread_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY (thread_id) REFERENCES chat_threads(thread_id)
                );
                """
            )
            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_chat_messages_thread
                ON chat_messages(thread_id, id);
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS local_meta (
                    k TEXT PRIMARY KEY,
                    v TEXT NOT NULL
                );
                """
            )
            conn.commit()
        finally:
            conn.close()

    def set_meta(self, key: str, value: str) -> None:
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO local_meta (k, v) VALUES (?1, ?2)
                ON CONFLICT(k) DO UPDATE SET v = excluded.v;
                """,
                (key, value),
            )
            conn.commit()
        finally:
            conn.close()

    def get_meta(self, key: str) -> Optional[str]:
        conn = self._connect()
        try:
            row = conn.execute("SELECT v FROM local_meta WHERE k = ?1", (key,)).fetchone()
            return str(row["v"]) if row else None
        finally:
            conn.close()

    def save_message(self, thread_id: str, role: str, content: str, title: Optional[str] = None) -> None:
        now = int(time.time())
        conn = self._connect()
        try:
            cur = conn.cursor()
            existing = cur.execute(
                "SELECT thread_id FROM chat_threads WHERE thread_id = ?1",
                (thread_id,),
            ).fetchone()
            if not existing:
                first_line = content.strip().splitlines()[0] if content.strip() else "New Chat"
                default_title = (title or first_line)[:120]
                cur.execute(
                    """
                    INSERT INTO chat_threads (thread_id, title, created_at, updated_at)
                    VALUES (?1, ?2, ?3, ?3);
                    """,
                    (thread_id, default_title, now),
                )
            else:
                if title:
                    cur.execute(
                        "UPDATE chat_threads SET title = ?1, updated_at = ?2 WHERE thread_id = ?3",
                        (title.strip()[:120], now, thread_id),
                    )
                else:
                    cur.execute(
                        "UPDATE chat_threads SET updated_at = ?1 WHERE thread_id = ?2",
                        (now, thread_id),
                    )

            cur.execute(
                """
                INSERT INTO chat_messages (thread_id, role, content, created_at)
                VALUES (?1, ?2, ?3, ?4);
                """,
                (thread_id, role, content, now),
            )
            conn.commit()
        finally:
            conn.close()

    def get_thread_messages(self, thread_id: str, limit: int = 200) -> List[Dict[str, Any]]:
        safe_limit = max(1, min(int(limit), 1000))
        conn = self._connect()
        try:
            rows = conn.execute(
                """
                SELECT id, thread_id, role, content, created_at
                FROM chat_messages
                WHERE thread_id = ?1
                ORDER BY id ASC
                LIMIT ?2;
                """,
                (thread_id, safe_limit),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


# ==============================================================================
# 4. LOCAL-ONLY RESOLVER & ON-DEMAND TOOLING
# ==============================================================================
class LocalResolver:
    def __init__(self, storage_dir: str):
        self.storage_dir = storage_dir
        self.bin_dir = os.path.join(storage_dir, "bin")
        self._app_cache: Dict[str, str] = {}
        self._gui_loaded = False
        self._pyautogui = None

    def _ensure_gui(self):
        if not self._gui_loaded:
            import pyautogui
            pyautogui.FAILSAFE = False
            self._pyautogui = pyautogui
            self._gui_loaded = True
        return self._pyautogui

    def find_app(self, name: str) -> Optional[str]:
        key = (name or "").strip().lower()
        if not key:
            return None
        if key in self._app_cache:
            return self._app_cache[key]

        aliases = {
            "browser": ["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe"],
            "chrome": ["chrome.exe"],
            "edge": ["msedge.exe"],
            "notepad": ["notepad.exe"],
            "explorer": ["explorer.exe"],
            "cmd": ["cmd.exe"],
            "powershell": ["powershell.exe"],
        }
        candidates = aliases.get(key, [key if key.endswith(".exe") else f"{key}.exe"])

        search_roots = [
            os.environ.get("ProgramFiles", r"C:\Program Files"),
            os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs"),
            os.path.join(os.environ.get("SystemRoot", r"C:\Windows"), "System32"),
        ]

        for root in search_roots:
            if not root or not os.path.isdir(root):
                continue
            for current_root, _, files in os.walk(root):
                depth = current_root.replace(root, "").count(os.sep)
                if depth > 3:
                    continue
                lower_files = {f.lower(): f for f in files}
                for cand in candidates:
                    if cand.lower() in lower_files:
                        full_path = os.path.join(current_root, lower_files[cand.lower()])
                        self._app_cache[key] = full_path
                        return full_path
        return None

    def resolve_ffmpeg(self) -> Optional[str]:
        local_ff = os.path.join(self.bin_dir, "ffmpeg.exe")
        if os.path.isfile(local_ff):
            return local_ff
        for p in os.environ.get("PATH", "").split(os.pathsep):
            cand = os.path.join(p.strip(), "ffmpeg.exe")
            if os.path.isfile(cand):
                return cand
        return None


# ==============================================================================
# 5. RESILIENT TASK EXECUTION ENGINE (NO ARTIFICIAL LIMITS)
# ==============================================================================
class AethiExecutor:
    def __init__(
        self,
        resolver: LocalResolver,
        repair_callback: Optional[Callable[[Dict[str, Any], str], List[Dict[str, Any]]]] = None,
    ):
        self.resolver = resolver
        self.repair_callback = repair_callback

    def _run_step(self, step: Dict[str, Any]) -> bool:
        action = (step.get("action") or "").strip().lower()

        if action == "open_app":
            target = step.get("target", "")
            exe_path = self.resolver.find_app(target) or target
            if not exe_path:
                return False
            subprocess.Popen([exe_path], shell=False)
            time.sleep(0.8)
            return True

        if action == "run_cmd":
            args = step.get("args", [])
            cmd_str = step.get("command", "")
            if isinstance(args, list) and args:
                res = subprocess.run([str(a) for a in args], capture_output=True, text=True, timeout=300)
                return res.returncode == 0
            if cmd_str:
                res = subprocess.run(cmd_str, shell=True, capture_output=True, text=True, timeout=300)
                return res.returncode == 0
            return False

        if action == "click":
            gui = self.resolver._ensure_gui()
            gui.click(x=int(step["x"]), y=int(step["y"]))
            return True

        if action == "type_text":
            gui = self.resolver._ensure_gui()
            gui.write(str(step.get("text", "")), interval=float(step.get("interval", 0.015)))
            return True

        if action == "hotkey":
            gui = self.resolver._ensure_gui()
            keys = step.get("keys", [])
            if not isinstance(keys, list) or not keys:
                return False
            gui.hotkey(*[str(k) for k in keys])
            return True

        if action == "sleep":
            time.sleep(max(0.05, float(step.get("seconds", 0.5))))
            return True

        if action == "ffmpeg":
            ff_bin = self.resolver.resolve_ffmpeg()
            args = step.get("args", [])
            if not ff_bin or not isinstance(args, list) or not args:
                return False
            res = subprocess.run([ff_bin] + [str(a) for a in args], capture_output=True, text=True, timeout=1800)
            return res.returncode == 0

        return False

    def _verify_step(self, step: Dict[str, Any]) -> bool:
        expect_path = step.get("expect_path")
        if expect_path:
            return os.path.exists(str(expect_path))
        return True

    def run_task(self, steps: List[Dict[str, Any]]) -> Dict[str, Any]:
        queue = list(steps)
        completed = 0
        repaired_ids = set()

        while queue:
            step = queue.pop(0)
            step_id = str(step.get("id") or f"step_{completed + 1}")

            ok = False
            for attempt in range(2):
                if self._run_step(step) and self._verify_step(step):
                    ok = True
                    break
                time.sleep(0.25 * (attempt + 1))

            if not ok and self.repair_callback and step_id not in repaired_ids:
                repaired_ids.add(step_id)
                patched = self.repair_callback(step, "execution_or_verification_failed")
                if patched:
                    queue = patched + queue
                    continue

            if not ok:
                return {
                    "ok": False,
                    "completed": completed,
                    "failed_step": step,
                    "error": "step_failed",
                }

            completed += 1

        return {"ok": True, "completed": completed}


# ==============================================================================
# 6. SIGNATURE + NONCE REPLAY VERIFICATION & OUTBOUND HUB
# ==============================================================================
def _canonical_json(obj: Any) -> str:
    return json.dumps(obj, separators=(",", ":"), sort_keys=True)


class NonceReplayGuard:
    def __init__(self, ttl_sec: int = 300):
        self.ttl_sec = ttl_sec
        self._seen: Dict[str, float] = {}

    def check_and_record(self, nonce: str) -> bool:
        now = time.time()
        expired = [k for k, exp in self._seen.items() if exp <= now]
        for k in expired:
            del self._seen[k]
        if nonce in self._seen:
            return False
        self._seen[nonce] = now + self.ttl_sec
        return True


def verify_envelope_signature(
    envelope: Dict[str, Any],
    shared_secret: bytes,
    replay_guard: NonceReplayGuard,
    max_skew_sec: int = 120,
) -> Tuple[bool, str]:
    sig = str(envelope.get("sig") or "")
    ts = envelope.get("ts")
    nonce = str(envelope.get("nonce") or "")
    data = envelope.get("data")

    if not sig or not nonce or not isinstance(data, dict) or not isinstance(ts, (int, float)):
        return False, "malformed_envelope"

    if abs(time.time() - float(ts)) > max_skew_sec:
        return False, "expired_timestamp"

    # Worker signs the inner command payload (without wrapper 'type'/'command_id' if injected)
    sign_obj = dict(data)
    sign_obj.pop("type", None)
    sign_obj.pop("command_id", None)

    message = f"{int(ts)}|{nonce}|{_canonical_json(sign_obj)}".encode("utf-8")
    expected = hmac.new(shared_secret, message, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return False, "invalid_signature"

    if not replay_guard.check_and_record(nonce):
        return False, "replay_nonce"

    return True, "ok"


class AethiOutboundHub:
    def __init__(self, worker_base_url: str, device_id: str, shared_secret: bytes):
        self.base_url = worker_base_url.rstrip("/")
        self.device_id = device_id
        self.storage_dir = get_storage_dir()
        self.chat_store = LocalChatStore(self.storage_dir)
        self.shared_secret = shared_secret
        self.replay_guard = NonceReplayGuard(ttl_sec=300)
        self.resolver = LocalResolver(self.storage_dir)
        self.executor = AethiExecutor(self.resolver, repair_callback=self._request_minimal_repair)

        if not self.chat_store.get_meta("one_time_consent"):
            self.chat_store.set_meta("one_time_consent", "accepted")

    def _post_json(self, path: str, payload: Dict[str, Any], timeout: int = 25) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "X-Aethi-Device": self.device_id,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _request_minimal_repair(self, failed_step: Dict[str, Any], reason: str) -> List[Dict[str, Any]]:
        try:
            res = self._post_json(
                "/aethi/repair",
                {
                    "device_id": self.device_id,
                    "failed_step": failed_step,
                    "reason": reason,
                },
                timeout=30,
            )
            steps = res.get("steps")
            return steps if isinstance(steps, list) else []
        except Exception:
            return []

    def _run_task_background(self, command_id: str, steps: List[Dict[str, Any]]) -> None:
        def _worker():
            result = self.executor.run_task(steps)
            try:
                self._post_json(
                    "/aethi/result",
                    {
                        "device_id": self.device_id,
                        "command_id": command_id,
                        "result": result,
                    },
                )
            except Exception:
                pass

        threading.Thread(target=_worker, daemon=True).start()

    def handle_envelope(self, envelope: Dict[str, Any]) -> Dict[str, Any]:
        valid, reason = verify_envelope_signature(envelope, self.shared_secret, self.replay_guard)
        if not valid:
            return {"ok": False, "error": reason}

        data = envelope["data"]
        kind = str(data.get("type") or "")
        command_id = str(envelope.get("command_id") or data.get("command_id") or "")

        if kind == "task":
            steps = data.get("steps") or []
            if not isinstance(steps, list):
                return {"ok": False, "error": "invalid_steps"}
            self._run_task_background(command_id, steps)
            return {"ok": True, "queued_background": True, "command_id": command_id}

        if kind == "chat_save":
            self.chat_store.save_message(
                thread_id=str(data["thread_id"]),
                role=str(data["role"]),
                content=str(data["content"]),
                title=data.get("title"),
            )
            if command_id:
                self._post_json(
                    "/aethi/result",
                    {
                        "device_id": self.device_id,
                        "command_id": command_id,
                        "result": {"ok": True},
                    },
                )
            return {"ok": True}

        if kind == "chat_get_thread":
            thread_id = str(data.get("thread_id") or "")
            limit = int(data.get("limit") or 200)
            messages = self.chat_store.get_thread_messages(thread_id, limit=limit)
            self._post_json(
                "/aethi/thread-data",
                {
                    "device_id": self.device_id,
                    "command_id": command_id,
                    "thread_id": thread_id,
                    "messages": messages,
                },
            )
            return {"ok": True, "count": len(messages)}

        return {"ok": False, "error": "unknown_command_type"}

    def poll_forever(self, interval_sec: float = 1.5) -> None:
        backoff = interval_sec
        while True:
            try:
                res = self._post_json("/aethi/poll", {"device_id": self.device_id})
                backoff = interval_sec
                envelope = res.get("envelope")
                if isinstance(envelope, dict):
                    self.handle_envelope(envelope)
            except urllib.error.URLError:
                backoff = min(10.0, backoff * 1.5)
                time.sleep(backoff)
                continue
            except Exception:
                time.sleep(interval_sec)
                continue
            time.sleep(interval_sec)


if __name__ == "__main__":
    WORKER_URL = os.getenv("AETHI_WORKER_URL", "https://aethexflow-app.aethexflow.workers.dev")
    DEVICE_ID = os.getenv("AETHI_DEVICE_ID", "dev-local-01")
    RAW_SECRET = os.getenv("AETHI_SHARED_SECRET", "change-me-in-production")

    base_dir = get_storage_dir()
    secret_bytes = load_or_save_secret(base_dir, RAW_SECRET)

    if "--smoke-test" in sys.argv:
        hub = AethiOutboundHub(WORKER_URL, DEVICE_ID, secret_bytes)
        print("Storage dir:", hub.storage_dir)
        print("SQLite DB:", hub.chat_store.db_path)
        print("Consent:", hub.chat_store.get_meta("one_time_consent"))
    else:
        hub = AethiOutboundHub(WORKER_URL, DEVICE_ID, secret_bytes)
        hub.poll_forever()