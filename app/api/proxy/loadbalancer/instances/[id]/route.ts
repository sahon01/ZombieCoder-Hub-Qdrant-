import { type NextRequest, NextResponse } from "next/server"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const uasApiUrl = process.env.UAS_API_URL
  const uasApiKey = process.env.UAS_API_KEY

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 })
  }

  try {
    const body = await request.json()

    const response = await fetch(`${uasApiUrl}/loadbalancer/instances/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to update instance" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Update instance error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
