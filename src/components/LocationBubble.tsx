import React from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationBubbleProps {
  url: string;
}

export const LocationBubble = ({ url }: LocationBubbleProps) => {
  // Extract a clean display URL for aesthetics if possible, but keep original for href
  const isGoogleMaps = url.includes("maps.google.com") || url.includes("goo.gl") || url.includes("g.page");
  
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex flex-col gap-2 mt-1.5 rounded-xl border border-border bg-background overflow-hidden hover:bg-accent/50 transition-colors w-64 max-w-[100%]"
      )}
    >
      <div className="bg-muted/50 h-24 w-full flex items-center justify-center relative overflow-hidden">
        {/* Abstract Map Background Pattern (CSS-based to avoid external image deps) */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at 50% 50%, #000 1px, transparent 1px)",
            backgroundSize: "10px 10px"
          }}
        />
        <div className="z-10 bg-primary/10 p-3 rounded-full animate-pulse">
          <MapPin className="h-8 w-8 text-primary" />
        </div>
      </div>
      <div className="p-3 pt-1">
        <h4 className="font-semibold text-sm line-clamp-1">Shared Location</h4>
        <p className="text-xs text-muted-foreground mt-0.5 break-all line-clamp-2">
          {isGoogleMaps ? "Google Maps" : url}
        </p>
        <span className="text-[10px] font-medium text-primary mt-2 block uppercase tracking-wider">
          Tap to view map
        </span>
      </div>
    </a>
  );
};

// Helper function to extract Location URLs from a normal text message
export const extractLocationUrl = (text: string): { textParts: string[], locationUrls: string[] } => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex) || [];
  
  const locationUrls = urls.filter(url => 
    url.includes("maps.google.com") || 
    url.includes("goo.gl") || 
    url.includes("g.page") || 
    url.includes("maps.apple.com")
  );

  let textWithoutLocations = text;
  locationUrls.forEach(url => {
    // Also remove any preceding "📍 Location: " or similar textual markers if they exist 
    // to keep the chat clean
    textWithoutLocations = textWithoutLocations.replace(new RegExp(`📍 Location:\\s*${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '');
    textWithoutLocations = textWithoutLocations.replace(url, '');
  });

  return {
    textParts: textWithoutLocations.trim() ? [textWithoutLocations.trim()] : [],
    locationUrls
  };
};
