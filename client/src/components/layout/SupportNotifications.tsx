import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

let notificationAudioCtx: AudioContext | null = null;

const getNotificationAudioContext = () => {
  if (!notificationAudioCtx || notificationAudioCtx.state === "closed") {
    notificationAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return notificationAudioCtx;
};

const playNotificationSound = () => {
  try {
    const ctx = getNotificationAudioContext();

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {
        notificationAudioCtx = null;
      });
    }

    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(520, now);
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.linearRampToValueAtTime(0.02, now + 0.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    const secondStart = now + 0.22;
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(440, secondStart);
    gain2.gain.setValueAtTime(0.1, secondStart);
    gain2.gain.linearRampToValueAtTime(0.01, secondStart + 0.26);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(secondStart);
    osc2.stop(secondStart + 0.28);
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

export function SupportNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) return;

    const socket = io({
      withCredentials: true,
      transports: ["websocket"],
    });

    socketRef.current = socket;

    socket.on("new_support_message", (msg: any) => {
      const isOwnMessage = msg.senderId === user.id;
      const activeSupportChatterId = (window as any).__activeSupportChatterId as number | null | undefined;
      const isStaff = ["admin", "dev", "supervisor"].includes(user.role);

      const isChatCurrentlyOpenForStaff =
        isStaff && typeof activeSupportChatterId === "number" && msg.chatterId === activeSupportChatterId;

      const isChatCurrentlyOpenForChatter =
        !isStaff && typeof activeSupportChatterId === "number" && activeSupportChatterId === user.id;

      const shouldSuppressToast = isChatCurrentlyOpenForStaff || isChatCurrentlyOpenForChatter;

      if (!isOwnMessage && !shouldSuppressToast) {
        playNotificationSound();

        if (isStaff) {
          toast({
            title: "Nova mensagem de suporte",
            description: msg.senderName ? `De ${msg.senderName}` : undefined,
          });
        } else {
          toast({
            title: "Nova mensagem do suporte",
            description: msg.senderName ? `De ${msg.senderName}` : undefined,
          });
        }
      }

      if (["admin", "dev", "supervisor"].includes(user.role)) {
        queryClient.invalidateQueries({ queryKey: ["/api/support/threads"] });
        queryClient.invalidateQueries({ queryKey: ["/api/support/history"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/support/history", "mine"] });
        queryClient.invalidateQueries({ queryKey: ["/api/support/unread-count"] });
      }
    });

    socket.on("support_read_by_staff", (payload: any) => {
      if (!user || ["admin", "dev", "supervisor"].includes(user.role)) return;
      if (!payload || payload.chatterId !== user.id) return;
      queryClient.invalidateQueries({ queryKey: ["/api/support/history", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/unread-count"] });
    });

    return () => {
      socket.off("new_support_message");
      socket.off("support_read_by_staff");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user, toast]);

  return null;
}
