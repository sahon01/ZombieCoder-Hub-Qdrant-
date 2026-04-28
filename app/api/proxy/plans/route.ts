import { NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function GET() {
  try {
    const response = await fetch(`${UAS_API_URL}/plans`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      cache: "no-store",
    })

    const text = await response.text()
    const payload = text ? JSON.parse(text) : null

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: payload?.error || "Failed to fetch plans",
          message: payload?.message || response.statusText,
        },
        { status: response.status },
      )
    }

    const list = Array.isArray(payload?.data) ? payload.data : []
    return NextResponse.json({ success: true, plans: list })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
