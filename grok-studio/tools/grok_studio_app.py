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
from pathlib import Path
from threading import Thread

from PySide6.QtCore import Qt, Signal, QObject, QThread, QTimer
from PySide6.QtGui import QFont, QColor, QPalette, QIcon
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QTextEdit, QStackedWidget,
    QFrame, QScrollArea, QProgressBar, QMessageBox, QFileDialog,
    QSpinBox, QCheckBox
)

API_BASE = "https://grok.liveyt.pro"
APP_VERSION = "1.1.0"
GITHUB_REPO = "huypv2002/grok2api"
RELEASE_TAG_PREFIX = "grabber-v"

# Resolve paths relative to the exe/script location, not CWD
if getattr(sys, 'frozen', False):
    _APP_DIR = Path(sys.executable).parent
else:
    _APP_DIR = Path(__file__).parent

PROFILES_DIR = _APP_DIR / "data" / "profiles"
CREDENTIALS_FILE = _APP_DIR / "data" / "credentials.json"
LOGIN_URL = "https://accounts.x.ai/sign-in?redirect=grok-com&email=true"
GROK_URL = "https://grok.com"
CDP_PORT_BASE = 9250
BATCH_SIZE = 3

# ─── Styles ───
DARK_STYLE = """
QMainWindow, QWidget { background-color: #0a0a0f; color: #e2e8f0; }
QLabel { color: #e2e8f0; }
QLineEdit, QTextEdit, QSpinBox {
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
            "Origin": base,
            "Referer": base + "/",
        }
        # Try to use curl_cffi for CF bypass, fallback to urllib
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

    def upload_tokens(self, tokens: list[str]) -> dict:
        return self._post("/api/accounts", {"tokens": tokens}, auth=True)

    def get_accounts(self) -> dict:
        return self._get("/api/accounts")


# ─── CDP Cookie Grabber (reuse from grok_cookie_grabber.py) ───
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
    """Get total size of profiles dir in MB."""
    if not PROFILES_DIR.exists():
        return 0
    total = 0
    for f in PROFILES_DIR.rglob("*"):
        if f.is_file():
            total += f.stat().st_size
    return total // (1024 * 1024)


def _delete_profile(email: str):
    """Delete a single account's Chrome profile."""
    import shutil
    fid = str(uuid.uuid5(uuid.NAMESPACE_DNS, email))
    p = PROFILES_DIR / fid
    if p.exists():
        shutil.rmtree(p, ignore_errors=True)


# ─── Async CDP Worker ───
class GrabSignals(QObject):
    log = Signal(str)
    account_done = Signal(str, bool, str)  # email, success, sso_preview
    batch_done = Signal()
    progress = Signal(int, int)  # current, total


class GrabWorker(QThread):
    def __init__(self, accounts: list[tuple[str, str]], chrome_path: str, signals: GrabSignals):
        super().__init__()
        self.accounts = accounts
        self.chrome_path = chrome_path
        self.signals = signals
        self.results = []  # list of (email, cookie_json_str)
        self._stop = False

    def stop(self):
        self._stop = True

    def run(self):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(self._run())
        loop.close()

    async def _run(self):
        import websockets
        total = len(self.accounts)
        done_count = 0

        for b_start in range(0, total, BATCH_SIZE):
            if self._stop:
                break
            batch = self.accounts[b_start:b_start + BATCH_SIZE]
            self.signals.log.emit(f"\n📦 Batch [{b_start+1}-{b_start+len(batch)}] / {total}")

            procs = []
            screen_w = 1440
            cols = min(len(batch), BATCH_SIZE)
            win_w = screen_w // cols

            for idx, (email, _) in enumerate(batch):
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
                self.signals.log.emit(f"  🌐 Chrome port={port} → {email}")
                if idx < len(batch) - 1:
                    await asyncio.sleep(2)

            await asyncio.sleep(3)

            tasks = []
            for idx, (email, password) in enumerate(batch):
                port = CDP_PORT_BASE + b_start + idx
                tasks.append(self._grab_one(email, password, port, b_start + idx + 1))

            results = await asyncio.gather(*tasks)

            for (email, _), cookies in zip(batch, results):
                done_count += 1
                self.signals.progress.emit(done_count, total)
                if cookies and has_sso(cookies):
                    sso = next(c["value"] for c in cookies if c["name"] == "sso")
                    cookie_str = json.dumps(cookies, ensure_ascii=False)
                    self.results.append((email, cookie_str))
                    self.signals.account_done.emit(email, True, sso[:20] + "...")
                    self.signals.log.emit(f"  ✅ {email}")
                else:
                    self.signals.account_done.emit(email, False, "")
                    self.signals.log.emit(f"  ❌ {email}")

            for proc in procs:
                try:
                    proc.terminate()
                    proc.wait(timeout=5)
                except:
                    try: proc.kill()
                    except: pass

            if b_start + len(batch) < total and not self._stop:
                await asyncio.sleep(3)

        self.signals.batch_done.emit()

    async def _grab_one(self, email, password, port, num):
        import websockets
        label = f"[{num}]"
        ws_url = None
        for _ in range(20):
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

    async def _cdp(self, ws, method, params=None, timeout=15):
        msg_id = int(time.time() * 1000) % 999999
        payload = {"id": msg_id, "method": method}
        if params:
            payload["params"] = params
        await ws.send(json.dumps(payload))
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=max(0.5, deadline - time.time()))
                data = json.loads(raw)
                if data.get("id") == msg_id:
                    return data.get("result", {})
            except asyncio.TimeoutError:
                break
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
        for _ in range(25):
            form = await self._eval(ws, DETECT_FORM_JS)
            if form and form.get("hasEmail"):
                break
            await asyncio.sleep(1)
        if not form or not form.get("hasEmail"):
            self.signals.log.emit(f"    {label} ⚠ Không thấy form — chờ thủ công")
            return await self._wait_redirect(ws, label, 300)

        is_two_step = form.get("hasEmail") and not form.get("hasPassword")
        safe_email = email.replace("\\", "\\\\").replace("'", "\\'")
        for sel in ['input[type="email"]', 'input[name="email"]']:
            await self._eval(ws, FILL_INPUT_JS % (sel, safe_email))
        self.signals.log.emit(f"    {label} ✓ Email filled")
        await asyncio.sleep(1)

        if is_two_step:
            await self._click_submit(ws)
            self.signals.log.emit(f"    {label} → Next")
            await asyncio.sleep(3)
            for i in range(90):
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

        return await self._wait_redirect(ws, label, 300)

    async def _wait_redirect(self, ws, label, timeout):
        for i in range(timeout):
            try:
                url = await self._eval(ws, "window.location.href") or ""
                if "accounts.x.ai/account" in url and i > 15:
                    await self._cdp(ws, "Page.navigate", {"url": GROK_URL})
                    await asyncio.sleep(3)
                if "grok.com" in url and "accounts.x.ai" not in url:
                    for _ in range(20):
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
    """Check GitHub releases for newer version."""
    update_available = Signal(str, str)  # new_version, download_url
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
                    # Find windows zip asset
                    for asset in rel.get("assets", []):
                        if asset["name"].endswith("-windows.zip"):
                            self.update_available.emit(remote_ver, asset["browser_download_url"])
                            return
                break  # Only check latest matching release
            self.no_update.emit()
        except Exception as e:
            self.error.emit(str(e))

    @staticmethod
    def _is_newer(remote: str, local: str) -> bool:
        try:
            r = [int(x) for x in remote.split(".")]
            l = [int(x) for x in local.split(".")]
            return r > l
        except:
            return False


class UpdateDownloader(QThread):
    """Download and apply update."""
    progress = Signal(int)  # percent
    finished = Signal(bool, str)  # success, message

    def __init__(self, download_url: str, new_version: str):
        super().__init__()
        self.download_url = download_url
        self.new_version = new_version

    def run(self):
        import zipfile
        import shutil
        import tempfile

        try:
            # Download to temp
            tmp_dir = Path(tempfile.mkdtemp())
            zip_path = tmp_dir / "update.zip"

            req = urllib.request.Request(self.download_url)
            req.add_header("User-Agent", "GrokStudioGrabber")
            resp = urllib.request.urlopen(req, timeout=120)
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            chunk_size = 64 * 1024

            with open(zip_path, "wb") as f:
                while True:
                    chunk = resp.read(chunk_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        self.progress.emit(int(downloaded * 100 / total))

            # Extract
            extract_dir = tmp_dir / "extracted"
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(extract_dir)

            # Find the inner folder (GrokStudioGrabber/)
            inner = None
            for item in extract_dir.iterdir():
                if item.is_dir():
                    inner = item
                    break
            if not inner:
                inner = extract_dir

            # Write update script that replaces files after app exits
            if getattr(sys, 'frozen', False):
                app_dir = Path(sys.executable).parent
                exe_name = Path(sys.executable).name
            else:
                # Dev mode — just report success without replacing
                self.finished.emit(True, f"Dev mode: bản {self.new_version} đã tải về {inner}")
                return

            # Create a batch script to replace files
            bat_path = tmp_dir / "update.bat"
            bat_content = f"""@echo off
echo Đang cập nhật Grok Studio Grabber...
timeout /t 2 /nobreak >nul
xcopy /E /Y /Q "{inner}\\*" "{app_dir}\\"
echo Cập nhật xong! Đang khởi động lại...
start "" "{app_dir / exe_name}"
del "%~f0"
"""
            with open(bat_path, "w", encoding="utf-8") as f:
                f.write(bat_content)

            self.finished.emit(True, str(bat_path))
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

        # Logo
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

        # Form card
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

        # Server URL
        srv = QLabel(f"Server: {API_BASE}")
        srv.setAlignment(Qt.AlignCenter)
        srv.setStyleSheet("color: #475569; font-size: 11px;")
        layout.addWidget(srv)

        ver = QLabel(f"v{APP_VERSION}")
        ver.setAlignment(Qt.AlignCenter)
        ver.setStyleSheet("color: #334155; font-size: 10px;")
        layout.addWidget(ver)

        self.pw_input.returnPressed.connect(self.do_login)

        # Auto-fill from saved credentials
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
            # curl_cffi HTTPError
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

        layout = QVBoxLayout(self)
        layout.setSpacing(12)

        # Header
        hdr = QHBoxLayout()
        title = QLabel("🎬 Grok Studio — Cookie Grabber")
        title.setFont(QFont("", 16, QFont.Bold))
        title.setStyleSheet("color: #a78bfa;")
        hdr.addWidget(title)
        hdr.addStretch()
        user_label = QLabel(f"👤 {user.get('name', user.get('email', ''))}")
        user_label.setStyleSheet("color: #94a3b8; font-size: 12px;")
        hdr.addWidget(user_label)
        layout.addLayout(hdr)

        # Chrome status + profile info
        info_row = QHBoxLayout()
        if self.chrome_path:
            cs = QFrame()
            cs.setObjectName("statusOk")
            csl = QHBoxLayout(cs)
            csl.addWidget(QLabel(f"✓ Chrome: {os.path.basename(self.chrome_path)}"))
            info_row.addWidget(cs)
        else:
            cs = QFrame()
            cs.setObjectName("statusErr")
            csl = QHBoxLayout(cs)
            csl.addWidget(QLabel("✕ Không tìm thấy Chrome"))
            info_row.addWidget(cs)

        # Profile disk info
        prof_size = _get_profiles_size()
        prof_info = QFrame()
        prof_info.setObjectName("statusWarn" if prof_size > 500 else "statusOk")
        pil = QHBoxLayout(prof_info)
        pil.addWidget(QLabel(f"📁 Profiles: {PROFILES_DIR.absolute()} ({prof_size}MB)"))
        if prof_size > 0:
            clean_btn = QPushButton("🗑 Xóa tất cả profiles")
            clean_btn.setObjectName("danger")
            clean_btn.setFixedWidth(160)
            clean_btn.setCursor(Qt.PointingHandCursor)
            clean_btn.clicked.connect(self._clean_all_profiles)
            pil.addWidget(clean_btn)
        info_row.addWidget(prof_info)
        layout.addLayout(info_row)

        # Input area
        input_card = QFrame()
        input_card.setObjectName("card")
        il = QVBoxLayout(input_card)
        il.setSpacing(8)

        il.addWidget(QLabel("Danh sách tài khoản Grok (email|password, mỗi dòng 1 account):"))
        self.acc_input = QTextEdit()
        self.acc_input.setPlaceholderText("user1@gmail.com|password123\nuser2@gmail.com|pass456")
        self.acc_input.setMaximumHeight(150)
        il.addWidget(self.acc_input)

        btn_row = QHBoxLayout()
        load_btn = QPushButton("📂 Mở file .txt")
        load_btn.setObjectName("secondary")
        load_btn.setCursor(Qt.PointingHandCursor)
        load_btn.clicked.connect(self.load_file)
        btn_row.addWidget(load_btn)

        btn_row.addWidget(QLabel("Batch size:"))
        self.batch_spin = QSpinBox()
        self.batch_spin.setRange(1, 5)
        self.batch_spin.setValue(BATCH_SIZE)
        self.batch_spin.setFixedWidth(60)
        btn_row.addWidget(self.batch_spin)

        self.cleanup_cb = QCheckBox("Xóa profile sau khi grab")
        self.cleanup_cb.setChecked(True)
        self.cleanup_cb.setToolTip("Xóa Chrome profile sau khi lấy cookie xong (tiết kiệm ~100MB/account)")
        btn_row.addWidget(self.cleanup_cb)

        btn_row.addStretch()

        self.start_btn = QPushButton("🚀 Bắt đầu Grab")
        self.start_btn.setCursor(Qt.PointingHandCursor)
        self.start_btn.clicked.connect(self.start_grab)
        btn_row.addWidget(self.start_btn)

        self.stop_btn = QPushButton("⏹ Dừng")
        self.stop_btn.setObjectName("danger")
        self.stop_btn.setCursor(Qt.PointingHandCursor)
        self.stop_btn.setEnabled(False)
        self.stop_btn.clicked.connect(self.stop_grab)
        btn_row.addWidget(self.stop_btn)

        il.addLayout(btn_row)
        layout.addWidget(input_card)

        # Progress
        self.progress = QProgressBar()
        self.progress.setVisible(False)
        layout.addWidget(self.progress)

        self.status_label = QLabel("")
        self.status_label.setStyleSheet("color: #94a3b8; font-size: 12px;")
        layout.addWidget(self.status_label)

        # Results area
        self.result_area = QFrame()
        self.result_area.setObjectName("card")
        rl = QVBoxLayout(self.result_area)
        rl.addWidget(QLabel("Kết quả:"))
        self.result_list = QTextEdit()
        self.result_list.setReadOnly(True)
        self.result_list.setMaximumHeight(200)
        self.result_list.setStyleSheet("font-family: monospace; font-size: 11px;")
        rl.addWidget(self.result_list)

        upload_row = QHBoxLayout()
        self.upload_btn = QPushButton("📤 Upload lên Grok Studio")
        self.upload_btn.setCursor(Qt.PointingHandCursor)
        self.upload_btn.setEnabled(False)
        self.upload_btn.clicked.connect(self.upload_tokens)
        upload_row.addWidget(self.upload_btn)
        upload_row.addStretch()
        rl.addLayout(upload_row)

        layout.addWidget(self.result_area)

        # Log
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setMaximumHeight(180)
        self.log.setStyleSheet("font-family: monospace; font-size: 11px; background: rgba(0,0,0,0.3); border-radius: 8px;")
        layout.addWidget(self.log)

    def _clean_all_profiles(self):
        import shutil
        if PROFILES_DIR.exists():
            shutil.rmtree(PROFILES_DIR, ignore_errors=True)
            PROFILES_DIR.mkdir(parents=True, exist_ok=True)
            QMessageBox.information(self, "Xóa profiles", "Đã xóa tất cả Chrome profiles")

    def load_file(self):
        path, _ = QFileDialog.getOpenFileName(self, "Mở file accounts", "", "Text files (*.txt);;All (*)")
        if path:
            with open(path, "r", encoding="utf-8") as f:
                self.acc_input.setPlainText(f.read())

    def _parse_accounts(self) -> list[tuple[str, str]]:
        accounts = []
        for line in self.acc_input.toPlainText().strip().split("\n"):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("|", 1)
            if len(parts) == 2:
                accounts.append((parts[0].strip(), parts[1].strip()))
        return accounts

    def start_grab(self):
        if not self.chrome_path:
            QMessageBox.warning(self, "Lỗi", "Không tìm thấy Chrome")
            return
        accounts = self._parse_accounts()
        if not accounts:
            QMessageBox.warning(self, "Lỗi", "Nhập ít nhất 1 account (email|password)")
            return

        global BATCH_SIZE
        BATCH_SIZE = self.batch_spin.value()

        self.log.clear()
        self.result_list.clear()
        self.progress.setVisible(True)
        self.progress.setMaximum(len(accounts))
        self.progress.setValue(0)
        self.start_btn.setEnabled(False)
        self.stop_btn.setEnabled(True)
        self.upload_btn.setEnabled(False)
        self.status_label.setText(f"Đang grab {len(accounts)} accounts...")

        signals = GrabSignals()
        signals.log.connect(self._on_log)
        signals.account_done.connect(self._on_account_done)
        signals.batch_done.connect(self._on_batch_done)
        signals.progress.connect(self._on_progress)

        self.worker = GrabWorker(accounts, self.chrome_path, signals)
        self.worker.start()

    def stop_grab(self):
        if self.worker:
            self.worker.stop()
            self.status_label.setText("Đang dừng...")

    def _on_log(self, msg):
        self.log.append(msg)

    def _on_account_done(self, email, success, sso_preview):
        icon = "✅" if success else "❌"
        self.result_list.append(f"{icon} {email}" + (f" — sso={sso_preview}" if success else " — FAILED"))

    def _on_progress(self, current, total):
        self.progress.setValue(current)

    def _on_batch_done(self):
        self.start_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        results = self.worker.results if self.worker else []
        ok = len(results)
        total = len(self._parse_accounts())
        self.status_label.setText(f"✅ Hoàn tất: {ok}/{total} thành công")
        if results:
            self.upload_btn.setEnabled(True)
            self.upload_btn.setText(f"📤 Upload {ok} token lên Grok Studio")
        # Cleanup profiles if checked
        if self.cleanup_cb.isChecked():
            accounts = self._parse_accounts()
            cleaned = 0
            for email, _ in accounts:
                _delete_profile(email)
                cleaned += 1
            if cleaned:
                self.log.append(f"\n🗑 Đã xóa {cleaned} Chrome profiles")

    def upload_tokens(self):
        if not self.worker or not self.worker.results:
            return
        tokens = [cookie_str for _, cookie_str in self.worker.results]
        self.upload_btn.setEnabled(False)
        self.upload_btn.setText("Đang upload...")
        try:
            d = self.api.upload_tokens(tokens)
            added = d.get("added", 0)
            errors = d.get("errors", [])
            self.status_label.setText(f"📤 Upload: {added} token thêm thành công" + (f", {len(errors)} lỗi" if errors else ""))
            self.log.append(f"\n📤 Upload: {added} token thêm thành công")
            if errors:
                for e in errors[:5]:
                    self.log.append(f"   ⚠ {e}")
            QMessageBox.information(self, "Upload", f"Đã thêm {added} token vào Grok Studio")
        except Exception as e:
            self.status_label.setText(f"✕ Upload lỗi: {e}")
            QMessageBox.warning(self, "Lỗi", str(e))
        finally:
            self.upload_btn.setEnabled(True)
            self.upload_btn.setText(f"📤 Upload lên Grok Studio")


class GrokStudioApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"Grok Studio — Cookie Grabber v{APP_VERSION}")
        self.setMinimumSize(700, 600)
        self.resize(800, 700)

        self.api = StudioAPI()
        self.stack = QStackedWidget()
        self.setCentralWidget(self.stack)

        # Login page
        self.login_page = LoginPage(self.api)
        self.login_page.login_success.connect(self.on_login)
        self.stack.addWidget(self.login_page)

        # Auto-update check
        self._update_checker = UpdateChecker()
        self._update_checker.update_available.connect(self._on_update_available)
        self._update_checker.start()

    def _on_update_available(self, new_version, download_url):
        reply = QMessageBox.question(
            self, "Cập nhật mới",
            f"Có phiên bản mới: v{new_version} (hiện tại: v{APP_VERSION})\n\nBạn có muốn cập nhật không?",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.Yes
        )
        if reply == QMessageBox.Yes:
            self._start_update(new_version, download_url)

    def _start_update(self, new_version, download_url):
        self._update_dlg = QMessageBox(self)
        self._update_dlg.setWindowTitle("Đang cập nhật...")
        self._update_dlg.setText(f"Đang tải v{new_version}... 0%")
        self._update_dlg.setStandardButtons(QMessageBox.NoButton)
        self._update_dlg.show()

        self._downloader = UpdateDownloader(download_url, new_version)
        self._downloader.progress.connect(lambda p: self._update_dlg.setText(f"Đang tải v{new_version}... {p}%"))
        self._downloader.finished.connect(lambda ok, msg: self._on_update_done(ok, msg))
        self._downloader.start()

    def _on_update_done(self, success, message):
        self._update_dlg.close()
        if success:
            if message.endswith(".bat"):
                # Launch update script and exit
                subprocess.Popen(["cmd", "/c", message], creationflags=0x00000008)  # DETACHED_PROCESS
                QApplication.quit()
            else:
                QMessageBox.information(self, "Cập nhật", message)
        else:
            QMessageBox.warning(self, "Lỗi cập nhật", f"Không thể cập nhật: {message}")

    def on_login(self, data):
        user = data.get("user", {})
        self.main_page = MainPage(self.api, user)
        self.stack.addWidget(self.main_page)
        self.stack.setCurrentWidget(self.main_page)


def main():
    app = QApplication(sys.argv)
    app.setStyleSheet(DARK_STYLE)

    # Dark palette
    palette = QPalette()
    palette.setColor(QPalette.Window, QColor(10, 10, 15))
    palette.setColor(QPalette.WindowText, QColor(226, 232, 240))
    palette.setColor(QPalette.Base, QColor(15, 15, 25))
    palette.setColor(QPalette.Text, QColor(226, 232, 240))
    palette.setColor(QPalette.Button, QColor(20, 20, 35))
    palette.setColor(QPalette.ButtonText, QColor(226, 232, 240))
    app.setPalette(palette)

    window = GrokStudioApp()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
