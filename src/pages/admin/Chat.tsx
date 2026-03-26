import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Sparkles, CalendarPlus, ExternalLink, Trash2, CheckCircle2, Circle, X, Wallet, BookOpen, ChevronDown, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import ChatAttachmentMenu, { ChatFilePreview, ChatMediaBubble, uploadChatFile } from "@/components/ChatAttachments";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoiceMessageBubble from "@/components/VoiceMessageBubble";
import ImageLightbox from "@/components/ImageLightbox";
import { LocationBubble, extractLocationUrl } from "@/components/LocationBubble";

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  message_type: string;
  is_ai_processed: boolean;
  ai_event_id: string | null;
  ai_staff_ledger_id: string | null;
  ai_invoice_id: string | null;
  file_url: string | null;
  file_type: string | null;
  file_name: string | null;
  created_at: string;
}

const AdminChat = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<"auto" | "event" | "staff" | "company_payment">("auto");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [msgRes, profRes] = await Promise.all([
        supabase.from("chat_messages").select("*").order("created_at", { ascending: true }),
        supabase.from("profiles").select("user_id, username"),
      ]);
      if (msgRes.data) setMessages(msgRes.data as ChatMessage[]);
      if (profRes.data) {
        const map: Record<string, string> = {};
        profRes.data.forEach((p) => { map[p.user_id] = p.username; });
        setProfiles(map);
      }
    };
    fetchData();

    const channel = supabase
      .channel("chat-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        } else if (payload.eventType === "UPDATE") {
          setMessages((prev) => prev.map(m => m.id === (payload.new as ChatMessage).id ? payload.new as ChatMessage : m));
        } else if (payload.eventType === "DELETE") {
          setMessages((prev) => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !attachedFile) || !user) return;
    setSending(true);
    const content = input.trim();

    let fileData: { url: string; type: string; name: string } | null = null;
    if (attachedFile) {
      fileData = await uploadChatFile(attachedFile, user.id);
      if (!fileData) { setSending(false); return; }
    }

    const insertPayload = {
      sender_id: user.id,
      content: content || (attachedFile ? `📎 ${attachedFile.name}` : ""),
      ...(fileData && {
        file_url: fileData.url,
        file_type: fileData.type,
        file_name: fileData.name,
      }),
    };

    const { data, error } = await supabase.from("chat_messages").insert(insertPayload).select("id").single();
    if (error) { toast.error(error.message); setSending(false); return; }
    setInput("");
    setAttachedFile(null);
    setSending(false);

    if (data && content) extractEvent(data.id, content);
  };

  const handleVoiceSend = async (fileData: { url: string; type: string; name: string; duration: number }) => {
    if (!user) return;
    const { error } = await supabase.from("chat_messages").insert({
      sender_id: user.id,
      content: `🎙️ Voice message (${fileData.duration}s)`,
      file_url: fileData.url,
      file_type: fileData.type,
      file_name: fileData.name,
    });
    if (error) toast.error(error.message);
  };

  const extractEvent = async (messageId: string, content: string) => {
    setProcessing(messageId);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: content, messageId, expectedType: aiMode === "auto" ? undefined : aiMode }),
      });

      if (resp.status === 429) { toast.error("AI rate limited, try again later"); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted"); return; }
      if (!resp.ok) throw new Error("AI processing failed");

      const result = await resp.json();
      if (result.is_event) {
        toast.success("🎉 AI ne event detect kar liya!", {
          description: `Company: ${result.extracted.company || result.extracted.client_name || "Unknown"}`,
          action: { label: "Events Dekhein", onClick: () => navigate("/admin/events") },
        });
      } else if (result.is_staff_payment) {
        toast.success("💰 AI ne staff payment detect ki!", {
          description: `${result.extracted.staff_name}: Rs ${(result.extracted.staff_amount || 0).toLocaleString()} — ${result.extracted.staff_reason || result.extracted.staff_type}`,
          action: { label: "Staff Ledger", onClick: () => navigate("/admin/staff-ledger") },
        });
      } else if (result.is_company_payment) {
        toast.success("🧾 Company payment detect hua!", {
          description: `${result.extracted.company_name}: Rs ${(result.extracted.payment_amount || 0).toLocaleString()} wusool`,
          action: { label: "Ledger Dekhein", onClick: () => navigate("/admin/ledger") },
        });
      }
    } catch (err) {
      console.error("AI extraction error:", err);
    } finally {
      setProcessing(null);
    }
  };

  const deleteMessage = async (msgId: string) => {
    if (!confirm("Kya aap waqai is message ko delete karna chahte hain? Sab ke paas se delete ho jayega.")) return;
    const { error } = await supabase.from("chat_messages").delete().eq("id", msgId);
    if (error) toast.error(error.message);
  };

  const toggleSelection = (msgId: string) => {
    setSelectedMessages(prev => 
      prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId]
    );
  };

  const bulkDelete = async () => {
    if (selectedMessages.length === 0) return;
    if (!confirm(`Kya aap waqai ${selectedMessages.length} messages delete karna chahte hain?`)) return;
    
    // We delete all selected messages completely
    const { error } = await supabase.from("chat_messages")
      .delete()
      .in("id", selectedMessages);
      
    if (error) {
      toast.error(error.message);
    } else {
      setSelectionMode(false);
      setSelectedMessages([]);
      toast.success("Messages deleted successfully");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl">💬</span>
          <h1 className="text-lg font-display font-bold">Team Chat</h1>
          <Badge variant="outline" className="gap-1 border-primary/30 text-primary px-2 py-0.5 text-xs">
            <Sparkles className="h-3 w-3" /> AI
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">AI automatic event detect karta hai</p>
      </div>

      {/* Bulk Action Bar (Visible when Selection Mode is ON) */}
      {selectionMode && (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between shrink-0 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectionMode(false); setSelectedMessages([]); }} className="p-1 rounded-full hover:bg-background/50">
              <X className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{selectedMessages.length} Selected</span>
          </div>
          <Button 
            variant="destructive" 
            size="sm" 
            className="h-8 shadow-none" 
            onClick={bulkDelete}
            disabled={selectedMessages.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </Button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">💬</span>
            <p className="text-lg text-muted-foreground font-medium">Koi message nahi hai abhi</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Neeche se message bhejein</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === user?.id;
          const isProcessing = processing === msg.id;
          const isDeleted = msg.content === "🚫 This message was deleted";
          const isSelected = selectedMessages.includes(msg.id);

          return (
            <div 
              key={msg.id} 
              className={cn(
                "flex items-center gap-2", 
                isMine ? "justify-end" : "justify-start",
                selectionMode && isSelected && "bg-primary/5 rounded-lg py-1 px-1 -mx-1"
              )}
            >
              {selectionMode && !isDeleted && (
                <button 
                  onClick={() => toggleSelection(msg.id)}
                  className="shrink-0 text-primary p-1"
                >
                  {isSelected ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5 text-muted-foreground/50" />}
                </button>
              )}

              <div 
                className={cn(
                  "group relative max-w-[80%] rounded-2xl px-3 py-2 text-sm transition-all",
                  isMine ? "chat-bubble-self rounded-br-md" : "chat-bubble-other rounded-bl-md",
                  isDeleted && "bg-transparent border border-border text-muted-foreground italic opacity-70 chat-bubble-other rounded-2xl shadow-none",
                  selectionMode ? "cursor-pointer" : ""
                )}
                onClick={() => {
                  if (selectionMode && !isDeleted) {
                    toggleSelection(msg.id);
                  }
                }}
                onContextMenu={(e) => {
                  if (!isDeleted) {
                    e.preventDefault();
                    setSelectionMode(true);
                    setSelectedMessages(prev => prev.includes(msg.id) ? prev : [...prev, msg.id]);
                  }
                }}
              >
                {/* Single Delete Button - Only shown when not in selection mode and not deleted */}
                {!selectionMode && !isDeleted && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }}
                    className={cn(
                      "absolute -top-2 opacity-0 group-hover:opacity-100 flex items-center justify-center p-1.5 rounded-full bg-destructive text-destructive-foreground shadow-sm transition-opacity focus:opacity-100",
                      isMine ? "-left-2" : "-right-2"
                    )}
                    title="Delete message"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}

                {/* Sender Name */}
                {!isMine && !isDeleted && (
                  <p className="text-[11px] font-bold text-primary mb-1">
                    {profiles[msg.sender_id] ?? "User"}
                  </p>
                )}
                
                {/* Media */}
                {!isDeleted && msg.file_url && msg.file_type && msg.file_name && (
                  msg.file_type.startsWith("audio/") ? (
                    <VoiceMessageBubble fileUrl={msg.file_url} isMine={isMine} />
                  ) : msg.file_type.startsWith("image/") ? (
                    <button onClick={() => setLightboxImg(msg.file_url!)} className="block mt-1.5">
                      <img src={msg.file_url} alt={msg.file_name} className="max-w-full max-h-60 rounded-xl object-cover" loading="lazy" />
                    </button>
                  ) : (
                    <ChatMediaBubble fileUrl={msg.file_url} fileType={msg.file_type} fileName={msg.file_name} />
                  )
                )}

                {/* Text Content */}
                {msg.content && !(msg.content.startsWith("📎 ") && msg.file_url) && !(msg.content.startsWith("🎙️") && msg.file_url) && (() => {
                  if (isDeleted) {
                    return <p className="leading-relaxed flex items-center gap-1.5">{msg.content}</p>;
                  }
                  const { textParts, locationUrls } = extractLocationUrl(msg.content);
                  return (
                    <div className="space-y-1.5">
                      {textParts.map((text, idx) => (
                        <p key={`text-${idx}`} className="text-foreground leading-relaxed whitespace-pre-wrap">{text}</p>
                      ))}
                      {locationUrls.length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-1">
                          {locationUrls.map((url, idx) => (
                            <LocationBubble key={`loc-${idx}`} url={url} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {isProcessing && !isDeleted && (
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>🤖 AI analyze kar raha hai...</span>
                  </div>
                )}
                
                {msg.is_ai_processed && msg.ai_event_id && !isDeleted && (
                  <button onClick={(e) => { e.stopPropagation(); navigate("/admin/events"); }} className="flex items-center gap-1.5 mt-1.5 group">
                    <Badge variant="outline" className="gap-1 border-primary/30 text-primary group-hover:bg-primary/10 transition-colors cursor-pointer text-xs">
                      <CalendarPlus className="h-3 w-3" /> Event ✅
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Badge>
                  </button>
                )}

                {msg.is_ai_processed && msg.ai_staff_ledger_id && !isDeleted && (
                  <button onClick={(e) => { e.stopPropagation(); navigate("/admin/staff-ledger"); }} className="flex items-center gap-1.5 mt-1.5 group">
                    <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600 group-hover:bg-amber-500/10 transition-colors cursor-pointer text-xs">
                      <Wallet className="h-3 w-3" /> Staff Payment 💰
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Badge>
                  </button>
                )}

                {msg.is_ai_processed && msg.ai_invoice_id && !isDeleted && (
                  <button onClick={(e) => { e.stopPropagation(); navigate("/admin/ledger"); }} className="flex items-center gap-1.5 mt-1.5 group">
                    <Badge variant="outline" className="gap-1 border-green-500/30 text-green-600 group-hover:bg-green-500/10 transition-colors cursor-pointer text-xs">
                      <Receipt className="h-3 w-3" /> Payment 💰
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Badge>
                  </button>
                )}
                
                <p className={cn("text-[10px] mt-1 text-muted-foreground/60 focus:outline-none", isDeleted && "mt-0")}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* File preview */}
      {attachedFile && (
        <div className="px-3 py-2 border-t border-border bg-card shrink-0">
          <ChatFilePreview file={attachedFile} onRemove={() => setAttachedFile(null)} />
        </div>
      )}

      {/* Input - WhatsApp style with AI Mode Selector */}
      <form onSubmit={sendMessage} className="border-t border-border px-2 py-2 flex items-end gap-1.5 safe-bottom shrink-0 bg-card">
        <ChatAttachmentMenu 
          onFileSelected={setAttachedFile} 
          onLocationSelected={(locString) => {
            setInput((prev) => prev ? `${prev}\n${locString}` : locString);
          }}
          disabled={sending} 
        />
        {/* AI Mode Selector */}
        <div className="relative shrink-0">
          <select
            value={aiMode}
            onChange={(e) => setAiMode(e.target.value as any)}
            className="h-11 pl-2 pr-6 text-xs rounded-full border border-border bg-card appearance-none cursor-pointer font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
            disabled={sending}
          >
            <option value="auto">🤖 Auto</option>
            <option value="event">📅 Event</option>
            <option value="staff">👷 Staff</option>
            <option value="company_payment">🏢 Payment</option>
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>
        <div className="flex-1 relative">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={aiMode === "auto" ? "Message likhein..." : aiMode === "event" ? "Event details likhein..." : aiMode === "staff" ? "Staff payment likhein..." : "Company payment likhein..."}
            className="flex-1 h-11 text-sm rounded-full pr-4 pl-4 border-border"
            disabled={sending}
          />
        </div>
        {/* Send button when there's text/file, Mic button when empty */}
        {input.trim() || attachedFile ? (
          <Button type="submit" size="icon" disabled={sending} className="h-11 w-11 rounded-full shrink-0">
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </Button>
        ) : (
          <VoiceRecorder onVoiceSend={handleVoiceSend} userId={user?.id ?? ""} disabled={sending} />
        )}
      </form>

      {/* Image Lightbox */}
      <ImageLightbox
        src={lightboxImg ?? ""}
        isOpen={!!lightboxImg}
        onClose={() => setLightboxImg(null)}
      />
    </div>
  );
};

export default AdminChat;
