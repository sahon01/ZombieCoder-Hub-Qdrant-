import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const vscodeApiUrl = process.env.NEXT_PUBLIC_EDITOR_API || process.env.VSCODE_API_URL

  if (!vscodeApiUrl) {
    return NextResponse.json({ error: "VS Code API not configured" }, { status: 503 })
  }

  try {
    const body = await request.json()

    const response = await fetch(`${vscodeApiUrl}/editor/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to send to VS Code" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] VS Code send error:", error)
    return NextResponse.json({ error: "Connection failed" }, { status: 503 })
  }
}
