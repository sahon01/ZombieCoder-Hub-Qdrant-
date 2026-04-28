import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const audioApiUrl = process.env.NEXT_PUBLIC_AUDIO_API || process.env.UAS_API_URL

  if (!audioApiUrl) {
    return NextResponse.json({ error: "Audio API not configured" }, { status: 503 })
  }

  try {
    const formData = await request.formData()

    const response = await fetch(`${audioApiUrl}/audio/process`, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to process audio" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Audio processing error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
