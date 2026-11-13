import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    // Spoof a mobile User-Agent to get the HTML
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      },
      redirect: "follow",
    });

    const html = await response.text();

    // Look for coordinates in the HTML
    const match = html.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/i) || 
                  html.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
                  html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);

    if (match) {
      return NextResponse.json({
        resolvedUrl: `https://www.google.com/maps/search/?api=1&query=${match[1]},${match[2]}`,
      });
    }

    return NextResponse.json({ resolvedUrl: url });
  } catch (error) {
    return NextResponse.json({ error: "Failed to resolve URL" }, { status: 500 });
  }
}