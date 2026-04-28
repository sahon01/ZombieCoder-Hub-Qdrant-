import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function GET() {
  try {
    const response = await fetch(`${UAS_API_URL}/settings/runtime`, {
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(data || { error: "Failed to fetch runtime settings" }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Settings runtime GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(`${UAS_API_URL}/settings/runtime`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(data || { error: "Failed to update runtime settings" }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Settings runtime PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
