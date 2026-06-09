from __future__ import annotations

import json
from typing import Any

import httpx

from .config import SETTINGS


MCP_SESSION_ID_HEADER = "mcp-session-id"


def _parse_sse_json(text: str) -> dict[str, Any]:
    chunks = [chunk.strip() for chunk in text.split("\n\n") if chunk.strip()]
    for chunk in chunks:
        data_lines = []
        for line in chunk.splitlines():
            if line.startswith("data:"):
                data_lines.append(line[5:].strip())
        if data_lines:
            return json.loads("\n".join(data_lines))
    raise ValueError(f"Unable to parse MCP SSE payload: {text[:200]}")


def _parse_json_or_sse(text: str, content_type: str) -> dict[str, Any]:
    if "text/event-stream" in content_type or text.lstrip().startswith("event:"):
        return _parse_sse_json(text)
    return json.loads(text)


class McpHttpClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url
        self.protocol_version = SETTINGS.protocol_version

    async def _post_json(
        self,
        client: httpx.AsyncClient,
        body: dict[str, Any],
        session_id: str | None = None,
    ) -> tuple[httpx.Response, dict[str, Any]]:
        headers = {
            "accept": "application/json, text/event-stream",
            "content-type": "application/json",
            "mcp-protocol-version": self.protocol_version,
        }
        if session_id:
            headers[MCP_SESSION_ID_HEADER] = session_id
        response = await client.post(self.base_url, headers=headers, json=body)
        response.raise_for_status()
        payload = _parse_json_or_sse(
            response.text,
            response.headers.get("content-type", ""),
        )
        return response, payload

    async def call_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=600.0) as client:
            init_response, init_payload = await self._post_json(
                client,
                {
                    "jsonrpc": "2.0",
                    "id": "init-1",
                    "method": "initialize",
                    "params": {
                        "protocolVersion": self.protocol_version,
                        "capabilities": {},
                        "clientInfo": {
                            "name": "materials-demo-teaching",
                            "version": "0.1.0",
                        },
                    },
                },
            )
            session_id = init_response.headers.get(MCP_SESSION_ID_HEADER)
            negotiated = (
                init_payload.get("result", {}).get("protocolVersion")
                or self.protocol_version
            )
            notify_headers = {
                "accept": "application/json, text/event-stream",
                "content-type": "application/json",
                "mcp-protocol-version": negotiated,
            }
            if session_id:
                notify_headers[MCP_SESSION_ID_HEADER] = session_id
            await client.post(
                self.base_url,
                headers=notify_headers,
                json={
                    "jsonrpc": "2.0",
                    "method": "notifications/initialized",
                    "params": {},
                },
            )
            _, tool_payload = await self._post_json(
                client,
                {
                    "jsonrpc": "2.0",
                    "id": "call-1",
                    "method": "tools/call",
                    "params": {
                        "name": tool_name,
                        "arguments": arguments,
                    },
                },
                session_id=session_id,
            )
            if session_id:
                try:
                    await client.delete(
                        self.base_url,
                        headers={
                            "mcp-protocol-version": negotiated,
                            MCP_SESSION_ID_HEADER: session_id,
                        },
                    )
                except httpx.HTTPError:
                    pass
        result = tool_payload.get("result", {})
        return {
            "content": result.get("content", []),
            "structuredContent": result.get("structuredContent"),
            "isError": bool(result.get("isError")),
        }
