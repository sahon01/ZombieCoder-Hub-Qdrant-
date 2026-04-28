import { NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params

    const response = await fetch(`${UAS_API_URL}/providers/${id}/models`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      cache: "no-store",
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(data || { error: "Failed to fetch provider models" }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Provider models proxy error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
