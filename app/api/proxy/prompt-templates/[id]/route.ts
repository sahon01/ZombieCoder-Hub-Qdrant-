import { type NextRequest, NextResponse } from "next/server"

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const uasApiUrl = process.env.UAS_API_URL
  const uasApiKey = process.env.UAS_API_KEY

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 })
  }

  try {
    const body = await request.json()

    const response = await fetch(`${uasApiUrl}/prompt-templates/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to update template" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Template update error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const uasApiUrl = process.env.UAS_API_URL
  const uasApiKey = process.env.UAS_API_KEY

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 })
  }

  try {
    const response = await fetch(`${uasApiUrl}/prompt-templates/${id}`, {
      method: "DELETE",
      headers: {
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to delete template" }, { status: response.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Template delete error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
