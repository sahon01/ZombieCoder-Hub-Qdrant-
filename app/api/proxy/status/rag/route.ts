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

export async function POST(request: NextRequest) {
  const uasApiUrl = process.env.UAS_API_URL || "http://localhost:8000"
  const uasApiKey = process.env.UAS_API_KEY

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const action = String(searchParams.get("action") || "").trim()

  const mapActionToPath = (a: string): string | null => {
    if (a === "auto_indexer_start") return "/status/rag/auto-indexer/start"
    if (a === "auto_indexer_stop") return "/status/rag/auto-indexer/stop"
    if (a === "ingest_metadata") return "/status/rag/ingest/metadata"
    if (a === "ingest_file") return "/status/rag/ingest/file"
    return null
  }

  const path = mapActionToPath(action)
  if (!path) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }

  let body: any = null
  try {
    body = await request.json().catch(() => null)
  } catch {
    body = null
  }

  try {
    const response = await fetch(`${uasApiUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      body: body ? JSON.stringify(body) : undefined,
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
    console.error("[v0] RAG control proxy error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
