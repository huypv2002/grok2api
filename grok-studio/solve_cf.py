"""
CF clearance solver for grok.com using zendriver.
Gets cf_clearance, injects into Grok2API, then tests video gen.
"""
import asyncio
import json
import urllib.request
from datetime import datetime
from enum import Enum
from typing import Optional

import zendriver
from zendriver import cdp
from zendriver.cdp.emulation import UserAgentBrandVersion, UserAgentMetadata
from zendriver.core.element import Element
import user_agents

# ── Config ──
GROK2API = "http://localhost:8000"
GROK2API_KEY = "grok2api"
SSO = (
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9."
    "eyJzZXNzaW9uX2lkIjoiYmU3OTkwYzUtNzFiYi00OThmLWI4NWEtNGRlNWQ1ZDRmMjRhIn0."
    "eFTm4os1wOVOFzmiZ03H0ZzD4093MG1ggp4aFxPKrRQ"
)
# UA must match curl_cffi impersonate="chrome136"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)

STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', {get: () => false});
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const p = [
      {name:'Chrome PDF Plugin', filename:'internal-pdf-viewer', description:'Portable Document Format'},
      {name:'Chrome PDF Viewer', filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai', description:''},
      {name:'Native Client', filename:'internal-nacl-plugin', description:''},
    ];
    p.length = 3;
    return p;
  }
});
Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => 8});
Object.defineProperty(navigator, 'deviceMemory', {get: () => 8});
Object.defineProperty(navigator, 'maxTouchPoints', {get: () => 0});
if (!window.chrome) window.chrome = {};
if (!window.chrome.runtime) window.chrome.runtime = {connect(){}, sendMessage(){}};
if (window.outerWidth === 0) {
  Object.defineProperty(window, 'outerWidth', {get: () => window.innerWidth});
  Object.defineProperty(window, 'outerHeight', {get: () => window.innerHeight + 85});
}
"""


class ChallengePlatform(Enum):
    JAVASCRIPT = "non-interactive"
    MANAGED = "managed"
    INTERACTIVE = "interactive"


async def set_ua_metadata(tab, ua_str: str):
    device = user_agents.parse(ua_str)
    plat, plat_ver = "Windows", "10.0.0"
    browser_ver = str(device.browser.version[0]) if device.browser.version else "136"
    full_ver = device.browser.version_string or "136.0.7103.113"
    metadata = UserAgentMetadata(
        architecture="x86",
        bitness="64",
        brands=[
            UserAgentBrandVersion(brand="Not:A-Brand", version="99"),
            UserAgentBrandVersion(brand="Google Chrome", version=browser_ver),
            UserAgentBrandVersion(brand="Chromium", version=browser_ver),
        ],
        full_version_list=[
            UserAgentBrandVersion(brand="Not:A-Brand", version="99.0.0.0"),
            UserAgentBrandVersion(brand="Google Chrome", version=full_ver),
            UserAgentBrandVersion(brand="Chromium", version=full_ver),
        ],
        mobile=False, model="", platform=plat,
        platform_version=plat_ver, full_version=full_ver, wow64=False,
    )
    tab.feed_cdp(cdp.network.set_user_agent_override(ua_str, user_agent_metadata=metadata))


async def detect_challenge(tab) -> Optional[ChallengePlatform]:
    html = await tab.get_content()
    for p in ChallengePlatform:
        if f"cType: '{p.value}'" in html:
            return p
    return None


def extract_clearance(cookies: list) -> Optional[dict]:
    for c in cookies:
        if c["name"] == "cf_clearance":
            return c
    return None


async def solve_challenge(driver, timeout: float = 30):
    tab = driver.main_tab
    start = datetime.now()
    while (datetime.now() - start).seconds < timeout:
        all_cookies = [c.to_json() for c in await driver.cookies.get_all()]
        if extract_clearance(all_cookies):
            return
        challenge = await detect_challenge(tab)
        if challenge is None:
            return

        try:
            widget_input = await tab.find("input")
        except Exception:
            await asyncio.sleep(0.5)
            continue

        if widget_input.parent is None or not widget_input.parent.shadow_roots:
            await asyncio.sleep(0.25)
            continue

        shadow_element = Element(
            widget_input.parent.shadow_roots[0],
            tab, widget_input.parent.tree,
        )
        target = shadow_element.children[0]
        if not isinstance(target, Element):
            await asyncio.sleep(0.25)
            continue
        if "display: none;" in target.attrs.get("style", ""):
            await asyncio.sleep(0.25)
            continue

        await asyncio.sleep(1)
        try:
            await target.get_position()
            pos = target.position
            if pos and hasattr(pos, 'x') and hasattr(pos, 'y'):
                x = pos.x + (pos.width / 2 if hasattr(pos, 'width') else 10)
                y = pos.y + (pos.height / 2 if hasattr(pos, 'height') else 10)
                await tab.send(cdp.input_.dispatch_mouse_event(
                    type_="mouseMoved", x=x, y=y))
                await asyncio.sleep(0.05)
                await tab.send(cdp.input_.dispatch_mouse_event(
                    type_="mousePressed", x=x, y=y,
                    button=cdp.input_.MouseButton.LEFT, click_count=1))
                await asyncio.sleep(0.05)
                await tab.send(cdp.input_.dispatch_mouse_event(
                    type_="mouseReleased", x=x, y=y,
                    button=cdp.input_.MouseButton.LEFT, click_count=1))
            else:
                await target.mouse_click()
        except Exception:
            try:
                await target.mouse_click()
            except Exception:
                pass


async def get_cf_clearance():
    config = zendriver.Config(headless=False)
    config.add_argument(f"--user-agent={UA}")
    config.add_argument("--mute-audio")
    config.sandbox = False

    browser = zendriver.Browser(config)
    await browser.start()
    tab = browser.main_tab

    try:
        # 1. Stealth + UA metadata BEFORE navigation
        await tab.send(cdp.page.add_script_to_evaluate_on_new_document(source=STEALTH_JS))
        await set_ua_metadata(tab, UA)

        # 2. Navigate to favicon first to set cookies on domain
        print("[*] Setting up cookies on domain...")
        await browser.get("https://grok.com/favicon.ico")
        await asyncio.sleep(1)

        # Inject SSO cookies
        await tab.send(cdp.network.set_cookie(
            name="sso", value=SSO, domain=".grok.com", path="/",
            secure=True, http_only=True))
        await tab.send(cdp.network.set_cookie(
            name="sso-rw", value=SSO, domain=".grok.com", path="/",
            secure=True, http_only=True))

        # 3. Navigate to grok.com
        print("[*] Navigating to grok.com...")
        try:
            await browser.get("https://grok.com")
        except asyncio.TimeoutError:
            print("[!] Page load timeout (may be OK)")
        await asyncio.sleep(3)

        # 4. Check/solve CF challenge
        all_cookies = [c.to_json() for c in await browser.cookies.get_all()]
        clearance = extract_clearance(all_cookies)

        if clearance is None:
            challenge = await detect_challenge(tab)
            if challenge:
                print(f"[*] Challenge detected: {challenge.value}")
            else:
                html = await tab.get_content()
                if "Just a moment" in html or "Chờ một chút" in html:
                    print("[*] CF waiting page detected...")
                else:
                    print("[*] No challenge detected, waiting...")

            await solve_challenge(browser, timeout=30)

            all_cookies = [c.to_json() for c in await browser.cookies.get_all()]
            clearance = extract_clearance(all_cookies)

        # Extra wait if still no clearance
        if clearance is None:
            print("[*] Waiting for cf_clearance to appear...")
            for i in range(20):
                await asyncio.sleep(1)
                all_cookies = [c.to_json() for c in await browser.cookies.get_all()]
                clearance = extract_clearance(all_cookies)
                if clearance:
                    break
                if i % 5 == 0:
                    names = [c["name"] for c in all_cookies]
                    print(f"  [{i}s] cookies: {names}")

        if clearance is None:
            print("[-] Failed to get cf_clearance!")
            names = [c["name"] for c in all_cookies]
            print(f"    Available cookies: {names}")
            return None

        cookies_dict = {c["name"]: c["value"] for c in all_cookies}
        print(f"[+] cf_clearance: {clearance['value'][:50]}...")
        return cookies_dict

    finally:
        await browser.stop()


def inject_to_grok2api(cookies_dict: dict):
    """Inject cf_clearance + cookies + matching UA into Grok2API config."""
    cf_clearance = cookies_dict.get("cf_clearance", "")
    cf_parts = []
    for k, v in cookies_dict.items():
        if k not in ("sso", "sso-rw"):
            cf_parts.append(f"{k}={v}")
    cf_cookies_str = "; ".join(cf_parts)

    # UA MUST match the one used to get cf_clearance!
    # video_format=url so Grok2API downloads+caches video and returns proxied URL
    payload = json.dumps({
        "proxy": {
            "cf_clearance": cf_clearance,
            "cf_cookies": cf_cookies_str,
            "user_agent": UA,
        },
        "app": {
            "video_format": "url",
        }
    }).encode()
    req = urllib.request.Request(
        f"{GROK2API}/v1/admin/config",
        data=payload,
        headers={"Authorization": f"Bearer {GROK2API_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req)
    print(f"[+] Grok2API config updated: {resp.read().decode()}")


def verify_with_curl_cffi(cookies_dict: dict) -> bool:
    """Test CF bypass with curl_cffi using same UA."""
    from curl_cffi.requests import Session
    s = Session()
    cookie_str = "; ".join(f"{k}={v}" for k, v in cookies_dict.items())
    r = s.post(
        "https://grok.com/rest/user-settings",
        headers={
            "Cookie": cookie_str,
            "Content-Type": "application/json",
            "Origin": "https://grok.com",
            "Referer": "https://grok.com/",
            "User-Agent": UA,
        },
        data="{}",
        impersonate="chrome136",
    )
    print(f"[*] curl_cffi user-settings: HTTP {r.status_code}")
    return r.status_code == 200


def test_video_gen():
    """Test video generation through Grok2API after injecting cookies."""
    payload = json.dumps({
        "prompt": "A cat walking on the beach at sunset",
        "size": "1792x1024",
        "seconds": 6,
        "quality": "standard",
    }).encode()
    req = urllib.request.Request(
        f"{GROK2API}/v1/videos",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=120)
        result = json.loads(resp.read().decode())
        url = result.get("data", [{}])[0].get("url", "")
        print(f"[+] Video generated! URL: {url}")
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"[-] Video gen failed: HTTP {e.code}")
        print(f"    {body[:300]}")
        return False
    except Exception as e:
        print(f"[-] Video gen error: {e}")
        return False


async def main():
    print("=" * 60)
    print("  Grok CF Clearance Solver + Video Gen Test")
    print("=" * 60)

    # Step 1: Get cf_clearance
    print("\n[Step 1] Getting cf_clearance via zendriver...")
    cookies = await get_cf_clearance()
    if not cookies or "cf_clearance" not in cookies:
        print("\n❌ Could not get cf_clearance. Try:")
        print("   1. Run again (CF may need multiple attempts)")
        print("   2. Manually open grok.com, solve challenge, export cookies")
        return

    # Step 2: Verify with curl_cffi
    print("\n[Step 2] Verifying CF bypass with curl_cffi...")
    ok = verify_with_curl_cffi(cookies)
    if not ok:
        print("⚠ curl_cffi still blocked. UA/TLS mismatch possible.")
        print("  Injecting anyway — Grok2API may handle it differently.")

    # Step 3: Inject into Grok2API
    print("\n[Step 3] Injecting into Grok2API...")
    inject_to_grok2api(cookies)

    # Step 4: Test video gen
    print("\n[Step 4] Testing video generation...")
    ok = test_video_gen()
    if ok:
        print("\n✅ Video generation works!")
    else:
        print("\n⚠ Video gen failed. cf_clearance may be bound to browser TLS.")
        print("  Consider running FlareSolverr or using persistent browser profile.")


if __name__ == "__main__":
    asyncio.run(main())
