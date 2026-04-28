import { NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function GET() {
  try {
    const response = await fetch(`${UAS_API_URL}/cli-agent/commands`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      cache: "no-store",
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return NextResponse.json(data || { error: "Failed to load commands" }, { status: response.status })
    }
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] CLI commands proxy error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const response = await fetch(`${UAS_API_URL}/cli-agent/commands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return NextResponse.json(data || { error: "Failed to create command" }, { status: response.status })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error("[v0] CLI command create proxy error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
