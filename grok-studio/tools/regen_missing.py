#!/usr/bin/env python3
"""
Regenerate missing videos for user grhvphanlinh001@grok.com (user_id=21)
Uses admin account to generate, then updates user 21's failed record with the result.
"""
import json, time, sys, requests

BASE = "https://grok.liveyt.pro"
ADMIN_EMAIL = "kh431248@gmail.com"
ADMIN_PASS = "admin123"
TARGET_USER_ID = 21

# Login as admin
print("🔑 Đăng nhập admin...")
r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
if r.status_code != 200:
    print(f"❌ Login failed: {r.text}")
    sys.exit(1)
token = r.json()["token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
print("✅ Đăng nhập thành công")

# Get all history for user 21
print(f"\n📋 Lấy lịch sử user {TARGET_USER_ID}...")
r = requests.get(f"{BASE}/api/admin/history?user_id={TARGET_USER_ID}&limit=500", headers=headers, timeout=30)
history = r.json().get("history", [])

completed = set()
for h in history:
    if h["status"] == "completed":
        completed.add(h.get("prompt", "").strip())

# Find unique failed prompts not in completed, keep the FIRST failed record ID
failed_map = {}  # prompt -> first failed record id
for h in history:
    p = h.get("prompt", "").strip()
    if h["status"] == "failed" and p not in completed and p not in failed_map:
        failed_map[p] = h["id"]

print(f"   Completed: {len(completed)}, Missing: {len(failed_map)}")

if not failed_map:
    print("✅ Không có prompt nào thiếu!")
    sys.exit(0)

# Generate each missing video
for i, (prompt, failed_id) in enumerate(failed_map.items()):
    print(f"\n[{i+1}/{len(failed_map)}] Generating video...")
    print(f"   Prompt: {prompt[:100]}...")
    print(f"   Will update record #{failed_id}")

    max_retries = 5
    for attempt in range(1, max_retries + 1):
        try:
            r = requests.post(
                f"{BASE}/api/generate",
                json={
                    "type": "text2video",
                    "prompt": prompt,
                    "aspect_ratio": "16:9",
                    "video_length": 6,
                    "resolution": "480p",
                },
                headers=headers,
                timeout=300,
            )
            result = r.json()

            if r.status_code == 200 and result.get("success"):
                output_url = result.get("outputUrl", "")
                print(f"   ✅ Video created! URL: {output_url[:80]}...")

                # Update the failed record in user 21's history
                ur = requests.put(
                    f"{BASE}/api/admin/history/{failed_id}",
                    json={"status": "completed", "output_url": output_url},
                    headers=headers,
                    timeout=30,
                )
                if ur.status_code == 200:
                    print(f"   ✅ Record #{failed_id} updated → completed")
                else:
                    print(f"   ⚠️ Update failed: {ur.text[:200]}")
                break  # success, move to next prompt

            else:
                error_msg = result.get("error", r.text[:200])
                print(f"   ❌ Attempt {attempt}: {error_msg[:150]}")
                if r.status_code == 429 or "rate" in str(error_msg).lower() or "limit" in str(error_msg).lower():
                    print("   ⏳ Rate limited, đợi 60s...")
                    time.sleep(60)
                elif "502" in str(error_msg) or "503" in str(error_msg) or "SERVER_ERROR" in str(error_msg):
                    print(f"   ⏳ Server error, đợi 15s rồi thử lại...")
                    time.sleep(15)
                else:
                    print(f"   ⏳ Đợi 10s rồi thử lại...")
                    time.sleep(10)

        except Exception as e:
            print(f"   ❌ Attempt {attempt} exception: {e}")
            time.sleep(10)
    else:
        print(f"   ❌ Hết {max_retries} lần thử, bỏ qua prompt này")

print("\n🏁 Hoàn tất!")
