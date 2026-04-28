import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const uasApiUrl = process.env.UAS_API_URL
  const uasApiKey = process.env.UAS_API_KEY

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 })
  }

  try {
    const body = await request.json()

    const response = await fetch(`${uasApiUrl}/cli-agent/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to execute command" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] CLI command execution error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
