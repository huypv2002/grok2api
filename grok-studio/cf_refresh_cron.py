"""
Auto-refresh cf_clearance every 25 minutes.
Run: python grok-studio/cf_refresh_cron.py
Or add to crontab: */25 * * * * cd /path/to/grok2api && python grok-studio/cf_refresh_cron.py >> /tmp/cf_refresh.log 2>&1
"""
import asyncio
import json
import time
import urllib.request
from solve_cf import get_cf_clearance, UA, GROK2API, GROK2API_KEY, SSO

INTERVAL = 25 * 60  # 25 minutes


def inject(cookies_dict):
    cf_clearance = cookies_dict.get("cf_clearance", "")
    cf_parts = [f"{k}={v}" for k, v in cookies_dict.items() if k not in ("sso", "sso-rw")]
    payload = json.dumps({
        "proxy": {
            "cf_clearance": cf_clearance,
            "cf_cookies": "; ".join(cf_parts),
            "user_agent": UA,
        }
    }).encode()
    req = urllib.request.Request(
        f"{GROK2API}/v1/admin/config", data=payload,
        headers={"Authorization": f"Bearer {GROK2API_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    resp = urllib.request.urlopen(req)
    return resp.read().decode()


async def refresh_once():
    print(f"[{time.strftime('%H:%M:%S')}] Refreshing cf_clearance...")
    cookies = await get_cf_clearance()
    if cookies and "cf_clearance" in cookies:
        result = inject(cookies)
        print(f"[{time.strftime('%H:%M:%S')}] OK: {result}")
        return True
    print(f"[{time.strftime('%H:%M:%S')}] FAILED to get cf_clearance")
    return False


async def main():
    print("=== CF Clearance Auto-Refresh ===")
    print(f"Interval: {INTERVAL}s ({INTERVAL//60}min)")
    while True:
        try:
            await refresh_once()
        except Exception as e:
            print(f"[{time.strftime('%H:%M:%S')}] Error: {e}")
        print(f"[{time.strftime('%H:%M:%S')}] Next refresh in {INTERVAL//60}min...")
        await asyncio.sleep(INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
