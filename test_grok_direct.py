"""
Test trực tiếp grok.com API — Flow 6 bước:
0. Lấy cf_clearance từ CF Solver (VPS Windows)
1. Parse cookies
2. Create media post
3. Conversations new (streaming) → lấy postId
4. Create share link (retry 10 lần)
5. Download video
"""

import asyncio
import hashlib
import base64
import json
import os
import re
import sys
import time
import uuid
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError

# ── Config ──
PROMPT = "A golden retriever running on a beach at sunset, cinematic slow motion, warm golden lighting"
ASPECT_RATIO = "16:9"
VIDEO_LENGTH = 6
RESOLUTION = "480p"
OUTPUT_DIR = "output"

# CF Solver chạy trên VPS Windows (cùng IP với api.liveyt.pro)
# Gọi qua IP public port 5001
CF_SOLVER_URL = "http://148.163.121.139:5001"

# ── Cookie JSON ──
COOKIE_JSON = '''
[{"domain":".grok.com","name":"sso","value":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzZXNzaW9uX2lkIjoiY2Y0YWQ5MzMtYzQxMS00MDc5LWIxMzktOTE2OWQ2ZDM2MGM0In0.LbVZVVe2Iv4ZYc3WRKQrq7cs2XEd7SRlxRXwqo6SY2c"},{"domain":".grok.com","name":"sso-rw","value":"eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzZXNzaW9uX2lkIjoiY2Y0YWQ5MzMtYzQxMS00MDc5LWIxMzktOTE2OWQ2ZDM2MGM0In0.LbVZVVe2Iv4ZYc3WRKQrq7cs2XEd7SRlxRXwqo6SY2c"},{"domain":".grok.com","name":"x-userid","value":"f0bf47b5-19df-4d38-93d4-d4fc19ba239a"},{"domain":".grok.com","name":"__cf_bm","value":"Wtjmy2z30khfU5TGlH5nZR1G.xlM8JIazoI8LAinNb8-1774622407.5323205-1.0.1.1-MSCX1gzWrjnLwH.rk.rVuI.sEIYeGqED2GUdAZPUr.6LiqufuVTWpZf731sqB0EOI3Y7ZHxCmmOBXIWjPBkPu.Siw9Nqr5ZPhadmxMkf4i02TJuZtJeUA4UoMk2dtcUg"}]
'''

try:
    from curl_cffi.requests import AsyncSession
except ImportError:
    print("Cần cài curl_cffi: pip install curl_cffi")
    sys.exit(1)


def parse_cookies(raw: str) -> dict:
    arr = json.loads(raw.strip())
    return {c["name"]: c["value"] for c in arr if c.get("name") and c.get("value")}

def build_cookie_string(cookies: dict) -> str:
    return "; ".join(f"{k}={v}" for k, v in cookies.items())

def generate_statsig_id() -> str:
    raw = uuid.uuid4().hex
    h = hashlib.sha256(raw.encode()).digest()
    return base64.b64encode(h).decode().rstrip("=")

def build_headers(cookies: dict) -> dict:
    return {
        "Cookie": build_cookie_string(cookies),
        "Content-Type": "application/json",
        "Origin": "https://grok.com",
        "Referer": "https://grok.com/imagine",
        "x-xai-request-id": str(uuid.uuid4()),
        "x-statsig-id": generate_statsig_id(),
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": '"Not:A-Brand";v="99", "Google Chrome";v="136", "Chromium";v="136"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
    }

def find_post_id(obj, depth=0) -> Optional[str]:
    if depth > 10 or obj is None:
        return None
    if isinstance(obj, dict):
        for key in ("postId", "mediaPostId", "post_id", "videoId"):
            val = obj.get(key)
            if isinstance(val, str) and len(val) > 20:
                return val
        fa = obj.get("fileAttachments")
        if isinstance(fa, list) and fa:
            first = fa[0]
            if isinstance(first, str) and len(first) > 20:
                return first
        post = obj.get("post")
        if isinstance(post, dict):
            pid = post.get("id")
            if isinstance(pid, str) and len(pid) > 20:
                return pid
        for v in obj.values():
            r = find_post_id(v, depth + 1)
            if r:
                return r
    elif isinstance(obj, list):
        for item in obj:
            r = find_post_id(item, depth + 1)
            if r:
                return r
    return None


# ═══════════════════════════════════════════
# BƯỚC 0: Lấy cf_clearance từ CF Solver
# ═══════════════════════════════════════════
async def step0_get_cf_clearance(cookies: dict) -> Optional[str]:
    print("\n═══ BƯỚC 0: Lấy cf_clearance từ CF Solver ═══")
    sso = cookies.get("sso", "")

    # Thử gọi CF Solver trên VPS
    for base_url in [CF_SOLVER_URL]:
        try:
            url = f"{base_url}/cf-clearance?url=https://grok.com&sso={sso}&timeout=90"
            print(f"  Gọi: {base_url}/cf-clearance ...")
            req = Request(url)
            resp = urlopen(req, timeout=120)
            data = json.loads(resp.read().decode())

            if data.get("cf_clearance"):
                print(f"  ✅ cf_clearance: {data['cf_clearance'][:40]}...")
                if data.get("user_agent"):
                    print(f"  ✅ User-Agent: {data['user_agent'][:60]}...")
                print(f"  ⏱ Elapsed: {data.get('elapsed', '?')}s")

                # Merge tất cả cookies từ CF Solver vào
                if data.get("all_cookies"):
                    for c in data["all_cookies"]:
                        cookies[c["name"]] = c["value"]
                else:
                    cookies["cf_clearance"] = data["cf_clearance"]

                return data["cf_clearance"]
            else:
                print(f"  ❌ Không có cf_clearance: {data.get('error', 'unknown')}")
        except URLError as e:
            print(f"  ⚠️ Không kết nối được {base_url}: {e.reason}")
        except Exception as e:
            print(f"  ⚠️ Lỗi: {e}")

    print("  ❌ Không lấy được cf_clearance từ CF Solver")
    return None


# ═══════════════════════════════════════════
# BƯỚC 1: Parse cookies
# ═══════════════════════════════════════════
async def step1_parse_cookies() -> dict:
    print("\n═══ BƯỚC 1: Parse cookies ═══")
    cookies = parse_cookies(COOKIE_JSON)
    print(f"  ✅ Parsed {len(cookies)} cookies")
    for name in ["sso", "sso-rw", "x-userid", "cf_clearance", "__cf_bm"]:
        val = cookies.get(name, "")
        status = "✅" if val else "❌ THIẾU"
        preview = val[:30] + "..." if len(val) > 30 else val
        print(f"  {status} {name}: {preview}")
    return cookies


# ═══════════════════════════════════════════
# BƯỚC 2: Create media post
# ═══════════════════════════════════════════
async def step2_create_media_post(session: AsyncSession, cookies: dict) -> Optional[str]:
    print("\n═══ BƯỚC 2: Create Media Post ═══")
    headers = build_headers(cookies)
    body = {"mediaType": "MEDIA_POST_TYPE_VIDEO", "prompt": PROMPT}

    for attempt in range(3):
        try:
            resp = await session.post(
                "https://grok.com/rest/media/post/create",
                headers=headers, json=body, impersonate="chrome136", timeout=30,
            )
            print(f"  HTTP {resp.status_code} (attempt {attempt + 1})")
            if resp.status_code == 429:
                wait = 10 * (attempt + 1)
                print(f"  ⚠️ Rate limited, đợi {wait}s...")
                await asyncio.sleep(wait)
                headers["x-xai-request-id"] = str(uuid.uuid4())
                continue
            if resp.status_code == 403:
                print(f"  ❌ 403 Forbidden — CF chặn")
                return None
            if resp.status_code != 200:
                print(f"  ❌ Lỗi: {resp.text[:300]}")
                return None
            data = resp.json()
            post_id = data.get("post", {}).get("id")
            if post_id:
                print(f"  ✅ parentPostId: {post_id}")
                return post_id
            print(f"  ❌ Không tìm thấy post.id")
            return None
        except Exception as e:
            print(f"  ❌ Exception: {e}")
            if attempt < 2: await asyncio.sleep(3)
    return None


# ═══════════════════════════════════════════
# BƯỚC 3: Conversations new (streaming)
# ═══════════════════════════════════════════
async def step3_conversations_new(session: AsyncSession, cookies: dict, parent_post_id: str) -> Optional[str]:
    print("\n═══ BƯỚC 3: Conversations New (Streaming) ═══")
    headers = build_headers(cookies)
    headers["x-xai-request-id"] = str(uuid.uuid4())
    body = {
        "temporary": True, "modelName": "grok-3",
        "message": f"{PROMPT} --mode=custom",
        "toolOverrides": {"videoGen": True}, "enableSideBySide": True,
        "responseMetadata": {"experiments": [], "modelConfigOverride": {
            "modelMap": {"videoGenModelConfig": {
                "parentPostId": parent_post_id, "aspectRatio": ASPECT_RATIO,
                "videoLength": VIDEO_LENGTH, "isVideoEdit": False, "resolutionName": RESOLUTION,
            }}
        }},
    }

    for attempt in range(3):
        try:
            resp = await session.post(
                "https://grok.com/rest/app-chat/conversations/new",
                headers=headers, json=body, impersonate="chrome136", timeout=180, stream=True,
            )
            print(f"  HTTP {resp.status_code} (attempt {attempt + 1})")
            if resp.status_code == 429:
                wait = 10 * (attempt + 1)
                print(f"  ⚠️ Rate limited, đợi {wait}s...")
                await asyncio.sleep(wait)
                headers["x-xai-request-id"] = str(uuid.uuid4())
                continue
            if resp.status_code == 403:
                print(f"  ❌ 403 Forbidden")
                return None
            if resp.status_code != 200:
                text = ""
                async for chunk in resp.aiter_content():
                    text += chunk.decode("utf-8", errors="ignore")
                    if len(text) > 500: break
                print(f"  ❌ Lỗi: {text[:500]}")
                return None

            video_post_id = None
            video_url = None
            line_count = 0
            buffer = ""
            print("  📡 Đang đọc stream...")

            async for chunk in resp.aiter_content():
                buffer += chunk.decode("utf-8", errors="ignore")
                lines = buffer.split("\n")
                buffer = lines[-1]
                for line in lines[:-1]:
                    line = line.strip()
                    if not line: continue
                    line_count += 1
                    try: data = json.loads(line)
                    except: continue
                    pid = find_post_id(data)
                    if pid and not video_post_id:
                        video_post_id = pid
                        print(f"  🎯 postId: {pid} (line {line_count})")
                    result = data.get("result", {})
                    response = result.get("response", {}) if isinstance(result, dict) else {}
                    if isinstance(response, dict):
                        vr = response.get("streamingVideoGenerationResponse", {})
                        if isinstance(vr, dict):
                            url = vr.get("videoUrl", "")
                            if url:
                                video_url = url
                                print(f"  🎬 Video URL found!")
                            progress = vr.get("progress")
                            if progress is not None:
                                print(f"  📊 Progress: {progress}%   ", end="\r")

            if buffer.strip():
                try:
                    data = json.loads(buffer.strip())
                    pid = find_post_id(data)
                    if pid and not video_post_id: video_post_id = pid
                except: pass

            print(f"\n  📊 Đã đọc {line_count} dòng")
            if video_post_id:
                print(f"  ✅ Video postId: {video_post_id}")
                return video_post_id
            print(f"  ❌ Không tìm thấy postId")
            return None
        except Exception as e:
            print(f"  ❌ Exception: {e}")
            if attempt < 2: await asyncio.sleep(5)
    return None


# ═══════════════════════════════════════════
# BƯỚC 4: Create share link
# ═══════════════════════════════════════════
async def step4_create_share_link(session: AsyncSession, cookies: dict, post_id: str) -> bool:
    print("\n═══ BƯỚC 4: Create Share Link ═══")
    headers = build_headers(cookies)
    for attempt in range(10):
        try:
            headers["x-xai-request-id"] = str(uuid.uuid4())
            resp = await session.post(
                "https://grok.com/rest/media/post/create-link",
                headers=headers, json={"postId": post_id}, impersonate="chrome136", timeout=30,
            )
            print(f"  Attempt {attempt + 1}/10 — HTTP {resp.status_code}")
            if resp.status_code == 200:
                print(f"  ✅ Share link created")
                return True
            if resp.status_code == 429:
                await asyncio.sleep(10)
                continue
            print(f"  ⏳ Đợi 5s...")
            await asyncio.sleep(5)
        except Exception as e:
            print(f"  ❌ {e}")
            await asyncio.sleep(5)
    return False


# ═══════════════════════════════════════════
# BƯỚC 5: Download video
# ═══════════════════════════════════════════
async def step5_download_video(session: AsyncSession, post_id: str) -> Optional[str]:
    print("\n═══ BƯỚC 5: Download Video ═══")
    url = f"https://imagine-public.x.ai/imagine-public/share-videos/{post_id}.mp4?cache=1&dl=1"
    print(f"  URL: {url}")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    prompt_clean = re.sub(r'[^a-zA-Z0-9 ]', '', PROMPT)[:30].strip().replace(' ', '_')
    filename = f"001_{prompt_clean}_{post_id[:8]}.mp4"
    filepath = os.path.join(OUTPUT_DIR, filename)

    for attempt in range(4):
        try:
            resp = await session.get(url, impersonate="chrome136", timeout=60)
            print(f"  Attempt {attempt + 1}/4 — HTTP {resp.status_code}, size: {len(resp.content)} bytes")
            if resp.status_code == 200 and len(resp.content) > 10000:
                with open(filepath, "wb") as f:
                    f.write(resp.content)
                print(f"  ✅ Saved: {filepath} ({len(resp.content) / 1024:.1f} KB)")
                return filepath
            print(f"  ⏳ Đợi 10s...")
            await asyncio.sleep(10)
        except Exception as e:
            print(f"  ❌ {e}")
            await asyncio.sleep(5)
    return None


# ═══════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════
async def main():
    print("=" * 60)
    print("  TEST GROK.COM DIRECT API — Text to Video")
    print(f"  CF Solver: {CF_SOLVER_URL}")
    print("=" * 60)
    print(f"  Prompt: {PROMPT[:60]}...")
    print(f"  Ratio: {ASPECT_RATIO}, Length: {VIDEO_LENGTH}s, Res: {RESOLUTION}")

    # Bước 1: Parse cookies
    cookies = await step1_parse_cookies()
    if not cookies.get("sso"):
        print("\n❌ DỪNG: Thiếu SSO cookie")
        return

    # Bước 0: Lấy cf_clearance
    cf = await step0_get_cf_clearance(cookies)
    if not cf:
        print("\n⚠️ Không có cf_clearance, thử tiếp (có thể bị 403)...")

    async with AsyncSession() as session:
        # Bước 2
        parent_post_id = await step2_create_media_post(session, cookies)
        if not parent_post_id:
            print("\n❌ DỪNG: Không tạo được media post")
            return

        # Bước 3
        video_post_id = await step3_conversations_new(session, cookies, parent_post_id)
        if not video_post_id:
            print("\n❌ DỪNG: Không lấy được video postId")
            return

        # Bước 4
        await step4_create_share_link(session, cookies, video_post_id)

        # Bước 5
        filepath = await step5_download_video(session, video_post_id)

        print("\n" + "=" * 60)
        if filepath:
            print(f"  🎉 THÀNH CÔNG! Video: {filepath}")
        else:
            print(f"  ❌ THẤT BẠI")
            print(f"  💡 Thử: https://imagine-public.x.ai/imagine-public/share-videos/{video_post_id}.mp4")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
