import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params

    const response = await fetch(`${UAS_API_URL}/providers/${id}`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch provider" }, { status: response.status })
    }

    const data = await response.json()

    if (data && data.provider) {
      return NextResponse.json({ provider: data.provider })
    }

    if (data && data.success && data.data) {
      const p = data.data
      const config = (() => {
        const raw = p?.config || p?.config_json || {}
        if (!raw) return {}
        if (typeof raw === "object") return raw
        if (typeof raw === "string") {
          try {
            return raw.trim() ? JSON.parse(raw) : {}
          } catch {
            return {}
          }
        }
        return {}
      })()
      const provider = {
        id: p.id,
        name: p.name,
        type: p.type,
        endpoint: p.endpoint,
        status: p.isActive ? "active" : "inactive",
        config,
        fallbackConfig: {
          enabled: false,
          fallbackTo: null,
        },
        cacheSettings: {
          enabled: true,
          ttl: 300,
        },
        costTracking: {
          totalCost: 0,
          requestCount: 0,
        },
        createdAt: p.createdAt || new Date().toISOString(),
      }
      return NextResponse.json({ provider })
    }

    return NextResponse.json({ error: "Provider not found" }, { status: 404 })
  } catch (error) {
    console.error("[v0] Providers API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json()

    const { id } = await context.params

    const response = await fetch(`${UAS_API_URL}/providers/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to update provider" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Providers API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params

    const response = await fetch(`${UAS_API_URL}/providers/${id}`, {
      method: "DELETE",
      headers: {
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
    })

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to delete provider" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Providers API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
