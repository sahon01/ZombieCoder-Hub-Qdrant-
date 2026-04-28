import { NextResponse } from "next/server";

export async function GET() {
  const uasApiUrl = process.env.UAS_API_URL;
  const uasApiKey = process.env.UAS_API_KEY;

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 });
  }

  try {
    const response = await fetch(`${uasApiUrl}/models/ollama/tags`, {
      headers: {
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
          error: payload?.error || "Failed to fetch models",
          message: payload?.message || response.statusText,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[v0] Models fetch error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Connection failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 },
    );
  }
}