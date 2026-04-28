import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const uasApiUrl = process.env.UAS_API_URL || "http://localhost:8000";
  const uasApiKey = process.env.UAS_API_KEY;

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const queryString = searchParams.toString();
    const apiUrl = queryString ? `${uasApiUrl}/servers?${queryString}` : `${uasApiUrl}/servers`;

    const response = await fetch(apiUrl, {
      headers: {
        "Content-Type": "application/json",
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }

      return NextResponse.json(
        {
          success: false,
          error: payload?.error || "Failed to fetch servers",
          message: payload?.message || response.statusText,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[v0] Servers fetch error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const uasApiUrl = process.env.UAS_API_URL || "http://localhost:8000";
  const uasApiKey = process.env.UAS_API_KEY;

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();

    const response = await fetch(`${uasApiUrl}/servers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: "Failed to create server", details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("[v0] Server creation error:", error);
    return NextResponse.json({ error: "Connection failed" }, { status: 503 });
  }
}