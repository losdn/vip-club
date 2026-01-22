import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useUsers } from "@/hooks/use-users";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Send, Mic, Paperclip, Loader2, CheckCheck, Smile, XCircle, Search, Play, Pause, Download, FileText } from "lucide-react";
import EmojiPicker, { Theme, EmojiStyle } from "emoji-picker-react";
import { io, Socket } from "socket.io-client";
import { format, isToday, isYesterday } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";

function getAdjustedDate(raw: string | number | Date) {
  const date = new Date(raw);
  return new Date(date.getTime() + 3 * 60 * 60 * 1000);
}

function VoiceMessagePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [rate, setRate] = useState<1 | 1.5 | 2>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, [rate]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoaded = () => {
      setDuration(audio.duration || 0);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const toggleRate = () => {
    setRate(prev => {
      const next = prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1;
      if (audioRef.current) {
        audioRef.current.playbackRate = next;
      }
      return next;
    });
  };

  const label = `${rate}x`;

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl bg-card/80 border border-border/60 px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={async () => {
            if (!audioRef.current) return;
            if (isPlaying) {
              audioRef.current.pause();
              setIsPlaying(false);
            } else {
              try {
                await audioRef.current.play();
                setIsPlaying(true);
              } catch {
              }
            }
          }}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground shadow-md"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <div className="flex flex-col flex-1 gap-1">
          <div
            className="relative h-1.5 rounded-full bg-muted cursor-pointer overflow-hidden"
            onClick={(e) => {
              if (!audioRef.current || !duration) return;
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const ratio = Math.min(Math.max(clickX / rect.width, 0), 1);
              const newTime = ratio * duration;
              audioRef.current.currentTime = newTime;
              setCurrentTime(newTime);
            }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
              style={{
                width: duration ? `${(currentTime / duration) * 100}%` : "0%",
              }}
            />
          </div>
          <div className="flex items-center justify-end text-[11px] text-muted-foreground">
            <span>{formatTime(duration || currentTime || 0)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleRate}
          className="flex items-center justify-center text-[10px] font-semibold px-2 h-7 rounded-full bg-muted/70 text-foreground border border-border/60"
        >
          {label}
        </button>
      </div>
      <audio ref={audioRef} src={src} className="hidden" />
    </>
  );
}

export default function Support() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isStaff = ["admin", "dev", "supervisor"].includes(user?.role || "");
  const { data: allUsers } = useUsers();
  
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; type: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const discardRecordingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (!user) return;
    const activeId = isStaff ? activeThreadId : user.id;
    (window as any).__activeSupportChatterId = activeId ?? null;
    return () => {
      if ((window as any).__activeSupportChatterId === activeId) {
        (window as any).__activeSupportChatterId = null;
      }
    };
  }, [user, isStaff, activeThreadId]);

  const handleThreadClick = (thread: any) => {
    setActiveThreadId(thread.chatterId);

    queryClient.setQueryData(["/api/support/threads"], (old: any) => {
      if (!old) return old;
      return old.map((t: any) =>
        t.chatterId === thread.chatterId ? { ...t, unreadCount: 0 } : t
      );
    });

    fetch(`/api/support/read/${thread.chatterId}`, {
      method: "POST",
      credentials: "include"
    }).catch(() => {});
  };

  useEffect(() => {
    if (!user) return;

    const socket = io({
      withCredentials: true,
      transports: ["websocket"],
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  // Fetch Threads (Staff only)
  const { data: threads } = useQuery({
    queryKey: ["/api/support/threads"],
    queryFn: async () => {
      const res = await fetch("/api/support/threads", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch threads");
      return res.json();
    },
    enabled: isStaff,
    refetchInterval: 5000,
  });

  // Fetch Messages
  const { data: messages, refetch: refetchMessages } = useQuery({
    queryKey: ["/api/support/history", isStaff ? activeThreadId : "mine"],
    queryFn: async () => {
      const url = isStaff 
        ? `/api/support/history/${activeThreadId}`
        : "/api/support/history";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      
      if (isStaff && activeThreadId) {
        fetch(`/api/support/read/${activeThreadId}`, { 
          method: 'POST',
          credentials: "include" 
        }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/support/threads"] }));
      } else if (!isStaff) {
        fetch("/api/support/read-mine", {
          method: "POST",
          credentials: "include"
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/support/unread-count"] });
        });
      }

      return res.json();
    },
    enabled: !!(user && (!isStaff || activeThreadId)),
  });

  // Auto-select first thread
  useEffect(() => {
    if (isStaff && threads && threads.length > 0 && !activeThreadId) {
      handleThreadClick(threads[0]);
    }
  }, [isStaff, threads, activeThreadId]);

  // Scroll to bottom on load
  useEffect(() => {
    if (messages && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;

    setIsSending(true);
    const content = inputText;
    setInputText("");
    if (inputRef.current) {
      inputRef.current.focus();
    }

    try {
      const payload = {
        content: content,
        chatterId: isStaff ? activeThreadId : undefined
      };

      const res = await fetch("/api/support/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
      });

      if (!res.ok) {
        throw new Error("Falha ao enviar mensagem");
      }

      setTimeout(() => refetchMessages(), 300);
    } catch (err: any) {
      console.error("[Send] Erro:", err);
      toast({
        title: "Erro ao enviar",
        description: err.message,
        variant: "destructive"
      });
      setInputText(content); // Restaura texto em caso de erro
    } finally {
      setIsSending(false);
    }
  };

  const sendFile = async (file: File) => {
    if (isSending) return;

    // LIMITE DE TAMANHO: 100MB
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 100MB",
        variant: "destructive"
      });
      return;
    }

    setIsSending(true);

    try {
      const reader = new FileReader();
      
      reader.onload = async (evt) => {
        const base64 = evt.target?.result as string;
        const type = file.type.startsWith("image/") ? "image" : 
                     file.type.startsWith("audio/") ? "audio" : 
                     file.type.startsWith("video/") ? "video" : "file";
        
        // Se for arquivo genérico, salvamos o nome no content se estiver vazio
        // Mas o backend espera content ou attachment. 
        // Vamos mandar o nome do arquivo no content se for file type para facilitar identificação
        const content = type === "file" ? file.name : "";

        const payload = {
          content: content,
          attachmentUrl: base64,
          attachmentType: type,
          chatterId: isStaff ? activeThreadId : undefined
        };

        console.log("[File] Enviando arquivo, tamanho:", (base64.length / 1024).toFixed(2), "KB");

        const res = await fetch("/api/support/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include"
        });

        if (!res.ok) {
          throw new Error("Falha ao enviar arquivo");
        }

        setTimeout(() => refetchMessages(), 300);
        toast({ title: "Arquivo enviado!", variant: "default" });
      };

      reader.onerror = () => {
        throw new Error("Erro ao ler arquivo");
      };

      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error("[File] Erro:", err);
      toast({
        title: "Erro ao enviar arquivo",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) sendFile(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          sendFile(file);
          e.preventDefault();
        }
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isRecording) {
        stopRecording();
      } else {
        handleSend();
      }
    }
  };

  const startRecording = async () => {
    if (isSending || isRecording) return;
    console.log("[Audio] Iniciando solicitação de gravação...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });
      mediaStreamRef.current = stream;

      // Preferir WebM com Opus para melhor compressão
      let options: MediaRecorderOptions = { 
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 32000 // Reduz qualidade para arquivo menor
      };

      if (!MediaRecorder.isTypeSupported(options.mimeType!)) {
        options = { mimeType: "audio/webm" };
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log(`[Audio] Chunk: ${event.data.size}b`);
        }
      };

      mediaRecorder.onstop = async () => {
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          cleanup();
          return;
        }
        console.log("[Audio] Stop. Processando...");
        if (!audioChunksRef.current.length) {
          console.warn("[Audio] Vazio");
          cleanup();
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        console.log(`[Audio] Blob: ${audioBlob.size}b`);
        
        // LIMITE: 2MB para áudio
        const MAX_AUDIO_SIZE = 2 * 1024 * 1024;
        if (audioBlob.size > MAX_AUDIO_SIZE) {
          toast({
            title: "Áudio muito longo",
            description: "Grave uma mensagem mais curta (máx 2MB)",
            variant: "destructive"
          });
          cleanup();
          return;
        }

        setIsSending(true);

        try {
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const base64 = e.target?.result as string;
              console.log("[Audio] Base64 pronto. Enviando...");
              
              const payload = {
                content: "",
                attachmentUrl: base64,
                attachmentType: "audio",
                chatterId: isStaff ? activeThreadId : undefined
              };

              const res = await fetch("/api/support/message", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
              });

              if (!res.ok) throw new Error(`Status ${res.status}`);

              console.log("[Audio] Sucesso!");
              setTimeout(() => refetchMessages(), 300);
              toast({ title: "Áudio enviado!", variant: "default" });
            } catch (innerErr: any) {
              console.error("[Audio] Erro envio:", innerErr);
              toast({
                title: "Erro ao enviar áudio",
                description: innerErr.message,
                variant: "destructive"
              });
            } finally {
              setIsSending(false);
              cleanup();
            }
          };

          reader.onerror = () => {
            console.error("[Audio] Erro leitura");
            setIsSending(false);
            cleanup();
          };

          reader.readAsDataURL(audioBlob);
        } catch (err: any) {
          console.error("[Audio] Erro geral:", err);
          setIsSending(false);
          cleanup();
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error: any) {
      console.error("[Audio] Erro mic:", error);
      toast({
        title: "Erro no microfone",
        description: "Verifique permissões",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      cleanup();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      discardRecordingRef.current = true;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    } else {
      cleanup();
    }
  };

  const handleMicClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const cleanup = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setIsRecording(false);
  };

  useEffect(() => {
    return () => cleanup();
  }, []);

  return (
    <div className="h-[calc(100vh-4rem)] flex gap-4 p-4">
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileSelect}
        accept="image/*,audio/*,video/*,application/pdf"
      />
      
      {/* Thread List (Staff Only) */}
      {isStaff && (
        <Card className="w-1/3 min-w-[300px] flex flex-col border border-white/5">
          <CardHeader className="p-4 border-b border-white/5">
            <CardTitle>Conversas</CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1 p-2">
              {threads?.map((thread: any) => (
                <div
                  key={thread.chatterId}
                  onClick={() => handleThreadClick(thread)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    activeThreadId === thread.chatterId 
                      ? "bg-secondary text-secondary-foreground" 
                      : "hover:bg-muted"
                  }`}
                >
              <Avatar>
                {(() => {
                  const fallbackUser = allUsers?.find((u: any) => u.id === thread.chatterId);
                  const avatarSrc = thread.chatterAvatar || fallbackUser?.avatar || null;
                  return avatarSrc ? (
                    <img src={avatarSrc} alt={thread.chatterName} className="h-full w-full object-cover" />
                  ) : (
                    <AvatarFallback>{thread.chatterName.substring(0, 2).toUpperCase()}</AvatarFallback>
                  );
                })()}
              </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold truncate">{thread.chatterName}</span>
                      {thread.unreadCount > 0 && (
                        <Badge variant="destructive" className="h-5 w-5 flex items-center justify-center p-0 rounded-full">
                          {thread.unreadCount}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {thread.lastMessage?.content || "Anexo"}
                    </p>
                  </div>
                </div>
              ))}
              {threads?.length === 0 && (
                <div className="p-4 text-center text-muted-foreground">Nenhuma conversa iniciada</div>
              )}
            </div>
          </ScrollArea>
        </Card>
      )}

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col shadow-xl border-none bg-background relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat" />
        
        <CardHeader className="p-3 border-b border-border/50 bg-card z-10 flex flex-row items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <Avatar className="h-10 w-10">
              {(() => {
                const activeThread = isStaff && activeThreadId
                  ? threads?.find((t: any) => t.chatterId === activeThreadId)
                  : null;
                const fallbackUser = activeThread
                  ? allUsers?.find((u: any) => u.id === activeThread.chatterId)
                  : null;
                const avatarSrc = activeThread?.chatterAvatar || fallbackUser?.avatar || null;

                if (avatarSrc) {
                  return (
                    <img
                      src={avatarSrc}
                      alt={activeThread?.chatterName || "Chatter"}
                      className="h-full w-full object-cover"
                    />
                  );
                }

                return (
                  <AvatarFallback className="bg-primary/20 text-primary">
                    {isStaff && activeThread
                      ? activeThread.chatterName.substring(0, 2).toUpperCase()
                      : "SP"}
                  </AvatarFallback>
                );
              })()}
            </Avatar>
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">
                {isStaff && activeThreadId 
                  ? threads?.find((t: any) => t.chatterId === activeThreadId)?.chatterName 
                  : "Suporte VIP Club"}
              </span>
              <span className="text-xs text-muted-foreground">Chat de suporte</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showSearch && (
              <Input
                placeholder="Pesquisar mensagens..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 w-44 bg-muted/40 border-border/60 text-xs"
              />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-full w-9 h-9"
              onClick={() => setShowSearch((prev) => !prev)}
              title="Pesquisar no chat"
            >
              <Search className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <div className="flex-1 overflow-hidden relative z-10">
          <div 
            ref={scrollRef} 
            className="h-full overflow-y-auto p-4 space-y-2 custom-scrollbar"
          >
            {!messages || messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center p-6 bg-card rounded-xl shadow-lg border border-border/50">
                  <p className="text-sm">Envie uma mensagem para iniciar o atendimento.</p>
                </div>
              </div>
            ) : (
              (searchTerm
                ? messages.filter((m: any) =>
                    (m.content || "").toLowerCase().includes(searchTerm.toLowerCase())
                  )
                : messages
              ).map((msg: any, index: number, arr: any[]) => {
                const isMe = msg.senderId === user?.id;
                const msgDate = getAdjustedDate(msg.createdAt);
                const prev = index > 0 ? getAdjustedDate(arr[index - 1].createdAt) : null;
                const isFirstOfDay = !prev || msgDate.toDateString() !== prev.toDateString();

                let dayLabel = format(msgDate, "dd/MM/yyyy");
                if (isToday(msgDate)) dayLabel = "Hoje";
                else if (isYesterday(msgDate)) dayLabel = "Ontem";

                return (
                  <div key={msg.id} className="space-y-1">
                    {isFirstOfDay && (
                      <div className="flex justify-center my-2">
                        <div className="px-3 py-1 rounded-full bg-muted text-xs text-muted-foreground">
                          {dayLabel}
                        </div>
                      </div>
                    )}
                    <div className={`flex ${isMe ? "justify-end" : "justify-start"} group`}>
                      <div
                        className={`max-w-[75%] sm:max-w-[60%] p-2 px-3 rounded-lg shadow-sm relative text-sm ${
                          isMe
                            ? "bg-primary text-primary-foreground rounded-tr-none"
                            : "bg-card text-foreground border border-border/50 rounded-tl-none"
                        }`}
                      >
                        {!isMe && (
                          <p className="text-xs font-bold mb-1 text-primary opacity-90">
                            {msg.senderName || "Usuário"}
                          </p>
                        )}
                        
                        {msg.attachmentUrl && (
                          <div className={`mb-2 overflow-hidden ${msg.attachmentType === "audio" ? "" : "rounded-md"}`}>
                            {msg.attachmentType === "image" && (
                              <div className="relative group/img inline-block">
                                <button
                                  type="button"
                                  className="block max-w-full"
                                  onClick={() =>
                                    setPreviewAttachment({ url: msg.attachmentUrl, type: "image" })
                                  }
                                >
                                  <img
                                    src={msg.attachmentUrl}
                                    className="max-w-full object-cover rounded-md"
                                    alt="Anexo"
                                  />
                                </button>
                                <a 
                                  href={msg.attachmentUrl} 
                                  download={`image-${Date.now()}.jpg`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute bottom-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover/img:opacity-100 transition-opacity z-10"
                                  title="Baixar imagem"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              </div>
                            )}
                            {msg.attachmentType === "audio" && (
                              <div className="flex items-center gap-2">
                                <VoiceMessagePlayer src={msg.attachmentUrl} />
                                <a 
                                  href={msg.attachmentUrl} 
                                  download={`audio-${Date.now()}.webm`}
                                  className="p-1.5 hover:bg-muted/20 rounded-full text-primary-foreground/80 hover:text-primary-foreground transition-colors"
                                  title="Baixar áudio"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              </div>
                            )}
                            {msg.attachmentType === "video" && (
                              <div className="relative group/vid inline-block">
                                <button
                                  type="button"
                                  className="block max-w-full"
                                  onClick={() =>
                                    setPreviewAttachment({ url: msg.attachmentUrl, type: "video" })
                                  }
                                >
                                  <video
                                    src={msg.attachmentUrl}
                                    className="max-w-full rounded-md"
                                  />
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover/vid:bg-black/5 pointer-events-none">
                                    <Play className="w-8 h-8 text-white/90 drop-shadow-md" />
                                  </div>
                                </button>
                                <a 
                                  href={msg.attachmentUrl} 
                                  download={`video-${Date.now()}.mp4`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute bottom-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover/vid:opacity-100 transition-opacity z-10"
                                  title="Baixar vídeo"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              </div>
                            )}
                            {(!["image", "audio", "video"].includes(msg.attachmentType) || msg.attachmentType === "file") && (
                              <div className="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/10 max-w-[280px]">
                                <div className="p-2 bg-primary/20 rounded-lg shrink-0">
                                  <FileText className="w-6 h-6 text-primary" />
                                </div>
                                <div className="flex-1 overflow-hidden min-w-0">
                                  <p className="text-sm font-medium truncate opacity-90 text-left">
                                    {msg.content || "Documento"}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground uppercase text-left">
                                    {msg.attachmentType === "file" ? "Arquivo" : msg.attachmentType}
                                  </p>
                                </div>
                                <a 
                                  href={msg.attachmentUrl} 
                                  download={msg.content || `document-${Date.now()}`}
                                  className="p-2 hover:bg-white/10 rounded-full text-primary transition-colors shrink-0"
                                  title="Baixar arquivo"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {msg.content && (
                          <p className="whitespace-pre-wrap leading-relaxed break-words">
                            {msg.content}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-end gap-1 mt-1">
                          {isMe && (
                            <CheckCheck
                              className={`w-3 h-3 ${
                                msg.read ? "text-sky-400" : "text-primary-foreground"
                              }`}
                            />
                          )}
                          <p className="text-[10px] leading-none text-primary-foreground/60">
                            {format(msgDate, "HH:mm")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="p-2 bg-card border-t border-border/50 z-10 flex items-end gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isSending}
            className="shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full w-10 h-10"
          >
            <Paperclip className="w-5 h-5" />
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                disabled={isSending}
                className="shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full w-10 h-10"
                title="Inserir emoji"
              >
                <Smile className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 border border-border/60 bg-card rounded-xl overflow-hidden">
              <EmojiPicker
                onEmojiClick={(emoji) => setInputText((prev) => prev + emoji.emoji)}
                theme={Theme.DARK}
                emojiStyle={EmojiStyle.NATIVE}
                width={320}
                height={360}
                lazyLoadEmojis
                previewConfig={{ showPreview: false }}
                skinTonesDisabled={false}
                searchDisabled={false}
                searchPlaceHolder="Pesquisar"
                style={{
                  backgroundColor: "hsl(var(--card))",
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                  boxShadow: "0 18px 35px rgba(15,23,42,0.65)",
                }}
              />
            </PopoverContent>
          </Popover>

          <Input 
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Mensagem"
            disabled={isSending}
            className="flex-1 bg-muted/50 border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-primary/20 rounded-lg min-h-[42px]"
          />

          {inputText.trim() ? (
            <Button 
              onClick={handleSend} 
              disabled={isSending}
              className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full w-10 h-10 p-0 shadow-md"
            >
              {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
            </Button>
          ) : (
            <>
              <Button 
                variant={isRecording ? "destructive" : "ghost"} 
                size="icon"
                onClick={handleMicClick}
                disabled={isSending}
                title={isRecording ? "Clique para finalizar e enviar" : "Clique para gravar áudio"}
                className={`shrink-0 rounded-full w-10 h-10 ${!isRecording ? "text-muted-foreground hover:bg-muted hover:text-foreground" : "animate-pulse"}`}
              >
                {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
              </Button>
              {isRecording && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={cancelRecording}
                  disabled={isSending}
                  title="Cancelar áudio"
                  className="shrink-0 rounded-full w-10 h-10 text-red-400 hover:text-red-500 hover:bg-red-500/10"
                >
                  <XCircle className="w-5 h-5" />
                </Button>
              )}
            </>
          )}
        </div>

        <Dialog
          open={!!previewAttachment}
          onOpenChange={(open) => {
            if (!open) setPreviewAttachment(null);
          }}
        >
          <DialogContent className="bg-card border-border max-w-3xl">
            {previewAttachment?.type === "image" && (
              <img
                src={previewAttachment.url}
                alt="Pré-visualização"
                className="w-full h-auto rounded-md"
              />
            )}
            {previewAttachment?.type === "video" && (
              <video
                controls
                autoPlay
                src={previewAttachment.url}
                className="w-full h-auto rounded-md"
              />
            )}
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}
