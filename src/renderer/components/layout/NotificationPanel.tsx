import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Check,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  Bot,
  Mail,
  Cpu,
} from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { shortTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AgentNotification, NotificationType } from "@/types";

const TYPE_ICON: Record<NotificationType, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warn: AlertTriangle,
  error: XCircle,
};

const TYPE_COLOR: Record<NotificationType, string> = {
  info: "text-phosphor-400 border-phosphor-400/30 bg-phosphor-400/5",
  success: "text-jade border-jade/30 bg-jade/5",
  warn: "text-amber-400 border-amber-400/30 bg-amber-400/5",
  error: "text-coral border-coral/30 bg-coral/5",
};

const SOURCE_ICON = {
  agent: Bot,
  integration: Mail,
  system: Cpu,
};

function NotificationItem({ n }: { n: AgentNotification }) {
  const navigate = useNavigate();
  const markRead = useMissionStore((s) => s.markNotificationRead);

  const Icon = TYPE_ICON[n.type];
  const SourceIcon = SOURCE_ICON[n.source];

  const onClick = () => {
    markRead(n.id);
    if (n.folderId) {
      navigate(`/folders/${n.folderId}`);
    }
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex gap-2.5 px-3 py-2.5 text-left border-b border-white/5 transition-colors hover:bg-white/[0.02]",
        !n.read && "bg-phosphor-400/[0.03]"
      )}
    >
      <div
        className={cn(
          "w-6 h-6 shrink-0 flex items-center justify-center border",
          TYPE_COLOR[n.type]
        )}
      >
        <Icon className="w-3 h-3" strokeWidth={1.5} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {!n.read && (
            <span className="w-1 h-1 bg-phosphor-400 rounded-full shrink-0 animate-pulse-dot" />
          )}
          <p
            className={cn(
              "text-[12px] leading-tight truncate",
              n.read ? "text-ink-muted" : "text-ink"
            )}
          >
            {n.title}
          </p>
        </div>
        {n.body && (
          <p className="text-[11px] text-ink-faint mt-1 leading-relaxed line-clamp-2">
            {n.body}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="flex items-center gap-1 text-[9px] data-mono text-ink-faint">
            <SourceIcon className="w-2.5 h-2.5" strokeWidth={1.5} />
            {n.source}
          </span>
          <span className="text-[9px] data-mono text-ink-faint">·</span>
          <span className="text-[9px] data-mono text-ink-faint">
            {shortTime(n.timestamp)}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function NotificationPanel() {
  const open = useMissionStore((s) => s.notificationPanelOpen);
  const setOpen = useMissionStore((s) => s.setNotificationPanelOpen);
  const notifications = useMissionStore((s) => s.notifications);
  const markAll = useMissionStore((s) => s.markAllNotificationsRead);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* 透明遮罩，点击关闭 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed top-[60px] right-4 z-40 w-80 max-h-[70vh] flex flex-col border border-phosphor-400/30 bg-obsidian-900 shadow-2xl shadow-phosphor-400/10"
          >
            {/* 头部 */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-phosphor-400/15">
              <div className="flex items-center gap-2">
                <Bell className="w-3 h-3 text-phosphor-400" strokeWidth={1.5} />
                <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-ink">
                  通知 · NOTIFICATIONS
                </h3>
                {unread > 0 && (
                  <span className="text-[9px] data-mono text-phosphor-400 bg-phosphor-400/10 border border-phosphor-400/30 px-1.5 py-0.5">
                    {unread} NEW
                  </span>
                )}
              </div>
              <button
                onClick={markAll}
                disabled={unread === 0}
                className={cn(
                  "flex items-center gap-1 text-[10px] data-mono transition-colors",
                  unread === 0
                    ? "text-ink-faint/50 cursor-not-allowed"
                    : "text-ink-faint hover:text-phosphor-400"
                )}
              >
                <Check className="w-2.5 h-2.5" strokeWidth={1.5} />
                全部已读
              </button>
            </div>

            {/* 通知列表 */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-3 py-8 text-center text-[12px] text-ink-faint">
                  暂无通知
                </div>
              ) : (
                notifications.map((n) => <NotificationItem key={n.id} n={n} />)
              )}
            </div>

            {/* 底部 */}
            <div className="px-3 py-2 border-t border-phosphor-400/15 text-[9px] data-mono text-ink-faint text-center">
              由 Agent 心跳 · 接口同步 · 系统事件 推送
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
