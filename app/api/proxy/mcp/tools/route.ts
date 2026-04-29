import { NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const agentId = url.searchParams.get("agentId")
    const qs = agentId ? `?agentId=${encodeURIComponent(agentId)}` : ""

    const response = await fetch(`${UAS_API_URL}/mcp/tools${qs}`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      cache: "no-store",
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(data || { error: "Failed to fetch tools" }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] MCP tools proxy error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
