import { type NextRequest } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function POST(request: NextRequest) {
  const body = await request.text()

  const upstream = await fetch(`${UAS_API_URL}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.UAS_API_KEY || "",
    },
    body,
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
