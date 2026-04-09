"""API Client for posting signals to backend with Sentry error tracking."""

import asyncio
import json
import logging
import os
from typing import Optional, Dict, Any

import aiohttp
import sentry_sdk

logger = logging.getLogger(__name__)

# Configuration
BACKEND_URL = os.getenv("BACKEND_URL") or os.getenv("API_BASE", "http://127.0.0.1:3001")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")


async def post_signal(session: aiohttp.ClientSession, path: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    POST signal data to backend API with retry logic and Sentry error tracking.

    Args:
        session: aiohttp client session
        path: API endpoint path (e.g., "/signals")
        data: Signal data to post

    Returns:
        Response JSON if successful, None otherwise
    """
    url = f"{BACKEND_URL}/api/internal{path}"
    headers = {"X-Internal-Key": INTERNAL_API_KEY, "Content-Type": "application/json"}

    for attempt in range(3):
        try:
            async with session.post(
                url, json=data, headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status in (200, 201):
                    try:
                        return await resp.json()
                    except json.JSONDecodeError as error:
                        logger.error(f"JSON decode error: {error}")
                        sentry_sdk.capture_exception(error)
                        sentry_sdk.set_context("api_request", {
                            "url": url,
                            "status_code": resp.status,
                            "path": path
                        })
                        return None

                body = await resp.text()
                logger.warning(f"API POST {path} -> {resp.status}: {body}")
                sentry_sdk.set_context("api_request", {
                    "url": url,
                    "status_code": resp.status,
                    "path": path,
                    "response_body": body[:500]  # Limit body size in context
                })
                return None

        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            logger.warning(f"API POST {path} attempt {attempt + 1}/3 failed: {e}")
            sentry_sdk.capture_exception(e)
            sentry_sdk.set_context("api_request", {
                "url": url,
                "path": path,
                "attempt": attempt + 1,
                "error_type": type(e).__name__
            })

            if attempt < 2:
                await asyncio.sleep(1)

    logger.error(f"Failed to post signal to {path} after 3 attempts")
    return None


async def patch_signal(session: aiohttp.ClientSession, path: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    PATCH signal data to backend API with retry logic and Sentry error tracking.

    Args:
        session: aiohttp client session
        path: API endpoint path (e.g., "/signals/123")
        data: Update data to patch

    Returns:
        Response JSON if successful, None otherwise
    """
    url = f"{BACKEND_URL}/api/internal{path}"
    headers = {"X-Internal-Key": INTERNAL_API_KEY, "Content-Type": "application/json"}

    for attempt in range(3):
        try:
            async with session.patch(
                url, json=data, headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    try:
                        return await resp.json()
                    except json.JSONDecodeError as error:
                        logger.error(f"JSON decode error: {error}")
                        sentry_sdk.capture_exception(error)
                        sentry_sdk.set_context("api_request", {
                            "url": url,
                            "status_code": resp.status,
                            "path": path
                        })
                        return None

                body = await resp.text()
                logger.warning(f"API PATCH {path} -> {resp.status}: {body}")
                sentry_sdk.set_context("api_request", {
                    "url": url,
                    "status_code": resp.status,
                    "path": path,
                    "response_body": body[:500]
                })
                return None

        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            wait = 2 ** attempt
            logger.warning(f"API PATCH {path} attempt {attempt + 1}/3 failed: {e}, retry in {wait}s")
            sentry_sdk.capture_exception(e)
            sentry_sdk.set_context("api_request", {
                "url": url,
                "path": path,
                "attempt": attempt + 1,
                "error_type": type(e).__name__
            })

            if attempt < 2:
                await asyncio.sleep(wait)

    logger.error(f"Failed to patch signal at {path} after 3 attempts")
    return None


async def get_signal(session: aiohttp.ClientSession, path: str) -> Optional[Dict[str, Any]]:
    """
    GET signal data from backend API with retry logic and Sentry error tracking.

    Args:
        session: aiohttp client session
        path: API endpoint path (e.g., "/signals/123")

    Returns:
        Response JSON if successful, None otherwise
    """
    url = f"{BACKEND_URL}/api/internal{path}"
    headers = {"X-Internal-Key": INTERNAL_API_KEY}

    for attempt in range(3):
        try:
            async with session.get(
                url, headers=headers,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    try:
                        return await resp.json()
                    except json.JSONDecodeError as error:
                        logger.error(f"JSON decode error: {error}")
                        sentry_sdk.capture_exception(error)
                        sentry_sdk.set_context("api_request", {
                            "url": url,
                            "status_code": resp.status,
                            "path": path
                        })
                        return None

                logger.warning(f"API GET {path} -> {resp.status} (attempt {attempt+1}/3)")
                sentry_sdk.set_context("api_request", {
                    "url": url,
                    "status_code": resp.status,
                    "path": path,
                    "attempt": attempt + 1
                })

        except (aiohttp.ClientError, asyncio.TimeoutError) as e:
            logger.warning(f"API GET {path} failed (attempt {attempt+1}/3): {e}")
            sentry_sdk.capture_exception(e)
            sentry_sdk.set_context("api_request", {
                "url": url,
                "path": path,
                "attempt": attempt + 1,
                "error_type": type(e).__name__
            })

        if attempt < 2:
            await asyncio.sleep(2 ** attempt)

    logger.error(f"Failed to get signal from {path} after 3 attempts")
    return None
