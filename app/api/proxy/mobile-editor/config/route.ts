import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const mobileEditorUrl = process.env.MOBILE_EDITOR_API_URL

  if (!mobileEditorUrl) {
    return NextResponse.json({ error: "Mobile Editor API not configured" }, { status: 503 })
  }

  try {
    const body = await request.json()

    const response = await fetch(`${mobileEditorUrl}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to save config" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Mobile editor config error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
