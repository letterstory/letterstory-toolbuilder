import { NextResponse } from "next/server";
import { dispatchToolCall, McpDispatchError } from "@/lib/mcp/dispatch";
import { listMcpTools } from "@/lib/mcp/registry";

function jsonRpcResult(id: unknown, result: unknown) {
	return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function jsonRpcError(id: unknown, code: number, message: string, data?: unknown) {
	return NextResponse.json({
		jsonrpc: "2.0",
		id,
		error: data === undefined ? { code, message } : { code, message, data },
	});
}

export function GET(request: Request) {
	const url = new URL(request.url);
	return NextResponse.json({
		name: "letterstory-toolbuilder",
		version: "0.1.0",
		protocol: "json-rpc-2.0",
		endpoint: `${url.origin}/api/mcp`,
		tools: listMcpTools(),
	});
}

export async function POST(request: Request) {
	const body = (await request.json().catch(() => null)) as {
		jsonrpc?: unknown;
		id?: unknown;
		method?: unknown;
		params?: Record<string, unknown> | null;
	} | null;

	if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
		return jsonRpcError(body?.id ?? null, -32600, "Invalid JSON-RPC request.");
	}

	try {
		switch (body.method) {
			case "initialize":
				return jsonRpcResult(body.id ?? null, {
					protocolVersion: "2026-09-05",
					serverInfo: { name: "letterstory-toolbuilder", version: "0.1.0" },
					capabilities: { tools: { listChanged: false } },
				});
			case "ping":
				return jsonRpcResult(body.id ?? null, { ok: true });
			case "tools/list":
				return jsonRpcResult(body.id ?? null, { tools: listMcpTools() });
			case "tools/call": {
				const name = typeof body.params?.name === "string" ? body.params.name : null;
				if (!name) {
					return jsonRpcError(body.id ?? null, -32602, "tools/call requires a tool name.");
				}
				const result = await dispatchToolCall({
					name,
					arguments: body.params?.arguments ?? {},
					request,
				});
				return jsonRpcResult(body.id ?? null, result);
			}
			default:
				return jsonRpcError(body.id ?? null, -32601, `Unknown method: ${body.method}`);
		}
	} catch (error) {
		if (error instanceof McpDispatchError) {
			return jsonRpcError(body.id ?? null, error.code, error.message, error.data);
		}

		const message = error instanceof Error ? error.message : String(error);
		console.error("[api/mcp]", message);
		return jsonRpcError(body.id ?? null, -32000, message);
	}
}
