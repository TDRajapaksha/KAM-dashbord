import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    // Fetch the HTML page of the short link
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });

    const html = await response.text();

    // 🚀 THE MAGIC: Google Maps saves the exact coordinates in the page's meta tags
    // Example: <meta content="https://www.google.com/maps/place/.../@6.9271,79.8612,15z" property="og:image">
    // We look for the @lat,lng OR the !3dlat!4dlng inside the HTML
    const match =
      html.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);

    if (match) {
      // Return a clean, standard Google Maps URL containing the coordinates
      return NextResponse.json({
        resolvedUrl: `https://www.google.com/maps/search/?api=1&query=${match[1]},${match[2]}`,
      });
    }

    // If we couldn't find it, return the original url so the frontend doesn't crash
    return NextResponse.json({ resolvedUrl: url });
  } catch (error) {
    console.error("Resolve error:", error);
    return NextResponse.json({ error: "Failed to resolve URL" }, { status: 500 });
  }
}