import { useRef, useState, useCallback, useEffect } from "react";
import { Mic, Square, Trash2, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface VoiceRecorderProps {
  onVoiceSend: (fileData: { url: string; type: string; name: string; duration: number }) => void;
  userId: string;
  disabled?: boolean;
}

const VoiceRecorder = ({ onVoiceSend, userId, disabled }: VoiceRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const getMimeType = () => {
    // Safari doesn't support webm, use mp4
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
    if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
    if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
    if (MediaRecorder.isTypeSupported("audio/ogg")) return "audio/ogg";
    return "audio/webm";
  };

  const getExtension = (mimeType: string) => {
    if (mimeType.includes("mp4")) return "m4a";
    if (mimeType.includes("ogg")) return "ogg";
    return "webm";
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      streamRef.current = stream;

      const mimeType = getMimeType();
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(100); // collect data every 100ms
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone error:", err);
      toast.error("Microphone access denied. Browser settings check karein.");
    }
  }, []);

  const stopAndSend = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

    const duration = recordingTime;

    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        // Stop timer
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        // Stop stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        if (chunksRef.current.length === 0 || duration < 1) {
          setIsRecording(false);
          setRecordingTime(0);
          resolve();
          return;
        }

        setIsUploading(true);
        const mimeType = getMimeType();
        const ext = getExtension(mimeType);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const fileName = `voice_${Date.now()}.${ext}`;
        const file = new File([blob], fileName, { type: mimeType });
        const path = `${userId}/${fileName}`;

        const { error } = await supabase.storage
          .from("chat-attachments")
          .upload(path, file, { cacheControl: "3600", upsert: false });

        if (error) {
          toast.error("Voice upload fail: " + error.message);
          setIsUploading(false);
          setIsRecording(false);
          setRecordingTime(0);
          resolve();
          return;
        }

        const { data: urlData } = supabase.storage.from("chat-attachments").getPublicUrl(path);

        onVoiceSend({
          url: urlData.publicUrl,
          type: mimeType.split(";")[0], // remove codecs part
          name: fileName,
          duration,
        });

        setIsUploading(false);
        setIsRecording(false);
        setRecordingTime(0);
        resolve();
      };

      mediaRecorderRef.current!.stop();
    });
  }, [recordingTime, userId, onVoiceSend]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (isUploading) {
    return (
      <button
        type="button"
        disabled
        className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0"
      >
        <Loader2 className="h-5 w-5 animate-spin" />
      </button>
    );
  }

  if (isRecording) {
    return (
      <div className="flex items-center gap-2 flex-1 animate-in slide-in-from-right-2 duration-200">
        {/* Cancel */}
        <button
          type="button"
          onClick={cancelRecording}
          className="flex h-10 w-10 items-center justify-center rounded-full text-destructive hover:bg-destructive/10 transition-colors shrink-0"
        >
          <Trash2 className="h-5 w-5" />
        </button>

        {/* Recording indicator */}
        <div className="flex-1 flex items-center gap-2.5 rounded-full bg-destructive/5 border border-destructive/20 px-4 py-2.5">
          <span className="voice-recording-dot" />
          <span className="text-sm font-mono font-semibold text-destructive">
            {formatTime(recordingTime)}
          </span>
          <div className="flex-1 flex items-center justify-center gap-[3px]">
            {Array.from({ length: 20 }).map((_, i) => (
              <span
                key={i}
                className="voice-waveform-bar"
                style={{
                  animationDelay: `${i * 0.05}s`,
                  height: `${Math.random() * 14 + 6}px`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Send */}
        <button
          type="button"
          onClick={stopAndSend}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 hover:bg-primary/90 transition-colors active:scale-95"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shrink-0 transition-all active:scale-95",
        disabled && "opacity-50 pointer-events-none"
      )}
    >
      <Mic className="h-5 w-5" />
    </button>
  );
};

export default VoiceRecorder;
