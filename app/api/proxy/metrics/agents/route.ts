import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const uasApiUrl = process.env.UAS_API_URL || "http://localhost:8000"

  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range")
    const url = range ? `${uasApiUrl}/metrics/agents?range=${encodeURIComponent(range)}` : `${uasApiUrl}/metrics/agents`

    const response = await fetch(url, { cache: "no-store" })
    const data = await response.json().catch(() => ({}))

    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error("[v0] Metrics agents proxy error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
