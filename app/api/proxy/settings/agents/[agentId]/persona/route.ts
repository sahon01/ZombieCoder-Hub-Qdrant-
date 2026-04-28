import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function PUT(request: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await context.params
    const body = await request.json()

    const response = await fetch(`${UAS_API_URL}/settings/agents/${agentId}/persona`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      body: JSON.stringify(body),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(data || { error: "Failed to update agent persona" }, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Settings agent persona PUT error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
