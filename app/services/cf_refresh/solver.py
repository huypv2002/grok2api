"""
CF clearance solver — hỗ trợ 2 backend:
1. FlareSolverr (Docker) — cách cũ
2. CF Clearance Server (patchright, localhost:5001) — cách mới, chạy trên cùng VPS
"""

import asyncio
import json
import re
from typing import Optional, Dict
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError

from loguru import logger

from .config import GROK_URL, get_timeout, get_proxy, get_flaresolverr_url

# CF Clearance Server chạy cùng VPS
CF_SOLVER_LOCAL = "http://localhost:5001"


def _extract_all_cookies(cookies: list[dict]) -> str:
    return "; ".join([f"{c.get('name')}={c.get('value')}" for c in cookies])


def _extract_cookie_value(cookies: list[dict], name: str) -> str:
    for cookie in cookies:
        if cookie.get("name") == name:
            return cookie.get("value") or ""
    return ""


def _extract_user_agent(solution: dict) -> str:
    return solution.get("userAgent", "") or solution.get("user_agent", "")


def _extract_browser_profile(user_agent: str) -> str:
    match = re.search(r"Chrome/(\d+)", user_agent)
    if match:
        return f"chrome{match.group(1)}"
    return "chrome136"


def _get_sso_token() -> str:
    """Lấy SSO token hiện tại từ token manager để inject vào browser."""
    try:
        from app.core.config import get_config
        # Thử lấy từ config proxy (nếu đã inject trước đó)
        return get_config("proxy.sso_token", "") or ""
    except Exception:
        return ""


async def _solve_via_cf_server(sso_token: str = "") -> Optional[Dict[str, str]]:
    """Gọi CF Clearance Server (patchright) chạy trên localhost:5001."""
    cf_timeout = get_timeout()

    params = f"url={GROK_URL}&timeout={cf_timeout}"
    if sso_token:
        params += f"&sso={sso_token}"

    url = f"{CF_SOLVER_LOCAL}/cf-clearance?{params}"
    logger.info(f"Gọi CF Solver: {CF_SOLVER_LOCAL}/cf-clearance (sso={'yes' if sso_token else 'no'})")

    req = urllib_request.Request(url)

    try:
        def _get():
            with urllib_request.urlopen(req, timeout=cf_timeout + 30) as resp:
                return json.loads(resp.read().decode("utf-8"))

        result = await asyncio.to_thread(_get)

        cf_clearance = result.get("cf_clearance", "")
        if not cf_clearance:
            logger.error(f"CF Solver không trả cf_clearance: {result.get('error', 'unknown')}")
            return None

        ua = result.get("user_agent", "")
        browser = _extract_browser_profile(ua)
        cookies_str = result.get("cookies", "")
        elapsed = result.get("elapsed", 0)

        logger.info(f"CF Solver thành công: cf_clearance (elapsed: {elapsed}s, browser: {browser})")

        return {
            "cookies": cookies_str,
            "cf_clearance": cf_clearance,
            "user_agent": ua,
            "browser": browser,
        }

    except URLError as e:
        logger.warning(f"CF Solver không khả dụng ({CF_SOLVER_LOCAL}): {e.reason}")
        return None
    except Exception as e:
        logger.warning(f"CF Solver lỗi: {e}")
        return None


async def _solve_via_flaresolverr() -> Optional[Dict[str, str]]:
    """Gọi FlareSolverr (Docker) — cách cũ."""
    flaresolverr_url = get_flaresolverr_url()
    cf_timeout = get_timeout()
    proxy = get_proxy()

    if not flaresolverr_url:
        return None

    url = f"{flaresolverr_url.rstrip('/')}/v1"
    payload = {
        "cmd": "request.get",
        "url": GROK_URL,
        "maxTimeout": cf_timeout * 1000,
    }
    if proxy:
        payload["proxy"] = {"url": proxy}

    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}

    logger.info(f"Gọi FlareSolverr: {url}")
    req = urllib_request.Request(url, data=body, method="POST", headers=headers)

    try:
        def _post():
            with urllib_request.urlopen(req, timeout=cf_timeout + 30) as resp:
                return json.loads(resp.read().decode("utf-8"))

        result = await asyncio.to_thread(_post)

        status = result.get("status", "")
        if status != "ok":
            logger.error(f"FlareSolverr lỗi: {status} - {result.get('message', '')}")
            return None

        solution = result.get("solution", {})
        cookies = solution.get("cookies", [])
        if not cookies:
            logger.error("FlareSolverr không trả cookies")
            return None

        cookie_str = _extract_all_cookies(cookies)
        clearance = _extract_cookie_value(cookies, "cf_clearance")
        ua = _extract_user_agent(solution)
        browser = _extract_browser_profile(ua)

        logger.info(f"FlareSolverr thành công: {len(cookies)} cookies, browser: {browser}")
        return {
            "cookies": cookie_str,
            "cf_clearance": clearance,
            "user_agent": ua,
            "browser": browser,
        }

    except HTTPError as e:
        body_text = e.read().decode("utf-8", "replace")[:300]
        logger.error(f"FlareSolverr HTTP error: {e.code} - {body_text}")
        return None
    except URLError as e:
        logger.warning(f"FlareSolverr không khả dụng: {e.reason}")
        return None
    except Exception as e:
        logger.error(f"FlareSolverr lỗi: {e}")
        return None


async def solve_cf_challenge() -> Optional[Dict[str, str]]:
    """
    Thử lấy cf_clearance theo thứ tự:
    1. CF Clearance Server (patchright, localhost:5001) — ưu tiên
    2. FlareSolverr (Docker) — fallback
    """
    sso_token = _get_sso_token()

    # 1. Thử CF Solver local trước
    result = await _solve_via_cf_server(sso_token)
    if result and result.get("cf_clearance"):
        return result

    # 2. Fallback sang FlareSolverr
    logger.info("CF Solver thất bại, thử FlareSolverr...")
    result = await _solve_via_flaresolverr()
    if result and result.get("cf_clearance"):
        return result

    logger.error("Không lấy được cf_clearance từ bất kỳ backend nào")
    return None
