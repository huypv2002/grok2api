"""
CF Clearance Auto-Refresh Service for Windows (no Docker needed).
Uses zendriver (headless Chrome) to solve CF challenges.
Runs as a background loop — start with: python cf_service_win.py

RAM usage: ~200MB when solving (Chrome opens briefly), ~20MB idle.
"""
import asyncio
import json
import time
import urllib.request

GROK2API = "http://localhost:8000"
GROK2API_KEY = "grok2api"

# CF Worker URL and internal key (must match wrangler.toml INTERNAL_KEY)
WORKER_URL = "https://grok-studio.kh431248.workers.dev"
INTERNAL_KEY = "cf-sync-k8X#pQ2mR7vL@9nZ"

INTERVAL = 25 * 60  # 25 minutes
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)


def api_get(path):
    req = urllib.request.Request(
        f"{GROK2API}{path}",
        headers={"Authorization": f"Bearer {GROK2API_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def api_post(path, data):
    req = urllib.request.Request(
        f"{GROK2API}{path}",
        data=json.dumps(data).encode(),
        headers={
            "Authorization": f"Bearer {GROK2API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def get_sso_from_worker():
    """Get SSO tokens from CF Worker D1 database (where users add cookies via UI)."""
    try:
        req = urllib.request.Request(
            f"{WORKER_URL}/api/internal/sso-tokens",
            headers={
                "X-Internal-Key": INTERNAL_KEY,
                "User-Agent": "GrokStudio-CF-Service/1.0",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
            tokens = data.get("tokens", [])
            if tokens:
                print(f"  [+] Got {len(tokens)} SSO token(s) from Worker D1")
                return tokens[0]  # Use first active token
    except Exception as e:
        print(f"  [!] Cannot fetch from Worker: {e}")
    return None


def get_sso_from_pool():
    """Fallback: get SSO token from Grok2API token pool."""
    try:
        tokens = api_get("/v1/admin/tokens")
        for pool_name in ("ssoBasic", "ssoSuper", "default"):
            pool = tokens.get(pool_name, [])
            for t in pool:
                tok = t.get("token", "") if isinstance(t, dict) else t
                if tok:
                    print(f"  [+] Got SSO from Grok2API pool '{pool_name}'")
                    return tok
    except Exception as e:
        print(f"  [!] Cannot get SSO from Grok2API pool: {e}")
    return None


def get_sso():
    """Get SSO token: Worker D1 first, then Grok2API pool fallback."""
    sso = get_sso_from_worker()
    if sso:
        return sso
    print("  [*] Worker D1 empty, trying Grok2API pool...")
    return get_sso_from_pool()


def sync_sso_to_pool(sso):
    """Push SSO token into Grok2API pool so generate requests work."""
    try:
        api_post("/v1/admin/tokens", {"ssoBasic": [{"token": sso}]})
        print("  [+] SSO synced to Grok2API pool")
    except Exception as e:
        print(f"  [!] Failed to sync SSO to pool: {e}")


def inject_cf(cookies_dict):
    """Inject cf_clearance into Grok2API config."""
    cf_clearance = cookies_dict.get("cf_clearance", "")
    cf_parts = [f"{k}={v}" for k, v in cookies_dict.items() if k not in ("sso", "sso-rw")]
    try:
        result = api_post("/v1/admin/config", {
            "proxy": {
                "cf_clearance": cf_clearance,
                "cf_cookies": "; ".join(cf_parts),
                "user_agent": UA,
            },
            "app": {
                "video_format": "url",
            },
        })
        return result
    except Exception as e:
        print(f"  [!] Inject failed: {e}")
        return None


async def solve_standalone():
    """Standalone solver using zendriver to get cf_clearance from grok.com."""
    sso = get_sso()
    if not sso:
        print("  [!] No SSO token found. Add a Grok account via the Studio UI.")
        return None

    # Also sync SSO into Grok2API pool
    sync_sso_to_pool(sso)

    try:
        import zendriver
        from zendriver import cdp
        from zendriver.cdp.emulation import UserAgentBrandVersion, UserAgentMetadata
    except ImportError:
        print("  [!] zendriver not installed. Run: pip install zendriver")
        return None

    STEALTH_JS = """
    Object.defineProperty(navigator, 'webdriver', {get: () => false});
    Object.defineProperty(navigator, 'plugins', {get: () => [{name:'Chrome PDF Plugin'},{name:'Chrome PDF Viewer'},{name:'Native Client'}]});
    Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {connect(){}, sendMessage(){}};
    """

    config = zendriver.Config(headless=False)
    config.add_argument(f"--user-agent={UA}")
    config.add_argument("--mute-audio")
    config.add_argument("--disable-gpu")
    config.add_argument("--no-first-run")
    config.add_argument("--no-default-browser-check")
    config.sandbox = False

    browser = zendriver.Browser(config)
    await browser.start()
    tab = browser.main_tab

    try:
        await tab.send(cdp.page.add_script_to_evaluate_on_new_document(source=STEALTH_JS))

        metadata = UserAgentMetadata(
            architecture="x86", bitness="64",
            brands=[
                UserAgentBrandVersion(brand="Not:A-Brand", version="99"),
                UserAgentBrandVersion(brand="Google Chrome", version="136"),
                UserAgentBrandVersion(brand="Chromium", version="136"),
            ],
            full_version_list=[
                UserAgentBrandVersion(brand="Not:A-Brand", version="99.0.0.0"),
                UserAgentBrandVersion(brand="Google Chrome", version="136.0.7103.113"),
                UserAgentBrandVersion(brand="Chromium", version="136.0.7103.113"),
            ],
            mobile=False, model="", platform="Windows",
            platform_version="10.0.0", full_version="136.0.7103.113", wow64=False,
        )
        tab.feed_cdp(cdp.network.set_user_agent_override(UA, user_agent_metadata=metadata))

        # Set SSO cookies
        print("  [*] Setting cookies...")
        await browser.get("https://grok.com/favicon.ico")
        await asyncio.sleep(1)
        await tab.send(cdp.network.set_cookie(name="sso", value=sso, domain=".grok.com", path="/", secure=True, http_only=True))
        await tab.send(cdp.network.set_cookie(name="sso-rw", value=sso, domain=".grok.com", path="/", secure=True, http_only=True))

        # Navigate
        print("  [*] Navigating to grok.com...")
        try:
            await browser.get("https://grok.com")
        except asyncio.TimeoutError:
            pass
        await asyncio.sleep(3)

        # Wait for cf_clearance
        print("  [*] Waiting for cf_clearance...")
        for i in range(30):
            all_cookies = [c.to_json() for c in await browser.cookies.get_all()]
            for c in all_cookies:
                if c["name"] == "cf_clearance":
                    cookies_dict = {cc["name"]: cc["value"] for cc in all_cookies}
                    print(f"  [+] Got cf_clearance after {i}s")
                    return cookies_dict
            await asyncio.sleep(1)

        print("  [-] Timeout waiting for cf_clearance")
        names = [c["name"] for c in [cc.to_json() for cc in await browser.cookies.get_all()]]
        print(f"      Cookies found: {names}")
        return None

    finally:
        await browser.stop()


async def refresh_loop():
    print("=" * 50)
    print("  Grok Studio — CF Auto-Refresh (Windows)")
    print(f"  Interval: {INTERVAL // 60} minutes")
    print(f"  Grok2API: {GROK2API}")
    print(f"  Worker:   {WORKER_URL}")
    print("=" * 50)

    while True:
        ts = time.strftime("%H:%M:%S")
        print(f"\n[{ts}] Starting CF refresh...")

        try:
            cookies = await solve_standalone()
            if cookies:
                result = inject_cf(cookies)
                print(f"  [+] Injected: {result}")
            else:
                print("  [-] Failed to get cf_clearance this round")
        except Exception as e:
            print(f"  [!] Error: {e}")

        ts = time.strftime("%H:%M:%S")
        print(f"[{ts}] Next refresh in {INTERVAL // 60} minutes...")
        await asyncio.sleep(INTERVAL)


if __name__ == "__main__":
    asyncio.run(refresh_loop())
