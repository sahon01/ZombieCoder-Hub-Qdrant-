import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const response = await fetch(`${UAS_API_URL}/terminal-commands/${params.id}/use`, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to increment usage count" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Terminal commands API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
