import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text().catch(() => "")

    const response = await fetch(`${UAS_API_URL}/mcp/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      body: bodyText,
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(data || { error: "Failed to execute tool" }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] MCP execute proxy error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
