import { type NextRequest, NextResponse } from "next/server"

export async function GET() {
  const uasApiUrl = process.env.UAS_API_URL
  const uasApiKey = process.env.UAS_API_KEY

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 })
  }

  try {
    const response = await fetch(`${uasApiUrl}/prompt-templates`, {
      headers: {
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json([], { status: 200 })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Templates fetch error:", error)
    return NextResponse.json([], { status: 200 })
  }
}

export async function POST(request: NextRequest) {
  const uasApiUrl = process.env.UAS_API_URL
  const uasApiKey = process.env.UAS_API_KEY

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 })
  }

  try {
    const body = await request.json()

    const response = await fetch(`${uasApiUrl}/prompt-templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to create template" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Template create error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
