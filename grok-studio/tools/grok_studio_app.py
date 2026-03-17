#!/usr/bin/env python3
"""
Grok Studio Desktop — PySide6 app.
Đăng nhập Grok Studio, nhập danh sách account Grok, grab cookie, tự upload.

pip install PySide6 websockets
"""

import asyncio
import json
import os
import platform
import subprocess
import sys
import time
import uuid
import urllib.request
import urllib.error
import signal
from pathlib import Path
from threading import Thread

from PySide6.QtCore import Qt, Signal, QObject, QThread, QTimer
from PySide6.QtGui import QFont, QColor, QPalette, QIcon
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QTextEdit, QStackedWidget,
    QFrame, QScrollArea, QProgressBar, QMessageBox, QFileDialog,
    QSpinBox, QCheckBox, QTableWidget, QTableWidgetItem, QHeaderView,
    QAbstractItemView, QComboBox
)

API_BASE = "https://grok.liveyt.pro"
APP_VERSION = "1.2.0"
GITHUB_REPO = "huypv2002/grok2api"
RELEASE_TAG_PREFIX = "grabber-v"

# Resolve paths relative to the exe/script location, not CWD
if getattr(sys, 'frozen', False):
    _APP_DIR = Path(sys.executable).parent
else:
    _APP_DIR = Path(__file__).parent

PROFILES_DIR = _APP_DIR / "data" / "profiles"
CREDENTIALS_FILE = _APP_DIR / "data" / "credentials.json"
ACCOUNTS_FILE = _APP_DIR / "data" / "accounts.json"
LOGIN_URL = "https://accounts.x.ai/sign-in?redirect=grok-com&email=true"
GROK_URL = "https://grok.com"
CDP_PORT_BASE = 9250
BATCH_SIZE = 3

# ─── Styles ───
DARK_STYLE = """
QMainWindow, QWidget { background-color: #0a0a0f; color: #e2e8f0; }
QLabel { color: #e2e8f0; }
QLineEdit, QTextEdit, QSpinBox, QComboBox {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px; padding: 10px 14px; color: #e2e8f0; font-size: 13px;
}
QLineEdit:focus, QTextEdit:focus { border-color: rgba(99,102,241,0.5); }
QPushButton {
    background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #6366f1, stop:1 #8b5cf6);
    color: white; border: none; border-radius: 10px; padding: 10px 20px;
    font-size: 13px; font-weight: 600;
}
QPushButton:hover { background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #7c7ff7, stop:1 #a78bfa); }
QPushButton:disabled { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.3); }
QPushButton#secondary {
    background: rgba(255,255,255,0.06); color: #94a3b8; border: 1px solid rgba(255,255,255,0.08);
}
QPushButton#secondary:hover { background: rgba(255,255,255,0.1); }
QPushButton#danger { background: rgba(248,113,113,0.15); color: #f87171; }
QPushButton#danger:hover { background: rgba(248,113,113,0.25); }
QPushButton#success { background: rgba(74,222,128,0.15); color: #4ade80; }
QPushButton#success:hover { background: rgba(74,222,128,0.25); }
QProgressBar {
    background: rgba(255,255,255,0.06); border: none; border-radius: 6px; height: 8px;
}
QProgressBar::chunk {
    background: qlineargradient(x1:0,y1:0,x2:1,y2:0, stop:0 #6366f1, stop:1 #8b5cf6);
    border-radius: 6px;
}
QScrollArea { border: none; background: transparent; }
QFrame#card {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 14px; padding: 16px;
}
QFrame#statusOk { background: rgba(74,222,128,0.1); border: 1px solid rgba(74,222,128,0.2); border-radius: 8px; padding: 8px 12px; }
QFrame#statusErr { background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 8px 12px; }
QFrame#statusWarn { background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); border-radius: 8px; padding: 8px 12px; }
QCheckBox { color: #e2e8f0; spacing: 6px; }
QCheckBox::indicator { width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.04); }
QCheckBox::indicator:checked { background: #6366f1; border-color: #6366f1; }
QTableWidget {
    background: transparent; border: none; gridline-color: rgba(255,255,255,0.06);
    font-size: 12px; color: #e2e8f0;
}
QTableWidget::item { padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.04); }
QTableWidget::item:selected { background: rgba(99,102,241,0.15); }
QHeaderView::section {
    background: rgba(255,255,255,0.04); color: #94a3b8; border: none;
    padding: 8px; font-size: 11px; font-weight: 600;
}
"""


# ─── API Client ───
class StudioAPI:
    def __init__(self, base=API_BASE):
        self.base = base.rstrip("/")
        self.token = None
        self._headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": base, "Referer": base + "/",
        }
        self._use_curl = False
        try:
            from curl_cffi import requests as curl_requests
            self._curl = curl_requests
            self._use_curl = True
        except ImportError:
            self._curl = None

    def _post(self, path: str, data: dict, auth: bool = False) -> dict:
        url = f"{self.base}{path}"
        headers = {**self._headers, "Content-Type": "application/json"}
        if auth and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self._use_curl:
            resp = self._curl.post(url, json=data, headers=headers, impersonate="chrome131", timeout=20)
            resp.raise_for_status()
            return resp.json()
        else:
            payload = json.dumps(data).encode()
            req = urllib.request.Request(url, data=payload, method="POST")
            for k, v in headers.items():
                req.add_header(k, v)
            resp = urllib.request.urlopen(req, timeout=20)
            return json.loads(resp.read())

    def _get(self, path: str) -> dict:
        url = f"{self.base}{path}"
        headers = {**self._headers}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if self._use_curl:
            resp = self._curl.get(url, headers=headers, impersonate="chrome131", timeout=15)
            resp.raise_for_status()
            return resp.json()
        else:
            req = urllib.request.Request(url)
            for k, v in headers.items():
                req.add_header(k, v)
            resp = urllib.request.urlopen(req, timeout=15)
            return json.loads(resp.read())

    def login(self, email: str, password: str) -> dict:
        d = self._post("/api/auth/login", {"email": email, "password": password, "source": "tool"})
        if d.get("token"):
            self.token = d["token"]
        return d

    def upload_tokens(self, tokens: list) -> dict:
        return self._post("/api/accounts", {"tokens": tokens}, auth=True)

    def get_accounts(self) -> dict:
        return self._get("/api/accounts")


# ─── Account Manager ───
class AccountManager:
    """Persistent account list with status tracking."""

    def __init__(self):
        self.accounts: list[dict] = []  # [{email, password, status, sso_preview, cookie_json}]
        self._load()

    def _load(self):
        try:
            if ACCOUNTS_FILE.exists():
                data = json.loads(ACCOUNTS_FILE.read_text("utf-8"))
                self.accounts = data if isinstance(data, list) else []
        except:
            self.accounts = []

    def save(self):
        try:
            ACCOUNTS_FILE.parent.mkdir(parents=True, exist_ok=True)
            # Don't save cookie_json to disk (too large), only metadata
            save_data = []
            for a in self.accounts:
                save_data.append({
                    "email": a["email"], "password": a["password"],
                    "status": a.get("status", "pending"),
                    "sso_preview": a.get("sso_preview", ""),
                })
            ACCOUNTS_FILE.write_text(json.dumps(save_data, ensure_ascii=False, indent=2), "utf-8")
        except:
            pass

    def add_from_text(self, text: str) -> int:
        """Parse email|password lines, add new ones. Returns count added."""
        added = 0
        existing = {a["email"] for a in self.accounts}
        for line in text.strip().split("\n"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("|", 1)
            if len(parts) == 2:
                email, pw = parts[0].strip(), parts[1].strip()
                if email and pw and email not in existing:
                    self.accounts.append({
                        "email": email, "password": pw,
                        "status": "pending", "sso_preview": "", "cookie_json": None,
                    })
                    existing.add(email)
                    added += 1
        self.save()
        return added

    def remove(self, emails: list[str]):
        self.accounts = [a for a in self.accounts if a["email"] not in emails]
        self.save()

    def clear(self):
        self.accounts.clear()
        self.save()

    def set_status(self, email: str, status: str, sso_preview: str = "", cookie_json: str = None):
        for a in self.accounts:
            if a["email"] == email:
                a["status"] = status
                if sso_preview:
                    a["sso_preview"] = sso_preview
                if cookie_json is not None:
                    a["cookie_json"] = cookie_json
                break
        self.save()

    def reset_all(self):
        for a in self.accounts:
            a["status"] = "pending"
            a["sso_preview"] = ""
            a["cookie_json"] = None
        self.save()

    def get_pending(self) -> list[tuple[str, str]]:
        return [(a["email"], a["password"]) for a in self.accounts if a["status"] == "pending"]

    def get_success_cookies(self) -> list[str]:
        return [a["cookie_json"] for a in self.accounts if a["status"] == "success" and a.get("cookie_json")]

    @property
    def total(self): return len(self.accounts)
    @property
    def success_count(self): return sum(1 for a in self.accounts if a["status"] == "success")
    @property
    def failed_count(self): return sum(1 for a in self.accounts if a["status"] == "failed")
    @property
    def pending_count(self): return sum(1 for a in self.accounts if a["status"] == "pending")
    @property
    def running_count(self): return sum(1 for a in self.accounts if a["status"] == "running")


# ─── CDP Cookie Grabber ───
FILL_INPUT_JS = """
(function(sel, val) {
  var el = document.querySelector(sel);
  if (!el) return false;
  el.focus();
  var setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('input', {bubbles: true}));
  el.dispatchEvent(new Event('change', {bubbles: true}));
  return true;
})('%s', '%s')
"""

DETECT_FORM_JS = """
(function() {
  var e = document.querySelector('input[type="email"]')
    || document.querySelector('input[name="email"]')
    || document.querySelector('input[autocomplete="email"]');
  var p = document.querySelector('input[type="password"]');
  return { hasEmail: !!e, hasPassword: !!p, url: location.href };
})()
"""

GET_SUBMIT_BTN_JS = """
(function() {
  var form = document.querySelector('form');
  if (!form) return null;
  var btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
  if (!btn) return null;
  var r = btn.getBoundingClientRect();
  return {x: r.x + r.width/2, y: r.y + r.height/2, disabled: btn.disabled};
})()
"""

CHECK_CF_JS = """
(function() {
  var t = document.title || '';
  var h = document.body?.innerText || '';
  return t.includes('Just a moment') || h.includes('Checking your browser');
})()
"""

CHECK_ERROR_JS = """
(function() {
  var alerts = document.querySelectorAll('[role="alert"]');
  for (var a of alerts) {
    var t = a.textContent.toLowerCase();
    if (t.includes('invalid') || t.includes('incorrect') || t.includes('wrong')
        || t.includes('erreur') || t.includes('invalide'))
      return a.textContent.trim();
  }
  return null;
})()
"""


def get_profile_path(email: str) -> Path:
    fid = str(uuid.uuid5(uuid.NAMESPACE_DNS, email))
    p = PROFILES_DIR / fid
    p.mkdir(parents=True, exist_ok=True)
    for lock in ["SingletonLock", "SingletonSocket", "SingletonCookie"]:
        lp = p / lock
        if lp.exists():
            try: lp.unlink()
            except: pass
    return p


def find_chrome() -> str | None:
    system = platform.system()
    if system == "Darwin":
        candidates = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    elif system == "Windows":
        candidates = [
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        ]
    else:
        candidates = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def format_cookies(cookies: list[dict]) -> list[dict]:
    return [{
        "domain": c.get("domain", ""), "expirationDate": c.get("expires", 0) if c.get("expires", 0) > 0 else 0,
        "hostOnly": not str(c.get("domain", "")).startswith("."), "httpOnly": c.get("httpOnly", False),
        "name": c.get("name", ""), "path": c.get("path", "/"),
        "sameSite": c.get("sameSite", "unspecified"), "secure": c.get("secure", False),
        "session": not c.get("expires") or c.get("expires", 0) <= 0, "value": c.get("value", ""),
    } for c in cookies]


def has_sso(cookies: list[dict]) -> bool:
    return any(c.get("name") == "sso" and c.get("value") for c in cookies)


def _get_profiles_size() -> int:
    if not PROFILES_DIR.exists():
        return 0
    total = 0
    for f in PROFILES_DIR.rglob("*"):
        if f.is_file():
            total += f.stat().st_size
    return total // (1024 * 1024)


def _delete_profile(email: str):
    import shutil
    fid = str(uuid.uuid5(uuid.NAMESPACE_DNS, email))
    p = PROFILES_DIR / fid
    if p.exists():
        shutil.rmtree(p, ignore_errors=True)


def _kill_chrome_procs(procs: list):
    """Force kill all Chrome processes."""
    for proc in procs:
        try:
            proc.kill()
            proc.wait(timeout=3)
        except:
            pass
    # Also kill any orphaned chrome with our CDP ports
    if platform.system() == "Windows":
        for port in range(CDP_PORT_BASE, CDP_PORT_BASE + 50):
            try:
                subprocess.run(
                    ["taskkill", "/F", "/FI", f"COMMANDLINE eq *--remote-debugging-port={port}*"],
                    capture_output=True, timeout=3
                )
            except:
                pass


# ─── Async CDP Worker (rewritten with proper stop + per-account signals) ───
class GrabSignals(QObject):
    log = Signal(str)
    account_status = Signal(str, str, str)  # email, status(running/success/failed/timeout), info
    batch_done = Signal()
    progress = Signal(int, int)  # current, total


class GrabWorker(QThread):
    def __init__(self, accounts: list[tuple[str, str]], chrome_path: str, signals: GrabSignals,
                 batch_size: int = 3, cleanup: bool = True, timeout_per_acc: int = 120):
        super().__init__()
        self.accounts = accounts
        self.chrome_path = chrome_path
        self.signals = signals
        self.batch_size = batch_size
        self.cleanup = cleanup
        self.timeout_per_acc = timeout_per_acc
        self.results: list[tuple[str, str]] = []  # (email, cookie_json_str)
        self._stop = False
        self._chrome_procs: list = []  # track ALL chrome processes for cleanup

    def stop(self):
        """Signal stop — kills all Chrome processes immediately."""
        self._stop = True
        self.signals.log.emit("⏹ Đang dừng — kill tất cả Chrome...")
        _kill_chrome_procs(self._chrome_procs)
        self._chrome_procs.clear()

    def run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self._run())
        except Exception as e:
            self.signals.log.emit(f"❌ Worker error: {e}")
        finally:
            # Ensure ALL chrome killed on exit
            _kill_chrome_procs(self._chrome_procs)
            self._chrome_procs.clear()
            loop.close()

    async def _run(self):
        import websockets
        total = len(self.accounts)
        done_count = 0

        for b_start in range(0, total, self.batch_size):
            if self._stop:
                break
            batch = self.accounts[b_start:b_start + self.batch_size]
            self.signals.log.emit(f"\n📦 Batch [{b_start+1}-{b_start+len(batch)}] / {total}")

            procs = []
            screen_w = 1440
            cols = min(len(batch), self.batch_size)
            win_w = screen_w // cols

            for idx, (email, _) in enumerate(batch):
                if self._stop:
                    break
                port = CDP_PORT_BASE + b_start + idx
                profile = get_profile_path(email)
                args = [
                    self.chrome_path,
                    f"--remote-debugging-port={port}",
                    f"--user-data-dir={profile}",
                    f"--window-size={win_w},900",
                    f"--window-position={idx * win_w},0",
                    "--no-first-run", "--no-default-browser-check",
                    LOGIN_URL,
                ]
                proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                procs.append(proc)
                self._chrome_procs.append(proc)
                self.signals.account_status.emit(email, "running", "Mở Chrome...")
                self.signals.log.emit(f"  🌐 Chrome port={port} → {email}")
                if idx < len(batch) - 1:
                    await asyncio.sleep(2)

            if self._stop:
                _kill_chrome_procs(procs)
                break

            await asyncio.sleep(3)

            tasks = []
            for idx, (email, password) in enumerate(batch):
                if self._stop:
                    break
                port = CDP_PORT_BASE + b_start + idx
                tasks.append(self._grab_one_safe(email, password, port, b_start + idx + 1))

            if self._stop:
                _kill_chrome_procs(procs)
                break

            results = await asyncio.gather(*tasks)

            for (email, _), cookies in zip(batch, results):
                if self._stop:
                    break
                done_count += 1
                self.signals.progress.emit(done_count, total)
                if cookies and has_sso(cookies):
                    sso = next(c["value"] for c in cookies if c["name"] == "sso")
                    cookie_str = json.dumps(cookies, ensure_ascii=False)
                    self.results.append((email, cookie_str))
                    self.signals.account_status.emit(email, "success", sso[:20] + "...")
                    self.signals.log.emit(f"  ✅ {email}")
                else:
                    self.signals.account_status.emit(email, "failed", "Không lấy được cookie")
                    self.signals.log.emit(f"  ❌ {email}")

            # Kill Chrome for this batch
            _kill_chrome_procs(procs)
            for p in procs:
                if p in self._chrome_procs:
                    self._chrome_procs.remove(p)

            # Cleanup profiles
            if self.cleanup:
                for email, _ in batch:
                    _delete_profile(email)

            if b_start + len(batch) < total and not self._stop:
                await asyncio.sleep(2)

        self.signals.batch_done.emit()

    async def _grab_one_safe(self, email, password, port, num):
        """Wrapper with hard timeout per account."""
        try:
            return await asyncio.wait_for(
                self._grab_one(email, password, port, num),
                timeout=self.timeout_per_acc
            )
        except asyncio.TimeoutError:
            self.signals.log.emit(f"    [{num}] ⏰ Timeout ({self.timeout_per_acc}s)")
            self.signals.account_status.emit(email, "timeout", f"Timeout {self.timeout_per_acc}s")
            return None
        except Exception as e:
            self.signals.log.emit(f"    [{num}] ✕ {e}")
            self.signals.account_status.emit(email, "failed", str(e)[:50])
            return None

    async def _grab_one(self, email, password, port, num):
        import websockets
        label = f"[{num}]"
        ws_url = None
        for _ in range(15):
            if self._stop:
                return None
            try:
                resp = urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=2)
                tabs = json.loads(resp.read())
                for t in tabs:
                    if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                        ws_url = t["webSocketDebuggerUrl"]
                        break
                if ws_url:
                    break
            except:
                pass
            await asyncio.sleep(1)

        if not ws_url:
            self.signals.log.emit(f"    {label} ✕ CDP timeout")
            return None

        try:
            ws = await websockets.connect(ws_url, max_size=10*1024*1024)
            cookies = await self._login_flow(ws, email, password, label)
            await ws.close()
            return cookies
        except Exception as e:
            self.signals.log.emit(f"    {label} ✕ {e}")
            return None

    async def _cdp(self, ws, method, params=None, timeout=10):
        if self._stop:
            return {}
        msg_id = int(time.time() * 1000) % 999999
        payload = {"id": msg_id, "method": method}
        if params:
            payload["params"] = params
        await ws.send(json.dumps(payload))
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self._stop:
                return {}
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=min(1.0, deadline - time.time()))
                data = json.loads(raw)
                if data.get("id") == msg_id:
                    return data.get("result", {})
            except asyncio.TimeoutError:
                continue
            except:
                break
        return {}

    async def _eval(self, ws, expr):
        r = await self._cdp(ws, "Runtime.evaluate", {"expression": expr, "returnByValue": True})
        return r.get("result", {}).get("value")

    async def _click_at(self, ws, x, y):
        await self._cdp(ws, "Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
        await asyncio.sleep(0.05)
        await self._cdp(ws, "Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})

    async def _click_submit(self, ws):
        pos = await self._eval(ws, GET_SUBMIT_BTN_JS)
        if pos and not pos.get("disabled"):
            await self._click_at(ws, pos["x"], pos["y"])
            return True
        return False

    async def _login_flow(self, ws, email, password, label):
        await self._cdp(ws, "Runtime.enable")
        await self._cdp(ws, "Network.enable")
        await asyncio.sleep(3)

        # CF check
        for i in range(40):
            if self._stop:
                return None
            if not await self._eval(ws, CHECK_CF_JS):
                break
            await asyncio.sleep(1)

        # Already logged in?
        url = await self._eval(ws, "window.location.href") or ""
        if "grok.com" in url and "accounts.x.ai" not in url:
            self.signals.log.emit(f"    {label} ✓ Session cũ")
            r = await self._cdp(ws, "Network.getAllCookies")
            return format_cookies(r.get("cookies", []))

        # Wait form
        form = None
        for _ in range(20):
            if self._stop:
                return None
            form = await self._eval(ws, DETECT_FORM_JS)
            if form and form.get("hasEmail"):
                break
            await asyncio.sleep(1)
        if not form or not form.get("hasEmail"):
            self.signals.log.emit(f"    {label} ⚠ Không thấy form — chờ thủ công")
            return await self._wait_redirect(ws, label, 90)

        is_two_step = form.get("hasEmail") and not form.get("hasPassword")
        safe_email = email.replace("\\", "\\\\").replace("'", "\\'")
        for sel in ['input[type="email"]', 'input[name="email"]']:
            await self._eval(ws, FILL_INPUT_JS % (sel, safe_email))
        self.signals.log.emit(f"    {label} ✓ Email filled")
        self.signals.account_status.emit(email, "running", "Đang đăng nhập...")
        await asyncio.sleep(1)

        if is_two_step:
            await self._click_submit(ws)
            self.signals.log.emit(f"    {label} → Next")
            await asyncio.sleep(3)
            for i in range(60):
                if self._stop:
                    return None
                fi = await self._eval(ws, DETECT_FORM_JS)
                if fi and fi.get("hasPassword"):
                    break
                url = await self._eval(ws, "window.location.href") or ""
                if "grok.com" in url and "accounts.x.ai" not in url:
                    r = await self._cdp(ws, "Network.getAllCookies")
                    return format_cookies(r.get("cookies", []))
                err = await self._eval(ws, CHECK_ERROR_JS)
                if err:
                    self.signals.log.emit(f"    {label} ✕ {err}")
                    return None
                await asyncio.sleep(1)

        safe_pw = password.replace("\\", "\\\\").replace("'", "\\'")
        await self._eval(ws, FILL_INPUT_JS % ('input[type="password"]', safe_pw))
        self.signals.log.emit(f"    {label} ✓ Password filled")
        await asyncio.sleep(1)

        await self._click_submit(ws)
        self.signals.log.emit(f"    {label} → Login")
        await asyncio.sleep(3)

        return await self._wait_redirect(ws, label, 90)

    async def _wait_redirect(self, ws, label, timeout):
        for i in range(timeout):
            if self._stop:
                return None
            try:
                url = await self._eval(ws, "window.location.href") or ""
                if "accounts.x.ai/account" in url and i > 15:
                    await self._cdp(ws, "Page.navigate", {"url": GROK_URL})
                    await asyncio.sleep(3)
                if "grok.com" in url and "accounts.x.ai" not in url:
                    for _ in range(15):
                        if self._stop:
                            return None
                        if not await self._eval(ws, CHECK_CF_JS):
                            break
                        await asyncio.sleep(1)
                    await asyncio.sleep(2)
                    r = await self._cdp(ws, "Network.getAllCookies")
                    cookies = format_cookies(r.get("cookies", []))
                    if has_sso(cookies):
                        return cookies
            except:
                pass
            await asyncio.sleep(1)
        return None


# ─── Auto Updater ───
class UpdateChecker(QThread):
    update_available = Signal(str, str)
    no_update = Signal()
    error = Signal(str)

    def run(self):
        try:
            url = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
            req = urllib.request.Request(url)
            req.add_header("Accept", "application/vnd.github.v3+json")
            req.add_header("User-Agent", "GrokStudioGrabber")
            resp = urllib.request.urlopen(req, timeout=10)
            releases = json.loads(resp.read())
            for rel in releases:
                tag = rel.get("tag_name", "")
                if not tag.startswith(RELEASE_TAG_PREFIX):
                    continue
                remote_ver = tag[len(RELEASE_TAG_PREFIX):]
                if self._is_newer(remote_ver, APP_VERSION):
                    for asset in rel.get("assets", []):
                        if asset["name"].endswith("-windows.zip"):
                            self.update_available.emit(remote_ver, asset["browser_download_url"])
                            return
                break
            self.no_update.emit()
        except Exception as e:
            self.error.emit(str(e))

    @staticmethod
    def _is_newer(remote: str, local: str) -> bool:
        try:
            return [int(x) for x in remote.split(".")] > [int(x) for x in local.split(".")]
        except:
            return False


class UpdateDownloader(QThread):
    progress = Signal(int)
    finished = Signal(bool, str)

    def __init__(self, download_url: str, new_version: str):
        super().__init__()
        self.download_url = download_url
        self.new_version = new_version

    def run(self):
        import zipfile, shutil, tempfile
        try:
            tmp_dir = Path(tempfile.mkdtemp())
            zip_path = tmp_dir / "update.zip"
            req = urllib.request.Request(self.download_url)
            req.add_header("User-Agent", "GrokStudioGrabber")
            resp = urllib.request.urlopen(req, timeout=120)
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            with open(zip_path, "wb") as f:
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        self.progress.emit(int(downloaded * 100 / total))
            extract_dir = tmp_dir / "extracted"
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(extract_dir)
            inner = None
            for item in extract_dir.iterdir():
                if item.is_dir():
                    inner = item
                    break
            if not inner:
                inner = extract_dir
            if getattr(sys, 'frozen', False):
                app_dir = Path(sys.executable).parent
                exe_name = Path(sys.executable).name
                bat_path = tmp_dir / "update.bat"
                bat_content = f'@echo off\necho Đang cập nhật...\ntimeout /t 2 /nobreak >nul\nxcopy /E /Y /Q "{inner}\\*" "{app_dir}\\"\nstart "" "{app_dir / exe_name}"\ndel "%~f0"\n'
                with open(bat_path, "w", encoding="utf-8") as f:
                    f.write(bat_content)
                self.finished.emit(True, str(bat_path))
            else:
                self.finished.emit(True, f"Dev mode: v{self.new_version} tải về {inner}")
        except Exception as e:
            self.finished.emit(False, str(e))


# ═══════════════════════════════════════════════════════════════════════
# UI
# ═══════════════════════════════════════════════════════════════════════
class LoginPage(QWidget):
    login_success = Signal(dict)

    def __init__(self, api: StudioAPI):
        super().__init__()
        self.api = api
        layout = QVBoxLayout(self)
        layout.setAlignment(Qt.AlignCenter)
        layout.setSpacing(16)

        title = QLabel("🎬 Grok Studio")
        title.setFont(QFont("", 22, QFont.Bold))
        title.setAlignment(Qt.AlignCenter)
        title.setStyleSheet("color: #a78bfa;")
        layout.addWidget(title)

        sub = QLabel("Đăng nhập để tiếp tục")
        sub.setAlignment(Qt.AlignCenter)
        sub.setStyleSheet("color: #94a3b8; font-size: 13px;")
        layout.addWidget(sub)
        layout.addSpacing(10)

        card = QFrame()
        card.setObjectName("card")
        card.setFixedWidth(380)
        cl = QVBoxLayout(card)
        cl.setSpacing(12)

        cl.addWidget(QLabel("Email"))
        self.email_input = QLineEdit()
        self.email_input.setPlaceholderText("email@example.com")
        cl.addWidget(self.email_input)

        cl.addWidget(QLabel("Mật khẩu"))
        self.pw_input = QLineEdit()
        self.pw_input.setPlaceholderText("••••••••")
        self.pw_input.setEchoMode(QLineEdit.Password)
        cl.addWidget(self.pw_input)

        self.err_label = QLabel("")
        self.err_label.setStyleSheet("color: #f87171; font-size: 12px;")
        self.err_label.setWordWrap(True)
        cl.addWidget(self.err_label)

        self.login_btn = QPushButton("Đăng nhập")
        self.login_btn.setCursor(Qt.PointingHandCursor)
        self.login_btn.clicked.connect(self.do_login)
        cl.addWidget(self.login_btn)

        layout.addWidget(card, alignment=Qt.AlignCenter)

        srv = QLabel(f"Server: {API_BASE}")
        srv.setAlignment(Qt.AlignCenter)
        srv.setStyleSheet("color: #475569; font-size: 11px;")
        layout.addWidget(srv)

        ver = QLabel(f"v{APP_VERSION}")
        ver.setAlignment(Qt.AlignCenter)
        ver.setStyleSheet("color: #334155; font-size: 10px;")
        layout.addWidget(ver)

        self.pw_input.returnPressed.connect(self.do_login)
        self._load_saved_creds()

    def _load_saved_creds(self):
        try:
            if CREDENTIALS_FILE.exists():
                creds = json.loads(CREDENTIALS_FILE.read_text("utf-8"))
                if creds.get("email"):
                    self.email_input.setText(creds["email"])
                if creds.get("password"):
                    self.pw_input.setText(creds["password"])
        except:
            pass

    def _save_creds(self, email: str, password: str):
        try:
            CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
            CREDENTIALS_FILE.write_text(json.dumps({"email": email, "password": password}), "utf-8")
        except:
            pass

    def do_login(self):
        email = self.email_input.text().strip()
        pw = self.pw_input.text().strip()
        if not email or not pw:
            self.err_label.setText("Nhập email và mật khẩu")
            return
        self.login_btn.setEnabled(False)
        self.login_btn.setText("Đang đăng nhập...")
        self.err_label.setText("")
        try:
            d = self.api.login(email, pw)
            self._save_creds(email, pw)
            self.login_success.emit(d)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            try:
                msg = json.loads(body).get("error", body)
            except:
                msg = body
            self.err_label.setText(f"Lỗi: {msg}")
        except Exception as e:
            msg = str(e)
            if hasattr(e, 'response') and e.response is not None:
                try:
                    msg = e.response.json().get("error", e.response.text[:200])
                except:
                    msg = e.response.text[:200] if hasattr(e.response, 'text') else str(e)
            self.err_label.setText(f"Lỗi: {msg}")
        finally:
            self.login_btn.setEnabled(True)
            self.login_btn.setText("Đăng nhập")


class MainPage(QWidget):
    def __init__(self, api: StudioAPI, user: dict):
        super().__init__()
        self.api = api
        self.user = user
        self.worker = None
        self.chrome_path = find_chrome()
        self.acc_mgr = AccountManager()

        layout = QVBoxLayout(self)
        layout.setSpacing(10)

        # Header
        hdr = QHBoxLayout()
        title = QLabel("🎬 Grok Studio — Cookie Grabber")
        title.setFont(QFont("", 15, QFont.Bold))
        title.setStyleSheet("color: #a78bfa;")
        hdr.addWidget(title)
        hdr.addStretch()
        user_label = QLabel(f"👤 {user.get('name', user.get('email', ''))}")
        user_label.setStyleSheet("color: #94a3b8; font-size: 12px;")
        hdr.addWidget(user_label)
        layout.addLayout(hdr)

        # Chrome status
        info_row = QHBoxLayout()
        if self.chrome_path:
            cs = QFrame(); cs.setObjectName("statusOk")
            csl = QHBoxLayout(cs); csl.addWidget(QLabel(f"✓ Chrome: {os.path.basename(self.chrome_path)}"))
            info_row.addWidget(cs)
        else:
            cs = QFrame(); cs.setObjectName("statusErr")
            csl = QHBoxLayout(cs); csl.addWidget(QLabel("✕ Không tìm thấy Chrome"))
            info_row.addWidget(cs)
        prof_size = _get_profiles_size()
        prof_info = QFrame(); prof_info.setObjectName("statusWarn" if prof_size > 500 else "statusOk")
        pil = QHBoxLayout(prof_info)
        pil.addWidget(QLabel(f"📁 Profiles: {prof_size}MB"))
        if prof_size > 0:
            clean_btn = QPushButton("🗑 Xóa profiles")
            clean_btn.setObjectName("danger"); clean_btn.setFixedWidth(120)
            clean_btn.setCursor(Qt.PointingHandCursor)
            clean_btn.clicked.connect(self._clean_all_profiles)
            pil.addWidget(clean_btn)
        info_row.addWidget(prof_info)
        layout.addLayout(info_row)

        # ── Account Management Card ──
        acc_card = QFrame(); acc_card.setObjectName("card")
        al = QVBoxLayout(acc_card); al.setSpacing(8)

        # Import row
        imp_row = QHBoxLayout()
        imp_row.addWidget(QLabel("📋 Tài khoản Grok:"))
        imp_row.addStretch()

        self.add_input = QLineEdit()
        self.add_input.setPlaceholderText("email|password (Enter để thêm)")
        self.add_input.setFixedWidth(280)
        self.add_input.returnPressed.connect(self._add_single)
        imp_row.addWidget(self.add_input)

        load_btn = QPushButton("📂 Import TXT")
        load_btn.setObjectName("secondary"); load_btn.setCursor(Qt.PointingHandCursor)
        load_btn.setFixedWidth(110)
        load_btn.clicked.connect(self._import_file)
        imp_row.addWidget(load_btn)

        paste_btn = QPushButton("📋 Paste")
        paste_btn.setObjectName("secondary"); paste_btn.setCursor(Qt.PointingHandCursor)
        paste_btn.setFixedWidth(70)
        paste_btn.clicked.connect(self._paste_accounts)
        imp_row.addWidget(paste_btn)

        al.addLayout(imp_row)

        # Account table
        self.acc_table = QTableWidget()
        self.acc_table.setColumnCount(4)
        self.acc_table.setHorizontalHeaderLabels(["Email", "Password", "Status", "Info"])
        self.acc_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.acc_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.acc_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.acc_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.Stretch)
        self.acc_table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.acc_table.setSelectionMode(QAbstractItemView.ExtendedSelection)
        self.acc_table.setMaximumHeight(220)
        self.acc_table.verticalHeader().setDefaultSectionSize(28)
        al.addWidget(self.acc_table)

        # Table action row
        tbl_row = QHBoxLayout()
        self.acc_count_label = QLabel("0 tài khoản")
        self.acc_count_label.setStyleSheet("color: #94a3b8; font-size: 12px;")
        tbl_row.addWidget(self.acc_count_label)
        tbl_row.addStretch()

        del_sel_btn = QPushButton("🗑 Xóa chọn")
        del_sel_btn.setObjectName("danger"); del_sel_btn.setCursor(Qt.PointingHandCursor)
        del_sel_btn.setFixedWidth(100)
        del_sel_btn.clicked.connect(self._delete_selected)
        tbl_row.addWidget(del_sel_btn)

        clear_btn = QPushButton("🗑 Xóa hết")
        clear_btn.setObjectName("danger"); clear_btn.setCursor(Qt.PointingHandCursor)
        clear_btn.setFixedWidth(90)
        clear_btn.clicked.connect(self._clear_accounts)
        tbl_row.addWidget(clear_btn)

        reset_btn = QPushButton("🔄 Reset status")
        reset_btn.setObjectName("secondary"); reset_btn.setCursor(Qt.PointingHandCursor)
        reset_btn.setFixedWidth(110)
        reset_btn.clicked.connect(self._reset_status)
        tbl_row.addWidget(reset_btn)

        al.addLayout(tbl_row)
        layout.addWidget(acc_card)

        # ── Controls Card ──
        ctrl_card = QFrame(); ctrl_card.setObjectName("card")
        ctl = QHBoxLayout(ctrl_card)

        ctl.addWidget(QLabel("Batch:"))
        self.batch_spin = QSpinBox()
        self.batch_spin.setRange(1, 5); self.batch_spin.setValue(BATCH_SIZE)
        self.batch_spin.setFixedWidth(55)
        ctl.addWidget(self.batch_spin)

        ctl.addWidget(QLabel("Timeout/acc:"))
        self.timeout_spin = QSpinBox()
        self.timeout_spin.setRange(30, 300); self.timeout_spin.setValue(120)
        self.timeout_spin.setSuffix("s"); self.timeout_spin.setFixedWidth(75)
        ctl.addWidget(self.timeout_spin)

        self.cleanup_cb = QCheckBox("Xóa profile sau grab")
        self.cleanup_cb.setChecked(True)
        ctl.addWidget(self.cleanup_cb)

        ctl.addStretch()

        self.start_btn = QPushButton("🚀 Bắt đầu Grab")
        self.start_btn.setCursor(Qt.PointingHandCursor)
        self.start_btn.clicked.connect(self.start_grab)
        ctl.addWidget(self.start_btn)

        self.stop_btn = QPushButton("⏹ Dừng")
        self.stop_btn.setObjectName("danger"); self.stop_btn.setCursor(Qt.PointingHandCursor)
        self.stop_btn.setEnabled(False)
        self.stop_btn.clicked.connect(self.stop_grab)
        ctl.addWidget(self.stop_btn)

        self.upload_btn = QPushButton("📤 Upload lên Server")
        self.upload_btn.setObjectName("success"); self.upload_btn.setCursor(Qt.PointingHandCursor)
        self.upload_btn.setEnabled(False)
        self.upload_btn.clicked.connect(self.upload_tokens)
        ctl.addWidget(self.upload_btn)

        layout.addWidget(ctrl_card)

        # Progress
        self.progress = QProgressBar()
        self.progress.setVisible(False)
        layout.addWidget(self.progress)

        self.status_label = QLabel("")
        self.status_label.setStyleSheet("color: #94a3b8; font-size: 12px;")
        layout.addWidget(self.status_label)

        # Log
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setMaximumHeight(160)
        self.log.setStyleSheet("font-family: monospace; font-size: 11px; background: rgba(0,0,0,0.3); border-radius: 8px;")
        layout.addWidget(self.log)

        # Initial render
        self._refresh_table()

    # ── Account Management ──
    def _add_single(self):
        text = self.add_input.text().strip()
        if not text:
            return
        added = self.acc_mgr.add_from_text(text)
        if added:
            self.add_input.clear()
            self._refresh_table()
            self.status_label.setText(f"✓ Thêm {added} tài khoản")
        else:
            self.status_label.setText("⚠ Không thêm được (sai format hoặc đã tồn tại)")

    def _import_file(self):
        path, _ = QFileDialog.getOpenFileName(self, "Mở file accounts", "", "Text files (*.txt);;All (*)")
        if path:
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
            added = self.acc_mgr.add_from_text(text)
            self._refresh_table()
            self.status_label.setText(f"✓ Import {added} tài khoản mới từ {os.path.basename(path)}")

    def _paste_accounts(self):
        clipboard = QApplication.clipboard()
        text = clipboard.text()
        if not text:
            self.status_label.setText("⚠ Clipboard trống")
            return
        added = self.acc_mgr.add_from_text(text)
        self._refresh_table()
        self.status_label.setText(f"✓ Paste {added} tài khoản mới")

    def _delete_selected(self):
        rows = set(idx.row() for idx in self.acc_table.selectedIndexes())
        if not rows:
            return
        emails = [self.acc_mgr.accounts[r]["email"] for r in rows if r < len(self.acc_mgr.accounts)]
        self.acc_mgr.remove(emails)
        self._refresh_table()
        self.status_label.setText(f"🗑 Đã xóa {len(emails)} tài khoản")

    def _clear_accounts(self):
        if not self.acc_mgr.total:
            return
        if QMessageBox.question(self, "Xóa hết", f"Xóa tất cả {self.acc_mgr.total} tài khoản?") != QMessageBox.Yes:
            return
        self.acc_mgr.clear()
        self._refresh_table()
        self.status_label.setText("🗑 Đã xóa tất cả")

    def _reset_status(self):
        self.acc_mgr.reset_all()
        self._refresh_table()
        self.status_label.setText("🔄 Đã reset tất cả về pending")

    def _refresh_table(self):
        accs = self.acc_mgr.accounts
        self.acc_table.setRowCount(len(accs))
        status_colors = {
            "pending": "#94a3b8", "running": "#fbbf24", "success": "#4ade80",
            "failed": "#f87171", "timeout": "#fb923c",
        }
        status_icons = {
            "pending": "⏳", "running": "🔄", "success": "✅",
            "failed": "❌", "timeout": "⏰",
        }
        for i, a in enumerate(accs):
            email_item = QTableWidgetItem(a["email"])
            email_item.setFlags(email_item.flags() & ~Qt.ItemIsEditable)
            self.acc_table.setItem(i, 0, email_item)

            pw_item = QTableWidgetItem("•" * min(len(a["password"]), 8))
            pw_item.setFlags(pw_item.flags() & ~Qt.ItemIsEditable)
            pw_item.setForeground(QColor("#64748b"))
            self.acc_table.setItem(i, 1, pw_item)

            st = a.get("status", "pending")
            st_item = QTableWidgetItem(f"{status_icons.get(st, '?')} {st}")
            st_item.setFlags(st_item.flags() & ~Qt.ItemIsEditable)
            st_item.setForeground(QColor(status_colors.get(st, "#94a3b8")))
            self.acc_table.setItem(i, 2, st_item)

            info_item = QTableWidgetItem(a.get("sso_preview", ""))
            info_item.setFlags(info_item.flags() & ~Qt.ItemIsEditable)
            info_item.setForeground(QColor("#64748b"))
            self.acc_table.setItem(i, 3, info_item)

        ok = self.acc_mgr.success_count
        fail = self.acc_mgr.failed_count
        pend = self.acc_mgr.pending_count
        total = self.acc_mgr.total
        parts = [f"{total} tài khoản"]
        if ok: parts.append(f"✅ {ok}")
        if fail: parts.append(f"❌ {fail}")
        if pend and pend != total: parts.append(f"⏳ {pend}")
        self.acc_count_label.setText(" · ".join(parts))

        # Enable upload if there are successful grabs
        self.upload_btn.setEnabled(ok > 0)
        if ok > 0:
            self.upload_btn.setText(f"📤 Upload {ok} token")

    def _update_account_row(self, email: str, status: str, info: str):
        """Update a single row in the table without full refresh."""
        for i, a in enumerate(self.acc_mgr.accounts):
            if a["email"] == email:
                status_colors = {
                    "pending": "#94a3b8", "running": "#fbbf24", "success": "#4ade80",
                    "failed": "#f87171", "timeout": "#fb923c",
                }
                status_icons = {
                    "pending": "⏳", "running": "🔄", "success": "✅",
                    "failed": "❌", "timeout": "⏰",
                }
                st_item = QTableWidgetItem(f"{status_icons.get(status, '?')} {status}")
                st_item.setFlags(st_item.flags() & ~Qt.ItemIsEditable)
                st_item.setForeground(QColor(status_colors.get(status, "#94a3b8")))
                self.acc_table.setItem(i, 2, st_item)

                info_item = QTableWidgetItem(info)
                info_item.setFlags(info_item.flags() & ~Qt.ItemIsEditable)
                info_item.setForeground(QColor("#64748b"))
                self.acc_table.setItem(i, 3, info_item)

                # Scroll to this row
                self.acc_table.scrollToItem(st_item)
                break
        # Update count label
        ok = self.acc_mgr.success_count
        fail = self.acc_mgr.failed_count
        run = self.acc_mgr.running_count
        total = self.acc_mgr.total
        parts = [f"{total} tài khoản"]
        if ok: parts.append(f"✅ {ok}")
        if fail: parts.append(f"❌ {fail}")
        if run: parts.append(f"🔄 {run}")
        self.acc_count_label.setText(" · ".join(parts))
        if ok > 0:
            self.upload_btn.setEnabled(True)
            self.upload_btn.setText(f"📤 Upload {ok} token")

    # ── Grab ──
    def _clean_all_profiles(self):
        import shutil
        if PROFILES_DIR.exists():
            shutil.rmtree(PROFILES_DIR, ignore_errors=True)
            PROFILES_DIR.mkdir(parents=True, exist_ok=True)
            QMessageBox.information(self, "Xóa profiles", "Đã xóa tất cả Chrome profiles")

    def start_grab(self):
        if not self.chrome_path:
            QMessageBox.warning(self, "Lỗi", "Không tìm thấy Chrome")
            return
        pending = self.acc_mgr.get_pending()
        if not pending:
            QMessageBox.warning(self, "Lỗi", "Không có tài khoản pending. Thêm tài khoản hoặc nhấn Reset status.")
            return

        self.log.clear()
        self.progress.setVisible(True)
        self.progress.setMaximum(len(pending))
        self.progress.setValue(0)
        self.start_btn.setEnabled(False)
        self.stop_btn.setEnabled(True)
        self.status_label.setText(f"Đang grab {len(pending)} accounts...")

        signals = GrabSignals()
        signals.log.connect(self._on_log)
        signals.account_status.connect(self._on_account_status)
        signals.batch_done.connect(self._on_batch_done)
        signals.progress.connect(self._on_progress)

        self.worker = GrabWorker(
            pending, self.chrome_path, signals,
            batch_size=self.batch_spin.value(),
            cleanup=self.cleanup_cb.isChecked(),
            timeout_per_acc=self.timeout_spin.value(),
        )
        self.worker.start()

    def stop_grab(self):
        if self.worker:
            self.worker.stop()
            self.stop_btn.setEnabled(False)
            self.status_label.setText("⏹ Đang dừng — kill Chrome processes...")

    def _on_log(self, msg):
        self.log.append(msg)

    def _on_account_status(self, email, status, info):
        # Map timeout → failed for storage
        store_status = "failed" if status == "timeout" else status
        cookie_json = None
        # Find cookie from worker results
        if status == "success" and self.worker:
            for e, cj in self.worker.results:
                if e == email:
                    cookie_json = cj
                    break
        self.acc_mgr.set_status(email, store_status, sso_preview=info, cookie_json=cookie_json)
        self._update_account_row(email, status, info)

    def _on_progress(self, current, total):
        self.progress.setValue(current)

    def _on_batch_done(self):
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        ok = self.acc_mgr.success_count
        total = self.acc_mgr.total
        self.status_label.setText(f"✅ Hoàn tất: {ok}/{total} thành công")
        self._refresh_table()

    def upload_tokens(self):
        cookies = self.acc_mgr.get_success_cookies()
        if not cookies:
            QMessageBox.warning(self, "Lỗi", "Không có cookie để upload")
            return
        self.upload_btn.setEnabled(False)
        self.upload_btn.setText("Đang upload...")
        try:
            d = self.api.upload_tokens(cookies)
            added = d.get("added", 0)
            errors = d.get("errors", [])
            msg = f"📤 Upload: {added} token thêm thành công"
            if errors:
                msg += f", {len(errors)} lỗi"
            self.status_label.setText(msg)
            self.log.append(f"\n{msg}")
            if errors:
                for e in errors[:5]:
                    self.log.append(f"   ⚠ {e}")
            QMessageBox.information(self, "Upload", f"Đã thêm {added} token vào Grok Studio")
        except Exception as e:
            self.status_label.setText(f"✕ Upload lỗi: {e}")
            QMessageBox.warning(self, "Lỗi", str(e))
        finally:
            self.upload_btn.setEnabled(True)
            ok = self.acc_mgr.success_count
            self.upload_btn.setText(f"📤 Upload {ok} token")


# ═══════════════════════════════════════════════════════════════════════
# Main Window
# ═══════════════════════════════════════════════════════════════════════
class GrokStudioApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"Grok Studio Grabber v{APP_VERSION}")
        self.setMinimumSize(900, 700)
        self.resize(1050, 750)

        self.api = StudioAPI()
        self.main_page = None
        self._active_worker = None

        # Stacked pages
        self.stack = QStackedWidget()
        self.setCentralWidget(self.stack)

        # Login page
        self.login_page = LoginPage(self.api)
        self.login_page.login_success.connect(self._on_login)
        self.stack.addWidget(self.login_page)

        # Check for updates on startup
        self._update_checker = UpdateChecker()
        self._update_checker.update_available.connect(self._on_update_available)
        self._update_checker.start()

    def _on_login(self, data: dict):
        user = data.get("user", data)
        self.main_page = MainPage(self.api, user)
        self.stack.addWidget(self.main_page)
        self.stack.setCurrentWidget(self.main_page)
        # Track worker reference for cleanup
        self._active_worker = None

    def _on_update_available(self, version: str, url: str):
        reply = QMessageBox.question(
            self, "Cập nhật",
            f"Có phiên bản mới: v{version}\nBạn có muốn tải và cập nhật?",
            QMessageBox.Yes | QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            self._start_update(url, version)

    def _start_update(self, url: str, version: str):
        self._downloader = UpdateDownloader(url, version)
        self._downloader.finished.connect(self._on_update_done)
        self._downloader.start()

    def _on_update_done(self, success: bool, info: str):
        if success and info.endswith(".bat"):
            # Windows: run update batch script and exit
            subprocess.Popen(["cmd", "/c", info], creationflags=subprocess.CREATE_NEW_CONSOLE if platform.system() == "Windows" else 0)
            QApplication.quit()
        elif success:
            QMessageBox.information(self, "Cập nhật", info)
        else:
            QMessageBox.warning(self, "Lỗi cập nhật", f"Không thể cập nhật: {info}")

    def closeEvent(self, event):
        """Kill all Chrome processes when closing the app."""
        # Stop any active grab worker
        if self.main_page and self.main_page.worker:
            self.main_page.worker.stop()
            self.main_page.worker.wait(5000)  # Wait up to 5s for thread to finish
        # Final cleanup: kill any remaining Chrome with our CDP ports
        _kill_chrome_procs([])
        event.accept()


# ═══════════════════════════════════════════════════════════════════════
# Entry Point
# ═══════════════════════════════════════════════════════════════════════
def main():
    # Ensure data dirs exist
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    ACCOUNTS_FILE.parent.mkdir(parents=True, exist_ok=True)

    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setStyleSheet(DARK_STYLE)

    # Dark palette
    palette = QPalette()
    palette.setColor(QPalette.Window, QColor("#0a0a0f"))
    palette.setColor(QPalette.WindowText, QColor("#e2e8f0"))
    palette.setColor(QPalette.Base, QColor("#0a0a0f"))
    palette.setColor(QPalette.AlternateBase, QColor("#111118"))
    palette.setColor(QPalette.Text, QColor("#e2e8f0"))
    palette.setColor(QPalette.Button, QColor("#1a1a2e"))
    palette.setColor(QPalette.ButtonText, QColor("#e2e8f0"))
    palette.setColor(QPalette.Highlight, QColor("#6366f1"))
    palette.setColor(QPalette.HighlightedText, QColor("#ffffff"))
    app.setPalette(palette)

    window = GrokStudioApp()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
