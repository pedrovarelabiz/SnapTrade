"""SnapTrade Listener — HTTP API client helpers."""

import asyncio
import json
import logging

import aiohttp
import sentry_sdk

from listener_constants import API_BASE, INTERNAL_API_KEY

logger = logging.getLogger("signal_matching")

async def api_post(session, path, data):
    url = f"{API_BASE}/api/internal{path}"
    headers = {"X-Internal-Key": INTERNAL_API_KEY, "Content-Type": "application/json"}
    for attempt in range(3):
        try:
            async with session.post(
                url,
                json=data,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status in (200, 201):
                    try:
                        return await resp.json()
                    except json.JSONDecodeError as error:
                        logger.error(f"JSON error: {error}")
                        sentry_sdk.capture_exception(error)
                        sentry_sdk.set_context(
                            "api_request", {"url": url, "status_code": resp.status}
                        )
                        return None
                body = await resp.text()
                logger.warning(f"API POST {path} -> {resp.status}: {body}")
                return None
        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            logger.warning(
                f"API POST {path} attempt {attempt + 1} failed: {e}, retry in 1s"
            )
            sentry_sdk.capture_exception(e)
            sentry_sdk.set_context(
                "api_request", {"url": url, "attempt": attempt + 1, "path": path}
            )
            if attempt < 2:
                await asyncio.sleep(1)
    logger.error(f"Failed to send signal to backend after 3 attempts")
    asyncio.ensure_future(send_alert(session, f"Backend unreachable: POST {path}"))
    return None


async def api_patch(session, path, data):
    url = f"{API_BASE}/api/internal{path}"
    headers = {"X-Internal-Key": INTERNAL_API_KEY, "Content-Type": "application/json"}
    for attempt in range(3):
        try:
            async with session.patch(
                url,
                json=data,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    try:
                        return await resp.json()
                    except json.JSONDecodeError as error:
                        logger.error(f"JSON error: {error}")
                        sentry_sdk.capture_exception(error)
                        sentry_sdk.set_context(
                            "api_request", {"url": url, "status_code": resp.status}
                        )
                        return None
                body = await resp.text()
                logger.warning(f"API PATCH {path} -> {resp.status}: {body}")
                return None
        except Exception as e:
            wait = 2**attempt
            logger.warning(
                f"API PATCH {path} attempt {attempt + 1} failed: {e}, retry in {wait}s"
            )
            sentry_sdk.capture_exception(e)
            sentry_sdk.set_context(
                "api_request", {"url": url, "attempt": attempt + 1, "path": path}
            )
            await asyncio.sleep(wait)
    logger.error(f"API PATCH {path} failed after 3 attempts")
    return None


async def api_get(session, path):
    """GET with retry logic — M2 fix: aligned with api_post/api_patch."""
    url = f"{API_BASE}/api/internal{path}"
    headers = {"X-Internal-Key": INTERNAL_API_KEY}
    for attempt in range(3):
        try:
            async with session.get(
                url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    try:
                        return await resp.json()
                    except json.JSONDecodeError as error:
                        logger.error(f"JSON error: {error}")
                        sentry_sdk.capture_exception(error)
                        sentry_sdk.set_context(
                            "api_request", {"url": url, "status_code": resp.status}
                        )
                        return None
                logger.warning(
                    f"API GET {path} → {resp.status} (attempt {attempt+1}/3)"
                )
        except Exception as e:
            logger.warning(f"API GET {path} failed (attempt {attempt+1}/3): {e}")
            sentry_sdk.capture_exception(e)
            sentry_sdk.set_context(
                "api_request", {"url": url, "attempt": attempt + 1, "path": path}
            )
        if attempt < 2:
            await asyncio.sleep(2**attempt)
    return None


