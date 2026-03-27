"""
CF Clearance Server — Dùng patchright để lấy cf_clearance từ grok.com.
Chạy trên VPS Windows có Chrome/Chromium.

API:
  GET /health              → health check
  GET /cf-clearance?url=https://grok.com&sso=TOKEN → lấy cf_clearance

Usage:
  python cf_clearance_server.py --host 0.0.0.0 --port 5001
"""

import argparse
import asyncio
import json
import time
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from concurrent.futures import ThreadPoolExecutor

try:
    from patchright.sync_api import sync_playwright
    BROWSER_LIB = "patchright"
except ImportError:
    try:
        from playwright.sync_api import sync_playwright
        BROWSER_LIB = "playwright"
    except ImportError:
        print("ERROR: pip install patchright && python -m patchright install chromium")
        exit(1)

print(f"[INIT] Browser lib: {BROWSER_LIB}")

# Thread pool for browser operations (blocking)
_executor = ThreadPoolExecutor(max_workers=2)


def _solve_cf(url: str, sso_token: str = None, timeout: int = 60) -> dict:
    """Synchronous: mở browser, navigate, đợi CF, trả cookies."""
    start = time.time()
    result = {
        "error": None, "cf_clearance": "", "cookies": "",
        "all_cookies": [], "user_agent": "", "elapsed": 0
    }

    print(f"[SOLVE] Starting browser for {url}...")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=False,
                args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-infobars",
                    "--window-size=1280,720",
                ]
            )
            print(f"[SOLVE] Browser launched")

            context = browser.new_context(
                viewport={"width": 1280, "height": 720},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
            )

            # Inject SSO cookies
            if sso_token:
                domain = urlparse(url).hostname or "grok.com"
                context.add_cookies([
                    {"name": "sso", "value": sso_token, "domain": f".{domain}", "path": "/", "httpOnly": True, "secure": True},
                    {"name": "sso-rw", "value": sso_token, "domain": f".{domain}", "path": "/", "httpOnly": True, "secure": True},
                ])
                print(f"[SOLVE] Injected SSO cookies")

            page = context.new_page()

            print(f"[SOLVE] Navigating to {url}...")
            page.goto(url, wait_until="domcontentloaded", timeout=timeout * 1000)

            # Wait for CF challenge to resolve
            for i in range(timeout):
                title = page.title()
                if "just a moment" not in title.lower():
                    print(f"[SOLVE] Challenge resolved in {i}s (title: {title[:50]})")
                    break

                # Try clicking Turnstile checkbox
                try:
                    for frame in page.frames:
                        if "challenges.cloudflare.com" in (frame.url or ""):
                            cb = frame.query_selector("input[type='checkbox']")
                            if cb:
                                cb.click()
                                print(f"[SOLVE] Clicked Turnstile checkbox")
                except:
                    pass

                time.sleep(1)
                if i % 10 == 0:
                    print(f"[SOLVE] Waiting... {i}s")
            else:
                result["error"] = f"CF challenge timeout after {timeout}s"
                browser.close()
                result["elapsed"] = round(time.time() - start, 2)
                return result

            # Extra wait
            time.sleep(2)

            # Get cookies
            cookies = context.cookies()
            result["all_cookies"] = [
                {"name": c["name"], "value": c["value"], "domain": c.get("domain", "")}
                for c in cookies
            ]
            result["cookies"] = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
            result["user_agent"] = page.evaluate("navigator.userAgent")

            for c in cookies:
                if c["name"] == "cf_clearance":
                    result["cf_clearance"] = c["value"]
                    break

            if result["cf_clearance"]:
                print(f"[SOLVE] ✅ cf_clearance: {result['cf_clearance'][:40]}...")
            else:
                print(f"[SOLVE] ⚠️ cf_clearance NOT found. Cookies: {[c['name'] for c in cookies]}")
                result["error"] = "cf_clearance not found in cookies"

            browser.close()
            print(f"[SOLVE] Browser closed")

    except Exception as e:
        result["error"] = str(e)
        print(f"[SOLVE] ❌ Error: {e}")
        traceback.print_exc()

    result["elapsed"] = round(time.time() - start, 2)
    print(f"[SOLVE] Done in {result['elapsed']}s")
    return result


class CFHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == "/health":
            self._json({"status": "ok", "browser": BROWSER_LIB})
            return

        if parsed.path == "/cf-clearance":
            params = parse_qs(parsed.query)
            url = params.get("url", ["https://grok.com"])[0]
            sso = params.get("sso", [None])[0]
            timeout = int(params.get("timeout", ["60"])[0])

            print(f"\n[API] GET /cf-clearance url={url} sso={'yes' if sso else 'no'} timeout={timeout}")

            # Run browser in thread pool (blocking operation)
            future = _executor.submit(_solve_cf, url, sso, timeout)
            try:
                result = future.result(timeout=timeout + 30)
            except Exception as e:
                result = {"error": str(e), "cf_clearance": "", "elapsed": 0}

            status = 200 if result.get("cf_clearance") else 500
            print(f"[API] Response: {status} cf_clearance={'yes' if result.get('cf_clearance') else 'no'}")
            self._json(result, status)
            return

        self._json({"error": "Not found. Use /cf-clearance or /health"}, 404)

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass  # Suppress default logging


def main():
    parser = argparse.ArgumentParser(description="CF Clearance Server")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5001)
    args = parser.parse_args()

    server = HTTPServer((args.host, args.port), CFHandler)
    print(f"\n{'='*50}")
    print(f"  CF Clearance Server")
    print(f"  http://{args.host}:{args.port}")
    print(f"  Browser: {BROWSER_LIB}")
    print(f"{'='*50}")
    print(f"\nEndpoints:")
    print(f"  GET /health")
    print(f"  GET /cf-clearance?url=https://grok.com&sso=TOKEN")
    print(f"\nReady!\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


if __name__ == "__main__":
    main()
