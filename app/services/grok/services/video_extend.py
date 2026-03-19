"""
Direct video extension service (app-chat based).
"""

import re
import time
import uuid
from typing import Any, Dict, Optional

from app.core.exceptions import AppException, ErrorType, UpstreamException, ValidationException
from app.core.logger import logger
from app.core.config import get_config
from app.services.grok.services.model import ModelService
from app.services.grok.services.video import VideoCollectProcessor, _get_video_semaphore
from app.services.reverse.app_chat import AppChatReverse
from app.services.reverse.utils.session import ResettableSession
from app.services.token import EffortType, get_token_manager


VIDEO_MODEL_ID = "grok-imagine-1.0-video"

_RATIO_MAP = {
    "1280x720": "16:9",
    "720x1280": "9:16",
    "1792x1024": "3:2",
    "1024x1792": "2:3",
    "1024x1024": "1:1",
    "16:9": "16:9",
    "9:16": "9:16",
    "3:2": "3:2",
    "2:3": "2:3",
    "1:1": "1:1",
}


def _normalize_ratio(ratio: Optional[str]) -> str:
    value = (ratio or "2:3").strip()
    mapped = _RATIO_MAP.get(value)
    if not mapped:
        raise ValidationException(
            message=f"ratio must be one of {sorted(_RATIO_MAP.keys())}",
            param="ratio",
            code="invalid_ratio",
        )
    return mapped


def _normalize_resolution(resolution: Optional[str]) -> str:
    value = (resolution or "480p").strip()
    if value not in ("480p", "720p"):
        raise ValidationException(
            message="resolution must be one of ['480p', '720p']",
            param="resolution",
            code="invalid_resolution",
        )
    return value


def _extract_video_url(content: str) -> str:
    if not isinstance(content, str) or not content.strip():
        return ""

    md_match = re.search(r"\[video\]\(([^)\s]+)\)", content)
    if md_match:
        return md_match.group(1).strip()

    html_match = re.search(r"""<source[^>]+src=["']([^"']+)["']""", content)
    if html_match:
        return html_match.group(1).strip()

    url_match = re.search(r"""https?://[^\s"'<>]+""", content)
    if url_match:
        return url_match.group(0).strip().rstrip(".,)")

    return ""


class VideoExtendService:
    """Thin wrapper over app-chat extension payload."""

    @staticmethod
    async def extend(
        *,
        prompt: str,
        reference_id: str,
        start_time: float,
        ratio: str = "2:3",
        length: int = 6,
        resolution: str = "480p",
    ) -> Dict[str, Any]:
        prompt = (prompt or "").strip()
        if not prompt:
            raise ValidationException(
                message="prompt is required",
                param="prompt",
                code="invalid_request_error",
            )

        reference_id = (reference_id or "").strip()
        if not reference_id:
            raise ValidationException(
                message="reference_id is required",
                param="reference_id",
                code="invalid_request_error",
            )

        if start_time is None or float(start_time) < 0:
            raise ValidationException(
                message="start_time must be >= 0",
                param="start_time",
                code="invalid_start_time",
            )

        aspect_ratio = _normalize_ratio(ratio)
        video_length = int(length)
        if video_length < 1 or video_length > 30:
            raise ValidationException(
                message="length must be between 1 and 30",
                param="length",
                code="invalid_length",
            )
        resolution_name = _normalize_resolution(resolution)

        token_mgr = await get_token_manager()
        await token_mgr.reload_if_stale()

        token_info = token_mgr.get_token_for_video(
            resolution=resolution_name,
            video_length=video_length,
            pool_candidates=ModelService.pool_candidates_for_model(VIDEO_MODEL_ID),
        )
        if not token_info:
            raise AppException(
                message="No available tokens. Please try again later.",
                error_type=ErrorType.RATE_LIMIT.value,
                code="rate_limit_exceeded",
                status_code=429,
            )

        token = token_info.token
        if token.startswith("sso="):
            token = token[4:]

        # Theo curl thực tế từ Grok.com: extend chỉ là video gen thường với parentPostId
        # KHÔNG dùng isVideoExtension, extendPostId, stitchWithExtendPostId
        model_config_override = {
            "modelMap": {
                "videoGenModelConfig": {
                    "parentPostId": reference_id,
                    "aspectRatio": aspect_ratio,
                    "videoLength": video_length,
                    "isVideoEdit": False,
                    "resolutionName": resolution_name,
                }
            }
        }

        # Direct app-chat call for extension path (no auto step splitting).
        # Use browser impersonation from config (same as text2video flow)
        browser = get_config("proxy.browser")
        session = ResettableSession(impersonate=browser) if browser else ResettableSession()
        try:
            async with _get_video_semaphore():
                response = await AppChatReverse.request(
                    session,
                    token,
                    message=f"{prompt} --mode=custom",
                    model="grok-3",
                    tool_overrides={"videoGen": True},
                    model_config_override=model_config_override,
                )
                logger.info(f"VideoExtend: AppChat response received, collecting result...")
                result = await VideoCollectProcessor(VIDEO_MODEL_ID, token).process(response)
                logger.info(f"VideoExtend: Collect done, keys={list(result.keys()) if isinstance(result, dict) else type(result)}")
        finally:
            try:
                await session.close()
            except Exception:
                pass
        choices = result.get("choices") if isinstance(result, dict) else None
        if not isinstance(choices, list) or not choices:
            raise UpstreamException("Video extension failed: empty result")

        msg = choices[0].get("message", {}) if isinstance(choices[0], dict) else {}
        rendered = msg.get("content", "") if isinstance(msg, dict) else ""
        video_url = _extract_video_url(rendered)
        if not video_url:
            raise UpstreamException("Video extension failed: missing video URL")

        # Extract post_id from the collect result for extend chaining
        new_post_id = result.get("post_id", "") or ""

        model_info = ModelService.get(VIDEO_MODEL_ID)
        effort = (
            EffortType.HIGH
            if (model_info and model_info.cost.value == "high")
            else EffortType.LOW
        )
        try:
            await token_mgr.consume(token, effort)
        except Exception as e:
            logger.warning(f"Failed to record video usage: {e}")

        now = int(time.time())
        resp = {
            "id": f"video_{uuid.uuid4().hex[:24]}",
            "object": "video",
            "created_at": now,
            "completed_at": now,
            "status": "completed",
            "prompt": prompt,
            "reference_id": reference_id,
            "start_time": float(start_time),
            "ratio": aspect_ratio,
            "length": video_length,
            "resolution": resolution_name,
            "url": video_url,
        }
        if new_post_id:
            resp["post_id"] = new_post_id
        return resp


__all__ = ["VideoExtendService"]
