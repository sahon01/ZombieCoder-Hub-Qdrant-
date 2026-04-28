import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const uasApiUrl = process.env.UAS_API_URL || "http://localhost:8000"
  const uasApiKey = process.env.UAS_API_KEY

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()

  try {
    const response = await fetch(`${uasApiUrl}/status/rag${qs ? `?${qs}` : ""}`, {
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

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.error || "Failed to fetch RAG status",
          message: payload?.message || response.statusText,
          payload,
        },
        { status: response.status },
      )
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error("[v0] RAG status fetch error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
