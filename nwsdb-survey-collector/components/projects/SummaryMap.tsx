"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import * as htmlToImage from "html-to-image";

// Fix missing marker icons in Leaflet + Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

type MapPoint = {
  lat: number;
  lng: number;
  label: string;
};

function MapBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [points, map]);

  return null;
}

export default function SummaryMap({ points }: { points: MapPoint[] }) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  const defaultCenter: [number, number] = [6.9271, 79.8612];

  const displayPoints = points.map((p) => {
    // 🚀 INCREASED JITTER: This spreads the pins out a bit more visually
    const jitter = 0.0004; 
    return {
      ...p,
      lat: p.lat + (Math.random() - 0.5) * jitter,
      lng: p.lng + (Math.random() - 0.5) * jitter,
    };
  });

  const downloadMap = async () => {
    if (!mapRef.current) return;
    try {
      const dataUrl = await htmlToImage.toPng(mapRef.current, {
        quality: 1.0,
        backgroundColor: "#fff",
      });
      const link = document.createElement("a");
      link.download = `map-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to download map", err);
      alert("Could not download the map image.");
    }
  };

  return (
    <>
      <div
        className={`${
          isFullScreen
            ? "fixed inset-0 z-[9999] bg-white p-4 h-screen w-screen"
            : "relative h-72 w-full rounded-lg border border-gray-200 z-0 overflow-hidden"
        }`}
      >
        <div ref={mapRef} className="h-full w-full relative z-0">
          <MapContainer
            center={points.length > 0 ? [points[0].lat, points[0].lng] : defaultCenter}
            zoom={12}
            style={{ height: "100%", width: "100%", zIndex: 0 }}
          >
            <MapBounds points={points} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {displayPoints.map((point, idx) => (
              <Marker key={idx} position={[point.lat, point.lng]}>
                <Popup>
                  <strong>{point.label}</strong>
                  <br />
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Open in Google Maps
                  </a>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* UI Overlay */}
        <div className="absolute top-3 right-3 z-[400] flex gap-2">
          <div className="bg-white px-3 py-1.5 rounded-md shadow-md border border-gray-200 text-xs font-bold text-gray-700 flex items-center">
            {points.length} {points.length === 1 ? "Location" : "Locations"}
          </div>

          {/* Download Button */}
          <button
            onClick={downloadMap}
            className="bg-white p-1.5 rounded-md shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
            title="Download Map"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={() => setIsFullScreen(!isFullScreen)}
            className="bg-white p-1.5 rounded-md shadow-md border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
            title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
          >
            {isFullScreen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Background overlay for full screen to prevent clicking background */}
      {isFullScreen && (
        <div className="fixed inset-0 bg-black/50 z-[9998]" onClick={() => setIsFullScreen(false)} />
      )}
    </>
  );
}