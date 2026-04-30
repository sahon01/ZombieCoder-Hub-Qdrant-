import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get("limit") || "50"
  const sessionId = searchParams.get("sessionId") || ""

  const uasApiUrl = process.env.UAS_API_URL || "http://localhost:8000"
  const uasApiKey = process.env.UAS_API_KEY

  try {
    const qs = new URLSearchParams({ limit })
    if (sessionId.trim()) qs.set("sessionId", sessionId.trim())

    const response = await fetch(`${uasApiUrl}/memory-new/agent/${encodeURIComponent(agentId)}?${qs.toString()}`, {
      headers: {
        "Content-Type": "application/json",
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      cache: "no-store",
    })

    const text = await response.text()
    let payload: any = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = text
    }

    return NextResponse.json(payload, { status: response.status })
  } catch (error) {
    console.error("[v0] memory-new agent fetch error:", error)
    return NextResponse.json({ success: false, error: "Connection failed" }, { status: 503 })
  }
}
