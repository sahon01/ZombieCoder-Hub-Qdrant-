import { NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const response = await fetch(`${UAS_API_URL}/cli-agent/execute-registered`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(data || { error: "Failed to execute command" }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] CLI execute-registered proxy error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
