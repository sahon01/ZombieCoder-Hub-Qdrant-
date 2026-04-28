import { type NextRequest, NextResponse } from "next/server"

const UAS_API_URL = process.env.UAS_API_URL || "http://localhost:8000"

const mapBackendProviderToUi = (p: any) => {
  const isActive = Boolean(p?.isActive ?? p?.is_active ?? true)
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

  return {
    id: Number(p?.id),
    name: String(p?.name || ""),
    endpoint: String(p?.endpoint || p?.api_endpoint || ""),
    status: isActive ? "active" : "inactive",
    config,
    fallbackConfig: {
      enabled: Boolean(config?.fallbackConfig?.enabled ?? false),
      fallbackTo: config?.fallbackConfig?.fallbackTo ?? null,
    },
    cacheSettings: {
      enabled: Boolean(config?.cacheSettings?.enabled ?? true),
      ttl: Number(config?.cacheSettings?.ttl ?? 300),
    },
    costTracking: {
      totalCost: Number(config?.costTracking?.totalCost ?? 0),
      requestCount: Number(config?.costTracking?.requestCount ?? 0),
    },
    createdAt: String(p?.createdAt || p?.created_at || new Date().toISOString()),
    type: String(p?.type || ""),
  }
}

export async function GET() {
  try {
    const response = await fetch(`${UAS_API_URL}/providers`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      const text = await response.text()
      let payload: any = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = null
      }

      return NextResponse.json(
        {
          error: payload?.error || "Failed to fetch providers",
          message: payload?.message || response.statusText,
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    const list = Array.isArray(data?.data) ? data.data : []
    return NextResponse.json({ providers: list.map(mapBackendProviderToUi) })
  } catch (error) {
    console.error("[v0] Providers API error:", error)
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const providerType = String(body?.type || "").trim()

    const backendBody = {
      name: body?.name,
      type: providerType,
      endpoint: body?.endpoint,
      isActive: true,
      config: {
        apiKeyEnvVar: body?.apiKey || "",
        fallbackConfig: body?.fallbackConfig || { enabled: false },
        cacheSettings: body?.cacheSettings || { enabled: true, ttl: 300 },
      },
    }

    const response = await fetch(`${UAS_API_URL}/providers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.UAS_API_KEY || "",
      },
      body: JSON.stringify(backendBody),
    })

    if (!response.ok) {
      const text = await response.text()
      let payload: any = null
      try {
        payload = text ? JSON.parse(text) : null
      } catch {
        payload = null
      }

      return NextResponse.json(
        {
          error: payload?.error || "Failed to add provider",
          message: payload?.message || response.statusText,
        },
        { status: response.status },
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Providers API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
