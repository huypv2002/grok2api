#!/usr/bin/env python3
"""
Grok Cookie Grabber — Chrome thật + CDP, 3 tabs song song.

Sử dụng:
  python grok_cookie_grabber.py accounts.txt
  python grok_cookie_grabber.py accounts.txt --upload https://grok.liveyt.pro

File accounts.txt mỗi dòng: email|password
Kết quả: cookies_output.json + tự upload lên Grok Studio (nếu có --upload)
"""

import asyncio
import json
import os
import platform
import subprocess
import sys
import time
import urllib.request
import urllib.error
import uuid
from pathlib import Path

# Resolve paths relative to the exe/script location, not CWD
if getattr(sys, 'frozen', False):
    _APP_DIR = Path(sys.executable).parent
else:
    _APP_DIR = Path(__file__).parent

OUTPUT_FILE = str(_APP_DIR / "cookies_output.json")
PROFILES_DIR = _APP_DIR / "data" / "profiles"
LOGIN_URL = "https://accounts.x.ai/sign-in?redirect=grok-com&email=true"
GROK_URL = "https://grok.com"
CDP_PORT = 9222
BATCH_SIZE = 3
BATCH_DELAY = 2
WAIT_LOGIN_TIMEOUT = 300

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
  return {x: r.x + r.width/2, y: r.y + r.height/2, disabled: btn.disabled,
          text: btn.textContent.trim()};
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

CHECK_CF_JS = """
(function() {
  var t = document.title || '';
  var h = document.body?.innerText || '';
  return t.includes('Just a moment') || h.includes('Checking your browser');
})()
"""


# ─── Helpers ──────────────────────────────────────────────────────────
def load_accounts(filepath: str) -> list[tuple[str, str]]:
    accounts = []
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("|", 1)
            if len(parts) == 2:
                accounts.append((parts[0].strip(), parts[1].strip()))
    return accounts


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
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            os.path.expanduser("~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        ]
    elif system == "Windows":
        candidates = [
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        ]
    else:
        candidates = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
                      "/usr/bin/chromium-browser", "/usr/bin/chromium"]
    for p in candidates:
        if os.path.exists(p):
            return p
    cmd = "where" if system == "Windows" else "which"
    for name in ["google-chrome", "google-chrome-stable", "chromium", "chrome"]:
        try:
            r = subprocess.run([cmd, name], capture_output=True, text=True, timeout=5)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.strip().split("\n")[0]
        except: pass
    return None


def format_cookies(cookies: list[dict]) -> list[dict]:
    result = []
    for c in cookies:
        result.append({
            "domain": c.get("domain", ""),
            "expirationDate": c.get("expires", 0) if c.get("expires", 0) > 0 else 0,
            "hostOnly": not str(c.get("domain", "")).startswith("."),
            "httpOnly": c.get("httpOnly", False),
            "name": c.get("name", ""),
            "path": c.get("path", "/"),
            "sameSite": c.get("sameSite", "unspecified"),
            "secure": c.get("secure", False),
            "session": not c.get("expires") or c.get("expires", 0) <= 0,
            "value": c.get("value", ""),
        })
    return result


def has_sso(cookies: list[dict]) -> bool:
    return any(c.get("name") == "sso" and c.get("value") for c in cookies)


# ═══════════════════════════════════════════════════════════════════════
# CDP WebSocket helpers
# ═══════════════════════════════════════════════════════════════════════
class CDPTab:
    """Manage a single Chrome tab via CDP WebSocket."""

    def __init__(self, ws, target_id: str, label: str):
        self.ws = ws
        self.target_id = target_id
        self.label = label
        self._msg_id = 0
        self._pending = {}
        self._listener_task = None

    async def start_listener(self):
        self._listener_task = asyncio.create_task(self._listen())

    async def _listen(self):
        try:
            async for raw in self.ws:
                data = json.loads(raw)
                mid = data.get("id")
                if mid is not None and mid in self._pending:
                    self._pending[mid].set_result(data)
        except Exception:
            pass

    async def send(self, method: str, params: dict = None, timeout: float = 15) -> dict:
        self._msg_id += 1
        mid = self._msg_id
        payload = {"id": mid, "method": method}
        if params:
            payload["params"] = params
        fut = asyncio.get_event_loop().create_future()
        self._pending[mid] = fut
        await self.ws.send(json.dumps(payload))
        try:
            result = await asyncio.wait_for(fut, timeout=timeout)
            return result.get("result", {})
        except asyncio.TimeoutError:
            self._pending.pop(mid, None)
            return {}

    async def evaluate(self, expr: str):
        r = await self.send("Runtime.evaluate", {
            "expression": expr, "returnByValue": True, "awaitPromise": False
        })
        return r.get("result", {}).get("value")

    async def click_at(self, x: float, y: float):
        """CDP dispatch mouse click at coordinates."""
        await self.send("Input.dispatchMouseEvent", {
            "type": "mousePressed", "x": x, "y": y,
            "button": "left", "clickCount": 1
        })
        await asyncio.sleep(0.05)
        await self.send("Input.dispatchMouseEvent", {
            "type": "mouseReleased", "x": x, "y": y,
            "button": "left", "clickCount": 1
        })

    async def click_submit(self) -> bool:
        """Find submit button and click it via CDP mouse event."""
        pos = await self.evaluate(GET_SUBMIT_BTN_JS)
        if pos and not pos.get("disabled"):
            await self.click_at(pos["x"], pos["y"])
            return True
        return False

    async def navigate(self, url: str):
        await self.send("Page.navigate", {"url": url})

    async def get_cookies(self) -> list[dict]:
        r = await self.send("Network.getAllCookies")
        return format_cookies(r.get("cookies", []))

    async def close(self):
        if self._listener_task:
            self._listener_task.cancel()
        try:
            await self.ws.close()
        except: pass


# ═══════════════════════════════════════════════════════════════════════
# Single account login flow on a CDPTab
# ═══════════════════════════════════════════════════════════════════════
async def login_account(tab: CDPTab, email: str, password: str) -> list[dict] | None:
    """Fill email/pass, auto-click buttons, wait for grok.com redirect."""
    L = tab.label

    await tab.send("Runtime.enable")
    await tab.send("Page.enable")
    await tab.send("Network.enable")
    await asyncio.sleep(3)

    # ── Check CF full-page ──
    for i in range(40):
        is_cf = await tab.evaluate(CHECK_CF_JS)
        if not is_cf:
            break
        if i == 5:
            print(f"    {L} 🛡 CF challenge, chờ...")
        await asyncio.sleep(1)

    # ── Already logged in? ──
    url = await tab.evaluate("window.location.href") or ""
    if "grok.com" in url and "accounts.x.ai" not in url:
        print(f"    {L} ✓ Session cũ")
        cookies = await tab.get_cookies()
        return cookies if has_sso(cookies) else None

    # ── Wait for form ──
    form = None
    for _ in range(25):
        form = await tab.evaluate(DETECT_FORM_JS)
        if form and form.get("hasEmail"):
            break
        await asyncio.sleep(1)

    if not form or not form.get("hasEmail"):
        print(f"    {L} ✕ Không thấy form — chờ bạn đăng nhập thủ công...")
        return await _wait_grok_redirect(tab, WAIT_LOGIN_TIMEOUT)

    is_two_step = form.get("hasEmail") and not form.get("hasPassword")

    # ── Fill email ──
    safe_email = email.replace("\\", "\\\\").replace("'", "\\'")
    for sel in ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]']:
        await tab.evaluate(FILL_INPUT_JS % (sel, safe_email))
    print(f"    {L} ✓ Email filled")
    await asyncio.sleep(1)

    if is_two_step:
        # ── Click Next/Suivant ──
        clicked = await tab.click_submit()
        if clicked:
            print(f"    {L} → Click Next")
        else:
            print(f"    {L} ⚠ Không tìm thấy nút Next — bấm thủ công")
        await asyncio.sleep(3)

        # ── Wait for password field ──
        pw_found = False
        for i in range(90):
            fi = await tab.evaluate(DETECT_FORM_JS)
            if fi and fi.get("hasPassword"):
                pw_found = True
                break
            url = await tab.evaluate("window.location.href") or ""
            if "grok.com" in url and "accounts.x.ai" not in url:
                cookies = await tab.get_cookies()
                if has_sso(cookies):
                    print(f"    {L} ✅ Login OK (redirect sớm)")
                    return cookies
            err = await tab.evaluate(CHECK_ERROR_JS)
            if err:
                print(f"    {L} ✕ Lỗi: {err}")
                return None
            await asyncio.sleep(1)

        if not pw_found:
            print(f"    {L} ⚠ Chờ password timeout — bạn đăng nhập thủ công")
            return await _wait_grok_redirect(tab, WAIT_LOGIN_TIMEOUT)

    # ── Fill password ──
    safe_pw = password.replace("\\", "\\\\").replace("'", "\\'")
    await tab.evaluate(FILL_INPUT_JS % ('input[type="password"]', safe_pw))
    print(f"    {L} ✓ Password filled")
    await asyncio.sleep(1)

    # ── Click Login/Connexion ──
    clicked = await tab.click_submit()
    if clicked:
        print(f"    {L} → Click Login")
    else:
        print(f"    {L} ⚠ Không tìm thấy nút Login — bấm thủ công")
    await asyncio.sleep(3)

    # ── Wait for redirect to grok.com ──
    return await _wait_grok_redirect(tab, WAIT_LOGIN_TIMEOUT)


async def _wait_grok_redirect(tab: CDPTab, timeout: int) -> list[dict] | None:
    """Poll URL until grok.com, then grab cookies."""
    L = tab.label
    for i in range(timeout):
        try:
            url = await tab.evaluate("window.location.href") or ""

            # Stuck on account page
            if "accounts.x.ai/account" in url and i > 15:
                print(f"    {L} → Force redirect grok.com")
                await tab.navigate(GROK_URL)
                await asyncio.sleep(3)

            if "grok.com" in url and "accounts.x.ai" not in url:
                # Wait for CF on grok.com
                for _ in range(20):
                    is_cf = await tab.evaluate(CHECK_CF_JS)
                    if not is_cf:
                        break
                    await asyncio.sleep(1)
                await asyncio.sleep(2)
                cookies = await tab.get_cookies()
                if has_sso(cookies):
                    print(f"    {L} ✅ Login OK")
                    return cookies

            if i > 0 and i % 30 == 0:
                print(f"    {L} ⏳ Vẫn chờ... ({i}s) url={url[:60]}")
        except Exception:
            pass
        await asyncio.sleep(1)

    print(f"    {L} ✕ Timeout")
    return None


# ═══════════════════════════════════════════════════════════════════════
# Batch: launch 1 Chrome, open N tabs, process in parallel
# ═══════════════════════════════════════════════════════════════════════
async def process_batch(batch: list[tuple[str, str]], chrome_path: str,
                        port: int, batch_idx: int) -> list[dict]:
    """Process a batch of accounts: 1 Chrome, multiple tabs."""
    import websockets

    # Use a shared profile dir for the Chrome instance (tabs share cookies per domain anyway)
    # But each account gets its own profile for cookie isolation
    # → We launch separate Chrome per account in the batch, each with own profile + port
    # Actually: 1 Chrome per tab won't work well. Instead: 1 Chrome, create tabs via CDP.
    # But cookies are shared per Chrome instance...
    # → Best approach: 1 Chrome per account, different ports, arrange windows in grid.

    results = []
    tasks = []
    procs = []

    # Get screen size for grid layout
    screen_w, screen_h = 1440, 900  # default
    try:
        if platform.system() == "Darwin":
            r = subprocess.run(["system_profiler", "SPDisplaysDataType"],
                               capture_output=True, text=True, timeout=5)
            for line in r.stdout.split("\n"):
                if "Resolution" in line:
                    parts = line.split(":")[-1].strip().split(" x ")
                    if len(parts) >= 2:
                        screen_w = int(parts[0].strip())
                        screen_h = int(parts[1].strip().split(" ")[0])
                    break
    except: pass

    cols = min(len(batch), BATCH_SIZE)
    win_w = screen_w // cols
    win_h = screen_h

    for idx, (email, password) in enumerate(batch):
        p = port + idx
        profile = get_profile_path(email)
        x_pos = idx * win_w
        y_pos = 0

        args = [
            chrome_path,
            f"--remote-debugging-port={p}",
            f"--user-data-dir={profile}",
            f"--window-size={win_w},{win_h}",
            f"--window-position={x_pos},{y_pos}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-background-timer-throttling",
            LOGIN_URL,
        ]
        proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        procs.append(proc)
        print(f"  🌐 Chrome #{idx+1} PID={proc.pid} port={p} → {email}")

        if idx < len(batch) - 1:
            await asyncio.sleep(BATCH_DELAY)

    # Wait for all CDPs to be ready, then connect
    await asyncio.sleep(3)

    async def _handle_account(idx, email, password, p, proc):
        label = f"[{batch_idx+idx+1}]"
        ws_url = None
        for _ in range(20):
            try:
                import urllib.request
                resp = urllib.request.urlopen(f"http://127.0.0.1:{p}/json", timeout=2)
                tabs = json.loads(resp.read())
                for t in tabs:
                    if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                        ws_url = t["webSocketDebuggerUrl"]
                        break
                if ws_url:
                    break
            except: pass
            await asyncio.sleep(1)

        if not ws_url:
            print(f"    {label} ✕ CDP không kết nối được")
            return None

        try:
            ws = await websockets.connect(ws_url, max_size=10*1024*1024)
            tab = CDPTab(ws, "", label)
            await tab.start_listener()
            cookies = await login_account(tab, email, password)
            await tab.close()
            return cookies
        except Exception as e:
            print(f"    {label} ✕ Lỗi: {e}")
            return None

    # Run all accounts in parallel
    tasks = [
        _handle_account(idx, email, password, port + idx, procs[idx])
        for idx, (email, password) in enumerate(batch)
    ]
    cookie_results = await asyncio.gather(*tasks)

    # Collect results
    for idx, ((email, _), cookies) in enumerate(zip(batch, cookie_results)):
        if cookies and has_sso(cookies):
            sso_val = next(c["value"] for c in cookies if c["name"] == "sso")
            print(f"  ✅ {email} — sso={sso_val[:20]}...")
            results.append({"email": email, "cookies": cookies})
        else:
            print(f"  ❌ {email} — FAILED")
            results.append({"email": email, "cookies": None})

    # Kill Chrome processes
    for proc in procs:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except:
            try: proc.kill()
            except: pass

    return results


# ═══════════════════════════════════════════════════════════════════════
# Upload to Grok Studio API
# ═══════════════════════════════════════════════════════════════════════
def upload_to_studio(api_url: str, jwt_token: str, results: list[dict]) -> None:
    """Bulk upload cookies to Grok Studio API."""
    tokens = []
    for r in results:
        if r.get("cookies"):
            tokens.append(json.dumps(r["cookies"], ensure_ascii=False))
    if not tokens:
        print("⚠ Không có token nào để upload")
        return

    url = api_url.rstrip("/") + "/api/accounts"
    payload = json.dumps({"tokens": tokens}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {jwt_token}")

    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read())
        added = data.get("added", 0)
        errors = data.get("errors", [])
        print(f"📤 Upload: {added} token(s) thêm thành công")
        if errors:
            print(f"   ⚠ {len(errors)} lỗi: {errors[:3]}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"✕ Upload lỗi HTTP {e.code}: {body[:200]}")
    except Exception as e:
        print(f"✕ Upload lỗi: {e}")


# ═══════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════
def _save_output(results: list):
    lines = [json.dumps(r["cookies"], ensure_ascii=False) for r in results if r["cookies"]]
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


async def main():
    # Parse args
    args = sys.argv[1:]
    filepath = None
    upload_url = None
    jwt_token = None

    i = 0
    while i < len(args):
        if args[i] == "--upload" and i + 1 < len(args):
            upload_url = args[i + 1]
            i += 2
        elif args[i] == "--token" and i + 1 < len(args):
            jwt_token = args[i + 1]
            i += 2
        elif not args[i].startswith("--"):
            filepath = args[i]
            i += 1
        else:
            i += 1

    if not filepath:
        print("╔══════════════════════════════════════════════════════╗")
        print("║  Grok Cookie Grabber — Chrome thật + CDP             ║")
        print("║  3 accounts song song, tự fill + click, grid layout  ║")
        print("╚══════════════════════════════════════════════════════╝")
        print()
        print("Sử dụng:")
        print("  python grok_cookie_grabber.py accounts.txt")
        print("  python grok_cookie_grabber.py accounts.txt --upload https://grok.liveyt.pro --token JWT")
        print()
        print("File accounts.txt mỗi dòng: email|password")
        print()
        print("Options:")
        print("  --upload URL   Tự upload cookie lên Grok Studio")
        print("  --token JWT    JWT token đăng nhập Grok Studio")
        print()
        print("Tool sẽ:")
        print("  1. Mở 3 Chrome cạnh nhau (grid)")
        print("  2. Tự fill email + password + click nút")
        print("  3. Nếu có captcha → bạn giải trên Chrome")
        print("  4. Tự lấy cookie khi đăng nhập thành công")
        print("  5. Upload lên Grok Studio (nếu có --upload)")
        print()
        print("Cài đặt: pip install websockets")
        sys.exit(1)

    if not os.path.exists(filepath):
        print(f"✕ File không tồn tại: {filepath}")
        sys.exit(1)

    chrome_path = find_chrome()
    if not chrome_path:
        print("✕ Không tìm thấy Chrome.")
        sys.exit(1)
    print(f"🌐 Chrome: {chrome_path}")

    try:
        import websockets
    except ImportError:
        print("✕ Cần cài websockets: pip install websockets")
        sys.exit(1)

    accounts = load_accounts(filepath)
    if not accounts:
        print("✕ Không có account nào.")
        sys.exit(1)

    print(f"📋 {len(accounts)} account(s) — batch {BATCH_SIZE}")
    print(f"📁 Profiles: {PROFILES_DIR.absolute()}")
    print("=" * 55)

    all_results = []
    failed = []

    # Process in batches of BATCH_SIZE
    for b_start in range(0, len(accounts), BATCH_SIZE):
        batch = accounts[b_start:b_start + BATCH_SIZE]
        b_end = b_start + len(batch)
        print(f"\n{'='*55}")
        print(f"📦 Batch [{b_start+1}-{b_end}] / {len(accounts)}")
        print(f"{'='*55}")

        results = await process_batch(batch, chrome_path, CDP_PORT + b_start, b_start)

        for r in results:
            if r["cookies"]:
                all_results.append(r)
            else:
                failed.append(r["email"])

        _save_output(all_results)

        if b_end < len(accounts):
            print(f"\n⏳ 3s trước batch tiếp...")
            await asyncio.sleep(3)

    print(f"\n{'='*55}")
    print(f"✅ Thành công: {len(all_results)}/{len(accounts)}")
    if failed:
        print(f"❌ Thất bại ({len(failed)}): {', '.join(failed)}")
    if all_results:
        print(f"\n📁 {OUTPUT_FILE} — {len(all_results)} token(s)")

        # Auto-upload if --upload provided
        if upload_url and jwt_token:
            print(f"\n📤 Upload lên {upload_url}...")
            upload_to_studio(upload_url, jwt_token, all_results)
        elif upload_url and not jwt_token:
            print("\n⚠ Cần --token JWT để upload. Lấy JWT từ Grok Studio (F12 → Application → localStorage → token)")
        else:
            print("👉 Copy nội dung → dán vào Cài đặt Token trên Grok Studio")
            print("💡 Hoặc chạy lại với: --upload https://grok.liveyt.pro --token YOUR_JWT")


if __name__ == "__main__":
    asyncio.run(main())
