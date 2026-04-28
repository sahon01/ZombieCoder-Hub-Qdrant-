import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const response = await fetch(`${UAS_API_URL}/chat/speech-to-text`, {
      method: "POST",
      headers: {
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      body: formData,
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to transcribe audio" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
