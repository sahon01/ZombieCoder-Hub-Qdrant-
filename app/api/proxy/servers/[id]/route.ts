import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const uasApiUrl = process.env.UAS_API_URL;
  const uasApiKey = process.env.UAS_API_KEY;

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 });
  }

  try {
    const { id } = await params;
    const response = await fetch(`${uasApiUrl}/servers/${id}`, {
      headers: {
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch server" }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[v0] Server fetch error:", error);
    return NextResponse.json({ error: "Connection failed" }, { status: 503 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const uasApiUrl = process.env.UAS_API_URL;
  const uasApiKey = process.env.UAS_API_KEY;

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const response = await fetch(`${uasApiUrl}/servers/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: "Failed to update server", details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[v0] Server update error:", error);
    return NextResponse.json({ error: "Connection failed" }, { status: 503 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const uasApiUrl = process.env.UAS_API_URL;
  const uasApiKey = process.env.UAS_API_KEY;

  if (!uasApiUrl) {
    return NextResponse.json({ error: "UAS_API_URL not configured" }, { status: 503 });
  }

  try {
    const { id } = await params;

    const response = await fetch(`${uasApiUrl}/servers/${id}`, {
      method: "DELETE",
      headers: {
        ...(uasApiKey && { "X-API-Key": uasApiKey }),
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: "Failed to delete server", details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[v0] Server delete error:", error);
    return NextResponse.json({ error: "Connection failed" }, { status: 503 });
  }
}