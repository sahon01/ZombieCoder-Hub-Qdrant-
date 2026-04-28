import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function POST(request: NextRequest) {
  try {
    const response = await fetch(`${UAS_API_URL}/models/llama-cpp/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      body: await request.text().catch(() => ""),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(data || { error: "Failed to sync llama.cpp models" }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] llama.cpp models sync error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
