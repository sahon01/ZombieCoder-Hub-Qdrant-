import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const search = searchParams.get("search")

    const queryParams = new URLSearchParams()
    if (category) queryParams.append("category", category)
    if (search) queryParams.append("search", search)

    const response = await fetch(`${UAS_API_URL}/terminal-commands?${queryParams}`, {
      headers: {
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch commands" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Terminal commands API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const response = await fetch(`${UAS_API_URL}/terminal-commands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to add command" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Terminal commands API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
