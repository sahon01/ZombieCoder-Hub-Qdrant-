import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get("conversationId")
    const limit = searchParams.get("limit") || "50"

    const queryParams = new URLSearchParams()
    if (conversationId) queryParams.append("conversationId", conversationId)
    queryParams.append("limit", limit)

    const response = await fetch(`${UAS_API_URL}/chat/history?${queryParams}`, {
      headers: {
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch chat history" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
