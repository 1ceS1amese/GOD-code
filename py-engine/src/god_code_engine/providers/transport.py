from __future__ import annotations

from collections.abc import Iterator
import json
import socket
import urllib.error
import urllib.request

from god_code_engine.providers.errors import (
    infer_provider_from_url,
    map_http_error_to_info,
    map_invalid_response_to_info,
    map_network_error_to_info,
)
from god_code_engine.providers.http_client import ProviderClientError
from god_code_engine.types import JsonMapping

_MAX_ERROR_BODY_BYTES = 64 * 1024


class HttpTransport:
    def post_json(
        self,
        url: str,
        headers: JsonMapping,
        body: JsonMapping,
        timeout_s: float,
    ) -> JsonMapping:
        raise NotImplementedError("HttpTransport.post_json must be implemented.")

    def post_sse(
        self,
        url: str,
        headers: JsonMapping,
        body: JsonMapping,
        timeout_s: float,
    ) -> Iterator[str]:
        raise NotImplementedError("HttpTransport.post_sse must be implemented.")


class UrllibHttpTransport(HttpTransport):
    def post_json(
        self,
        url: str,
        headers: JsonMapping,
        body: JsonMapping,
        timeout_s: float,
    ) -> JsonMapping:
        encoded_body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            url=url,
            data=encoded_body,
            headers={key: str(value) for key, value in headers.items()},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=timeout_s) as response:
                raw_body = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            raise _provider_http_error_from_exception(url, exc) from exc
        except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
            raise ProviderClientError.from_error_info(
                map_network_error_to_info(provider=infer_provider_from_url(url))
            ) from exc

        try:
            decoded = json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise ProviderClientError.from_error_info(
                map_invalid_response_to_info(provider=infer_provider_from_url(url))
            ) from exc

        if not isinstance(decoded, dict):
            raise ProviderClientError.from_error_info(
                map_invalid_response_to_info(provider=infer_provider_from_url(url))
            )
        return dict(decoded)

    def post_sse(
        self,
        url: str,
        headers: JsonMapping,
        body: JsonMapping,
        timeout_s: float,
    ) -> Iterator[str]:
        encoded_body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            url=url,
            data=encoded_body,
            headers={key: str(value) for key, value in headers.items()},
            method="POST",
        )

        try:
            response = urllib.request.urlopen(request, timeout=timeout_s)
        except urllib.error.HTTPError as exc:
            raise _provider_http_error_from_exception(url, exc) from exc
        except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
            raise ProviderClientError.from_error_info(
                map_network_error_to_info(provider=infer_provider_from_url(url))
            ) from exc

        content_type = response.headers.get("Content-Type", "")
        if "text/event-stream" not in content_type.lower():
            response.close()
            raise ProviderClientError.from_error_info(
                map_invalid_response_to_info(provider=infer_provider_from_url(url))
            )

        def iter_lines() -> Iterator[str]:
            with response:
                try:
                    for raw_line in response:
                        if isinstance(raw_line, bytes):
                            yield raw_line.decode("utf-8").rstrip("\r\n")
                        else:
                            yield str(raw_line).rstrip("\r\n")
                except UnicodeDecodeError as exc:
                    raise ProviderClientError.from_error_info(
                        map_invalid_response_to_info(provider=infer_provider_from_url(url))
                    ) from exc
                except (urllib.error.URLError, socket.timeout, TimeoutError, OSError) as exc:
                    raise ProviderClientError.from_error_info(
                        map_network_error_to_info(provider=infer_provider_from_url(url))
                    ) from exc

        return iter_lines()


def _is_retryable_http_status(status_code: int) -> bool:
    return status_code == 429 or status_code in {500, 502, 503, 504}


def _provider_http_error_from_exception(url: str, exc: urllib.error.HTTPError) -> ProviderClientError:
    body = _read_http_error_body(exc)
    info = map_http_error_to_info(
        exc.code,
        body,
        provider=infer_provider_from_url(url),
    )
    return ProviderClientError.from_error_info(info)


def _read_http_error_body(exc: urllib.error.HTTPError) -> object:
    try:
        raw = exc.read(_MAX_ERROR_BODY_BYTES + 1)
    except Exception:  # noqa: BLE001
        return None
    if len(raw) > _MAX_ERROR_BODY_BYTES:
        raw = raw[:_MAX_ERROR_BODY_BYTES]
    text = raw.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None
