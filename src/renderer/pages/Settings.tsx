import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  KeyRound,
  FolderOpen,
  HeartPulse,
  Monitor,
  Plug,
  Settings2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Languages,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/i18n";
import { useMissionStore } from "@/store/useMissionStore";
import type {
  AppConfig,
} from "@core/config";

type TestStatus = "idle" | "testing" | "success" | "error";

export default function Settings() {
  const { locale, setLocale, theme, setTheme, text: t } = usePreferences();
  const integrations = useMissionStore((state) => state.integrations);
  const [config, setConfigState] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  // 用于模型连接测试时拿当前表单里的临时值（用户可能还没保存）
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftModel, setDraftModel] = useState("deepseek-chat");
  const [draftHeartbeatInterval, setDraftHeartbeatInterval] = useState(60);
  const [draftShortcut, setDraftShortcut] = useState("");
  const [saveError, setSaveError] = useState("");

  // 加载配置
  useEffect(() => {
    void window.missionConsole.getConfig().then((cfg) => {
      setConfigState(cfg);
      setDraftApiKey("");
      setDraftModel(cfg.deepseek.model);
      setDraftHeartbeatInterval(cfg.agent.heartbeatIntervalMin);
      setDraftShortcut(cfg.system.globalShortcut);
      setLoading(false);
    });
  }, []);

  // 保存局部配置
  async function savePartial(partial: Partial<AppConfig>) {
    if (!config) return null;
    setSaving(true);
    setSaveError("");
    try {
      const merged = await window.missionConsole.setConfig(partial);
      setConfigState(merged);
      return merged;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveHeartbeatInterval() {
    const merged = await savePartial({
      agent: {
        ...config!.agent,
        heartbeatIntervalMin: draftHeartbeatInterval,
      },
    });
    if (merged) setDraftHeartbeatInterval(merged.agent.heartbeatIntervalMin);
  }

  // 测试 OpenAI 兼容模型连接
  async function testConnection() {
    setTestStatus("testing");
    setTestMessage("");
    // 先保存当前 draft，再触发测试（测试用的是落盘后的 config）
    const saved = await savePartial({
      deepseek: { ...config!.deepseek, apiKey: draftApiKey, model: draftModel },
    });
    if (!saved) {
      setTestStatus("error");
      setTestMessage(t("模型配置保存失败，未发起测试请求", "Model settings could not be saved; no test request was sent"));
      return;
    }
    const result = await window.missionConsole.testDeepSeek();
    if (result.ok) {
      setTestStatus("success");
      setTestMessage(`${t("连接成功 · 模型", "Connected · Model")} ${result.model}: ${result.content.slice(0, 60)}`);
    } else {
      setTestStatus("error");
      setTestMessage(result.error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 text-phosphor-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* 页头 */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-2xl tracking-wide text-ink">{t("设置", "Settings")}</h1>
            <p className="text-[11px] text-ink-faint mt-1 data-mono">
              CONFIG · userData/config.yaml + safeStorage
            </p>
          </div>
          {saving && (
            <div className="flex items-center gap-2 text-[11px] text-phosphor-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t("保存中...", "Saving...")}
            </div>
          )}
        </header>

        <Section
          icon={Languages}
          title={t("外观与语言", "Appearance & language")}
          desc={t("界面显示偏好", "Interface display preferences")}
          code="UI"
        >
          <Field label={t("界面语言", "Display language")}>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setLocale("zh-CN")}
                className={cn(
                  "flex items-center justify-between border px-3 py-2 text-left transition-colors",
                  locale === "zh-CN"
                    ? "border-phosphor-400/60 bg-phosphor-400/10 text-phosphor-100"
                    : "border-white/10 text-ink-muted hover:border-phosphor-400/30",
                )}
              >
                <span className="text-[12px] font-medium">简体中文</span>
                <span className="text-[10px] data-mono text-ink-faint">ZH</span>
              </button>
              <button
                onClick={() => setLocale("en-US")}
                className={cn(
                  "flex items-center justify-between border px-3 py-2 text-left transition-colors",
                  locale === "en-US"
                    ? "border-phosphor-400/60 bg-phosphor-400/10 text-phosphor-100"
                    : "border-white/10 text-ink-muted hover:border-phosphor-400/30",
                )}
              >
                <span className="text-[12px] font-medium">English</span>
                <span className="text-[10px] data-mono text-ink-faint">EN</span>
              </button>
            </div>
          </Field>
          <Field label={t("界面主题", "Color theme")}>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex items-center gap-2 border px-3 py-2 text-left transition-colors",
                  theme === "dark"
                    ? "border-phosphor-400/60 bg-phosphor-400/10 text-phosphor-100"
                    : "border-white/10 text-ink-muted hover:border-phosphor-400/30",
                )}
              >
                <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-[12px] font-medium">{t("暗色", "Dark")}</span>
              </button>
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex items-center gap-2 border px-3 py-2 text-left transition-colors",
                  theme === "light"
                    ? "border-phosphor-400/60 bg-phosphor-400/10 text-phosphor-100"
                    : "border-white/10 text-ink-muted hover:border-phosphor-400/30",
                )}
              >
                <Sun className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-[12px] font-medium">{t("亮色", "Light")}</span>
              </button>
            </div>
          </Field>
        </Section>

        {/* 1. OpenAI 兼容模型配置 */}
        <Section
          icon={KeyRound}
          title={t("模型配置", "Model configuration")}
          desc={t("OpenAI 兼容协议 · DeepSeek 仅为默认示例", "OpenAI-compatible API · DeepSeek is only the default example")}
          code="LLM"
        >
          <Field label="API Key">
            <div className="flex items-center gap-2">
              <input
                type={showApiKey ? "text" : "password"}
                value={draftApiKey}
                onChange={(e) => setDraftApiKey(e.target.value)}
                placeholder={config?.deepseek.apiKeyConfigured ? t("已安全保存；留空表示不更换", "Saved securely; leave blank to keep it") : "sk-xxxxxxxxxxxx"}
                className="flex-1 input"
              />
              <button
                onClick={() => setShowApiKey((v) => !v)}
                className="btn-icon"
                title={showApiKey ? t("隐藏", "Hide") : t("显示", "Show")}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </Field>

          <Field label={t("模型", "Model")}>
            <input
              type="text"
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              placeholder="deepseek-chat / gpt-4.1-mini / ..."
              className="input"
            />
          </Field>

          <Field label="Base URL">
            <input
              type="text"
              value={config?.deepseek.baseUrl ?? ""}
              onChange={(e) =>
                savePartial({ deepseek: { ...config!.deepseek, baseUrl: e.target.value } })
              }
              placeholder="https://api.deepseek.com"
              className="input"
            />
          </Field>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={testConnection}
              disabled={testStatus === "testing" || (!draftApiKey && !config?.deepseek.apiKeyConfigured)}
              className="btn-phosphor"
            >
              {testStatus === "testing" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : null}
              {t("测试连接", "Test connection")}
            </button>
            <button
              onClick={() =>
                savePartial({
                  deepseek: {
                    ...config!.deepseek,
                    apiKey: draftApiKey,
                    model: draftModel,
                  },
                })
              }
              className="btn-ghost"
            >
              {t("保存", "Save")}
            </button>
            {testStatus === "success" && (
              <span className="flex items-center gap-1.5 text-[11px] text-jade">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {t("连接成功", "Connected")}
              </span>
            )}
            {testStatus === "error" && (
              <span className="flex items-center gap-1.5 text-[11px] text-rose-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {t("连接失败", "Connection failed")}
              </span>
            )}
          </div>

          {testMessage && (
            <div
              className={cn(
                "mt-2 p-2.5 border text-[11px] data-mono break-all",
                testStatus === "success"
                  ? "border-jade/30 bg-jade/5 text-jade"
                  : "border-rose-400/30 bg-rose-400/5 text-rose-300",
              )}
            >
              {testMessage}
            </div>
          )}
        </Section>

        {/* 2. 仓库目录 */}
        <Section icon={FolderOpen} title={t("仓库目录", "Vault directory")} desc={t("归档文件存储位置", "Location for archived files")} code="FS">
          <Field label={t("路径", "Path")}>
            <input
              type="text"
              value={config?.storage.vaultDir ?? ""}
              onChange={(e) =>
                savePartial({ storage: { ...config!.storage, vaultDir: e.target.value } })
              }
              placeholder="C:\Users\you\Documents\MissionVault"
              className="input"
            />
          </Field>
          <p className="text-[11px] text-ink-faint">
            {t("留空则使用引用模式：只记录文件原路径，不复制。归档模式下文件会复制到此目录的子文件夹。", "Leave empty to retain source paths without copying files. Archive mode copies files into subfolders here.")}
          </p>
        </Section>

        {/* 3. 心跳调度 */}
        <Section icon={HeartPulse} title={t("心跳调度", "Heartbeat schedule")} desc={t("Agent 自动巡检间隔", "Automatic Agent check interval")} code="HB">
          <Field label={t("执行频率", "Frequency")}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={1440}
                step={5}
                value={draftHeartbeatInterval}
                onChange={(e) => setDraftHeartbeatInterval(Number(e.target.value))}
                className="input flex-1"
              />
              <span className="text-[11px] text-ink-muted">{t("分钟", "minutes")}</span>
              <button onClick={saveHeartbeatInterval} className="btn-ghost">
                {t("应用", "Apply")}
              </button>
            </div>
            <p className="text-[10px] text-ink-faint mt-1.5">
              {t("默认 60 分钟，可设置 5–1440 分钟；修改后从当前时间重新计时。", "Defaults to 60 minutes. Allowed range: 5–1440; changing it restarts the countdown.")}
            </p>
          </Field>
          <Toggle
            label={t("心跳开关", "Heartbeat")}
            desc={t("关闭后所有 Agent 停止自动巡检", "Turn off to stop automatic Agent checks")}
            checked={config?.agent.enabled ?? false}
            onChange={(v) => savePartial({ agent: { ...config!.agent, enabled: v } })}
          />
        </Section>

        {/* 4. 系统选项 */}
        <Section icon={Monitor} title={t("系统选项", "System options")} desc={t("桌面应用行为", "Desktop app behavior")} code="SYS">
          <Toggle
            label={t("开机自启", "Launch at startup")}
            desc={t("当前版本暂未启用，默认关闭", "Temporarily unavailable and kept off")}
            checked={false}
            disabled
            onChange={() => undefined}
          />
          <Toggle
            label={t("托盘图标", "Tray icon")}
            desc={t("关闭后窗口隐藏时无托盘入口", "Hide tray access when the window is closed")}
            checked={config?.system.trayIcon ?? true}
            onChange={(v) => savePartial({ system: { ...config!.system, trayIcon: v } })}
          />
          <Field label={t("全局快捷键", "Global shortcut")}>
            <input
              type="text"
              value={draftShortcut}
              onChange={(e) => setDraftShortcut(e.target.value)}
              placeholder="Ctrl+Alt+Space"
              className="input"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost"
                onClick={async () => {
                  const merged = await savePartial({ system: { ...config!.system, globalShortcut: draftShortcut } });
                  if (merged) setDraftShortcut(merged.system.globalShortcut);
                }}
              >
                {t("应用快捷键", "Apply shortcut")}
              </button>
              <span className="text-[10px] text-ink-faint">{t("输入完成后手动应用；失败时保留旧快捷键。", "Apply after typing; failures keep the previous shortcut.")}</span>
            </div>
          </Field>
        </Section>

        {saveError && (
          <div className="border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-[11px] text-rose-300">
            {saveError}
          </div>
        )}

        {/* 5. 适配器配置入口 */}
        <Section
          icon={Plug}
          title={t("适配器配置", "Adapter configuration")}
          desc={t("地址、认证方式与系统安全凭据", "Endpoints, authentication, and system-secured credentials")}
          code="EXT"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-white/8 px-3 py-2.5">
              <p className="text-[9px] data-mono text-ink-faint uppercase">{t("已注册", "Registered")}</p>
              <p className="mt-1 font-display text-lg text-ink">{integrations.length}</p>
            </div>
            <div className="border border-white/8 px-3 py-2.5">
              <p className="text-[9px] data-mono text-ink-faint uppercase">{t("运行状态", "Runtime")}</p>
              <p className="mt-1 text-[11px] text-amber-400">NOT CONNECTED</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-[11px] text-ink-faint leading-relaxed">
              {t("每个适配器独立保存配置；真实连接与同步运行时尚未启用。", "Each adapter keeps its own configuration; connection and sync runtimes are not enabled yet.")}
            </p>
            <Link to="/integrations" className="btn-ghost shrink-0">
              <Settings2 className="w-3 h-3" /> {t("管理适配器", "Manage adapters")}
            </Link>
          </div>
        </Section>

        <div className="h-8" />
      </div>
    </div>
  );
}

// ============ 子组件 ============

function Section({
  icon: Icon,
  title,
  desc,
  code,
  children,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  code: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-phosphor-400/15 bg-obsidian-800/40 backdrop-blur-sm"
    >
      <header className="px-4 py-3 border-b border-phosphor-400/10 flex items-center gap-3">
        <div className="w-7 h-7 flex items-center justify-center border border-phosphor-400/30 bg-phosphor-400/5">
          <Icon className="w-3.5 h-3.5 text-phosphor-400" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          <p className="text-[10px] text-ink-faint">{desc}</p>
        </div>
        <span className="text-[9px] data-mono text-ink-faint border border-white/5 px-1.5 py-0.5">
          {code}
        </span>
      </header>
      <div className="px-4 py-3 space-y-3">{children}</div>
    </motion.section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-ink-muted mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  desc,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <div className="text-[12px] text-ink">{label}</div>
        {desc && <div className="text-[10px] text-ink-faint mt-0.5">{desc}</div>}
      </div>
      <button
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative w-9 h-5 rounded-full transition-colors",
          disabled && "opacity-40 cursor-not-allowed",
          checked ? "bg-phosphor-400/80" : "bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-obsidian-900 transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}
