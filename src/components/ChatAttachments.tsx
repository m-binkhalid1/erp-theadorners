import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Image, FileText, Paperclip, X, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import imageCompression from 'browser-image-compression';

interface FilePreview {
  file: File;
  url: string;
  type: "image" | "video" | "document";
}

interface ChatAttachmentProps {
  onFileSelected: (file: File) => void;
  onLocationSelected?: (locationUrl: string) => void;
  disabled?: boolean;
}

const ChatAttachmentMenu = ({ onFileSelected, onLocationSelected, disabled }: ChatAttachmentProps) => {
  const [open, setOpen] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File 2MB se zyada nahi ho sakti");
      return;
    }
    onFileSelected(file);
    setOpen(false);
    e.target.value = "";
  };

  const shareLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Aapka browser location support nahi karta.");
      return;
    }

    toast.info("Exact location li ja rahi hai... (HTTPS / Location Services zaroori hai)", { 
      id: "locToast",
      duration: 10000
    });

    const getPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { 
        enableHighAccuracy: true, 
        maximumAge: 0,
        timeout: 10000
      });
    });

    try {
      const position = await getPosition();
      const { latitude, longitude } = position.coords;
      const locationUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
      
      toast.dismiss("locToast");
      if (onLocationSelected) {
        onLocationSelected(`📍 Location: ${locationUrl}`);
      } else {
        toast.success("Location ready to send!");
      }
      setOpen(false);
    } catch (error: any) {
      console.warn("Browser geolocation failed:", error);
      toast.dismiss("locToast");
      
      let errorMsg = "Exact Location nahi mil saki.";
      if (error.code === 1) { // PERMISSION_DENIED
        errorMsg = "Aapne Location ki permission block ki hui hai.";
      } else if (error.code === 2) { // POSITION_UNAVAILABLE
        errorMsg = "Windows Location Services off hain ya Internet masla hai.";
      } else if (error.code === 3 || error.message === "GEOLOCATION_TIMEOUT") {
        errorMsg = "Location Timeout. Live Server (HTTPS) par ye 100% theek kaam karega.";
      }
      
      toast.error(errorMsg, { duration: 5000 });
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-all",
          "hover:bg-accent hover:text-primary active:scale-95",
          disabled && "opacity-50 pointer-events-none"
        )}
      >
        <Paperclip className="h-5 w-5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-14 left-0 z-50 flex flex-col gap-2 rounded-2xl bg-card border border-border p-3 shadow-xl animate-in slide-in-from-bottom-2 duration-200">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Camera className="h-4 w-4 text-primary" />
              </div>
              <span>Camera</span>
            </button>
            <button
              type="button"
              onClick={() => imageRef.current?.click()}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Image className="h-4 w-4 text-primary" />
              </div>
              <span>Gallery</span>
            </button>
            <button
              type="button"
              onClick={() => videoRef.current?.click()}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
                <span className="text-base">🎥</span>
              </div>
              <span>Video</span>
            </button>
            <button
              type="button"
              onClick={() => docRef.current?.click()}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
                <FileText className="h-4 w-4 text-accent-foreground" />
              </div>
              <span>Document</span>
            </button>
            <button
              type="button"
              onClick={shareLocation}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent">
                <MapPin className="h-4 w-4 text-green-500" />
              </div>
              <span>Location</span>
            </button>
          </div>
        </>
      )}

      {/* Hidden file inputs */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <input ref={videoRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />
      <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" className="hidden" onChange={handleFile} />
    </div>
  );
};

// File preview component for chat input area
export const ChatFilePreview = ({ file, onRemove }: { file: File; onRemove: () => void }) => {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  const url = isImage || isVideo ? URL.createObjectURL(file) : null;

  return (
    <div className="relative inline-flex items-center gap-2 rounded-xl bg-accent/50 border border-border px-3 py-2 text-sm">
      {isImage && url && (
        <img src={url} alt="preview" className="h-12 w-12 rounded-lg object-cover" />
      )}
      {isVideo && (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <span className="text-lg">🎥</span>
        </div>
      )}
      {!isImage && !isVideo && (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0 max-w-[120px]">
        <p className="truncate text-xs font-medium">{file.name}</p>
        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};

// Media bubble inside chat messages
export const ChatMediaBubble = ({ fileUrl, fileType, fileName }: { fileUrl: string; fileType: string; fileName: string }) => {
  const isImage = fileType.startsWith("image/");
  const isVideo = fileType.startsWith("video/");

  if (isImage) {
    return (
      <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
        <img src={fileUrl} alt={fileName} className="max-w-full max-h-60 rounded-xl object-cover" loading="lazy" />
      </a>
    );
  }

  if (isVideo) {
    return (
      <video src={fileUrl} controls className="max-w-full max-h-60 rounded-xl mt-1.5" preload="metadata" />
    );
  }

  // Document
  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 mt-1.5 rounded-xl bg-background/50 border border-border px-3 py-2.5 hover:bg-accent transition-colors"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <FileText className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{fileName}</p>
        <p className="text-xs text-muted-foreground">Tap to open</p>
      </div>
    </a>
  );
};

// Upload helper
export const uploadChatFile = async (file: File, userId: string): Promise<{ url: string; type: string; name: string } | null> => {
  let fileToUpload = file;
  
  // Compress if it's an image (excluding gifs)
  if (file.type.startsWith('image/') && !file.type.includes('gif')) {
    try {
      const options = {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };
      fileToUpload = await imageCompression(file, options);
    } catch (err) {
      console.error("Compression format error", err);
      // fallback to original file if compression fails
    }
  }

  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from("chat-attachments").upload(path, fileToUpload, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    toast.error("File upload fail: " + error.message);
    return null;
  }

  const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);

  return {
    url: urlData.publicUrl,
    type: file.type,
    name: file.name,
  };
};

export default ChatAttachmentMenu;
