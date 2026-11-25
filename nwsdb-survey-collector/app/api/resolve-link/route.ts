import { NextResponse } from "next/server";

function findCoordinates(value: string) {
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i,
    /(?:center|ll|query|q|destination|daddr)=(-?\d+(?:\.\d+)?)(?:%2C|,)\+?(-?\d+(?:\.\d+)?)/i,
  ];

  const candidates = [value, value.replace(/&amp;/gi, "&")];
  try {
    candidates.push(decodeURIComponent(value));
  } catch {}

  for (const candidate of candidates) {
    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (!match) continue;

      const reversed = pattern.source.startsWith("!2d");
      const lat = Number(reversed ? match[2] : match[1]);
      const lng = Number(reversed ? match[1] : match[2]);
      
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });

  let shortLink: URL;
  try {
    shortLink = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (shortLink.protocol !== "https:" || !["maps.app.goo.gl", "goo.gl"].includes(shortLink.hostname.toLowerCase())) {
    return NextResponse.json({ error: "Unsupported map link" }, { status: 400 });
  }

  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    
    // 1. Follow redirects to get the final long URL
    let target = shortLink;
    for (let i = 0; i < 5; i++) {
      const response = await fetch(target, { headers, redirect: "manual" });
      const location = response.headers.get("location");
      
      if (!location) break;
      
      target = new URL(location, target);
      
      // Check if the new target URL has coordinates
      const coordinates = findCoordinates(target.toString());
      if (coordinates) {
        return NextResponse.json({
          resolvedUrl: `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lng}`,
        });
      }
    }

    // 2. If redirects didn't work, fetch the HTML page and scrape it
    const finalRes = await fetch(target, { headers });
    const html = await finalRes.text();
    const htmlCoordinates = findCoordinates(html);

    if (htmlCoordinates) {
      return NextResponse.json({
        resolvedUrl: `https://www.google.com/maps/search/?api=1&query=${htmlCoordinates.lat},${htmlCoordinates.lng}`,
      });
    }

    return NextResponse.json({ resolvedUrl: target.toString() });
  } catch (error) {
    return NextResponse.json({ error: "Failed to resolve URL" }, { status: 500 });
  }
}