import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params

    const response = await fetch(`${UAS_API_URL}/providers/${id}/test`, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
    })

    const text = await response.text()
    let payload: any = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }

    if (!response.ok) {
      return NextResponse.json(
        payload || { error: "Failed to test provider", message: response.statusText },
        { status: response.status },
      )
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error("[v0] Providers API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
