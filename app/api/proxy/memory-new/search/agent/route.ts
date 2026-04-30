import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const uasApiUrl = process.env.UAS_API_URL || "http://localhost:8000"
  const uasApiKey = process.env.UAS_API_KEY

  let body: any = null
  try {
    body = await request.json().catch(() => null)
  } catch {
    body = null
  }

  try {
    const response = await fetch(`${uasApiUrl}/memory-new/search/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      body: JSON.stringify(body || {}),
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
    console.error("[v0] memory-new agent search error:", error)
    return NextResponse.json({ success: false, error: "Connection failed" }, { status: 503 })
  }
}
