import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, KeyRound, Loader2, Trash2, X } from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { usePreferences } from "@/i18n";
import type {
  IntegrationAdapter,
  IntegrationAuthType,
  IntegrationSecretKey,
  IntegrationType,
  UpsertIntegrationInput,
} from "@/types";

interface AdapterEditorProps {
  open: boolean;
  adapter: IntegrationAdapter | null;
  onClose: () => void;
}

interface Template {
  key: string;
  label: string;
  type: IntegrationType;
  provider: string;
  name: string;
  description: string;
  endpoint?: string;
  imapHost?: string;
  imapPort?: number;
  smtpHost?: string;
  smtpPort?: number;
  authType: IntegrationAuthType;
}

const TEMPLATES: Template[] = [
  {
    key: "generic",
    label: "Generic API",
    type: "custom",
    provider: "Generic",
    name: "",
    description: "",
    authType: "api_key",
  },
  {
    key: "gmail",
    label: "Gmail",
    type: "email",
    provider: "Google",
    name: "Gmail",
    description: "邮件与附件接入",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    authType: "oauth2",
  },
  {
    key: "feishu",
    label: "飞书",
    type: "chat",
    provider: "ByteDance",
    name: "飞书",
    description: "消息、文档与事件接入",
    endpoint: "https://open.feishu.cn",
    authType: "oauth2",
  },
  {
    key: "slack",
    label: "Slack",
    type: "chat",
    provider: "Slack",
    name: "Slack",
    description: "频道消息与事件接入",
    endpoint: "https://slack.com/api",
    authType: "oauth2",
  },
  {
    key: "notion",
    label: "Notion",
    type: "custom",
    provider: "Notion",
    name: "Notion",
    description: "页面与数据库接入",
    endpoint: "https://api.notion.com",
    authType: "api_key",
  },
  {
    key: "webhook",
    label: "Webhook",
    type: "custom",
    provider: "Webhook",
    name: "Webhook",
    description: "接收或发送 HTTP 事件",
    authType: "webhook",
  },
];

const SECRET_FIELDS: Record<IntegrationAuthType, IntegrationSecretKey[]> = {
  none: [],
  api_key: ["apiKey"],
  oauth2: ["clientId", "clientSecret"],
  basic: ["username", "password"],
  webhook: ["token"],
};

const SECRET_LABEL: Record<IntegrationSecretKey, string> = {
  apiKey: "API Key",
  clientId: "Client ID",
  clientSecret: "Client Secret",
  username: "Username",
  password: "Password",
  token: "Signing token",
};

const emptyInput = (): UpsertIntegrationInput => ({
  name: "",
  type: "custom",
  description: "",
  config: {
    provider: "",
    account: "",
    endpoint: "",
    imapHost: "",
    imapPort: null,
    smtpHost: "",
    smtpPort: null,
    webhookUrl: "",
    authType: "api_key",
  },
});

export default function AdapterEditor({ open, adapter, onClose }: AdapterEditorProps) {
  const { text: t } = usePreferences();
  const createIntegration = useMissionStore((state) => state.createIntegration);
  const updateIntegration = useMissionStore((state) => state.updateIntegration);
  const deleteIntegration = useMissionStore((state) => state.deleteIntegration);
  const [draft, setDraft] = useState<UpsertIntegrationInput>(emptyInput);
  const [template, setTemplate] = useState("generic");
  const [secrets, setSecrets] = useState<Partial<Record<IntegrationSecretKey, string>>>({});
  const [clearSecrets, setClearSecrets] = useState<Set<IntegrationSecretKey>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (adapter) {
      setDraft({
        name: adapter.name,
        type: adapter.type,
        description: adapter.description,
        config: {
          provider: adapter.config.provider,
          account: adapter.config.account,
          endpoint: adapter.config.endpoint,
          imapHost: adapter.config.imapHost,
          imapPort: adapter.config.imapPort,
          smtpHost: adapter.config.smtpHost,
          smtpPort: adapter.config.smtpPort,
          webhookUrl: adapter.config.webhookUrl,
          authType: adapter.config.authType,
        },
      });
      setTemplate("custom");
    } else {
      setDraft(emptyInput());
      setTemplate("generic");
    }
    setSecrets({});
    setClearSecrets(new Set());
    setError("");
  }, [adapter, open]);

  const activeSecretFields = useMemo(
    () => SECRET_FIELDS[draft.config.authType],
    [draft.config.authType],
  );

  const applyTemplate = (key: string) => {
    setTemplate(key);
    const selected = TEMPLATES.find((item) => item.key === key);
    if (!selected) return;
    setDraft({
      name: selected.name,
      type: selected.type,
      description: selected.description,
      config: {
        provider: selected.provider,
        account: "",
        endpoint: selected.endpoint ?? "",
        imapHost: selected.imapHost ?? "",
        imapPort: selected.imapPort ?? null,
        smtpHost: selected.smtpHost ?? "",
        smtpPort: selected.smtpPort ?? null,
        webhookUrl: "",
        authType: selected.authType,
      },
    });
    setSecrets({});
    setClearSecrets(new Set());
  };

  const patchConfig = (partial: Partial<UpsertIntegrationInput["config"]>) =>
    setDraft((current) => ({ ...current, config: { ...current.config, ...partial } }));

  const submit = async () => {
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const secretChanges: UpsertIntegrationInput["secrets"] = { ...secrets };
      for (const key of clearSecrets) secretChanges[key] = null;
      const input = { ...draft, secrets: secretChanges };
      if (adapter) await updateIntegration(adapter.id, input);
      else await createIntegration(input);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!adapter || saving) return;
    const confirmed = window.confirm(
      t(
        `确定删除适配器“${adapter.name}”及其本地配置吗？`,
        `Delete adapter “${adapter.name}” and its local configuration?`,
      ),
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteIntegration(adapter.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 backdrop-blur-sm" onClick={onClose}>
      <section
        className="w-full max-w-3xl max-h-[90dvh] mx-4 overflow-hidden border border-phosphor-400/30 bg-obsidian-900 shadow-2xl shadow-phosphor-400/10 flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 flex items-start justify-between px-5 py-4 border-b border-phosphor-400/15">
          <div>
            <p className="text-[9px] data-mono text-phosphor-400 uppercase tracking-[0.2em] mb-1">ADAPTER CONFIG</p>
            <h2 className="font-display text-[15px] font-semibold text-ink">
              {adapter ? t("编辑适配器", "Edit adapter") : t("注册适配器", "Register adapter")}
            </h2>
          </div>
          <button onClick={onClose} className="btn-icon" title={t("关闭", "Close")}>
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {!adapter && (
            <Field label={t("配置模板", "Configuration template")}>
              <select value={template} onChange={(event) => applyTemplate(event.target.value)} className="input w-full">
                {TEMPLATES.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t("适配器名称", "Adapter name")}>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="input w-full" placeholder="Gmail / Internal webhook" />
            </Field>
            <Field label={t("接口类型", "Integration type")}>
              <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as IntegrationType })} className="input w-full">
                <option value="email">Email</option>
                <option value="calendar">Calendar</option>
                <option value="chat">Chat</option>
                <option value="social">Social</option>
                <option value="custom">Custom API</option>
              </select>
            </Field>
            <Field label={t("服务商", "Provider")}>
              <input value={draft.config.provider} onChange={(event) => patchConfig({ provider: event.target.value })} className="input w-full" placeholder="Google / ByteDance / Internal" />
            </Field>
            <Field label={t("账户或地址", "Account or address")}>
              <input value={draft.config.account} onChange={(event) => patchConfig({ account: event.target.value })} className="input w-full" placeholder="you@example.com" />
            </Field>
          </div>

          <Field label={t("用途说明", "Description")}>
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={2} className="input w-full resize-none" placeholder={t("记录这个适配器负责接入哪些数据", "Describe the data this adapter will handle")} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Base URL">
              <input value={draft.config.endpoint} onChange={(event) => patchConfig({ endpoint: event.target.value })} className="input w-full" placeholder="https://api.example.com" />
            </Field>
            <Field label="Webhook URL">
              <input value={draft.config.webhookUrl} onChange={(event) => patchConfig({ webhookUrl: event.target.value })} className="input w-full" placeholder="https://hooks.example.com/..." />
            </Field>
          </div>

          {draft.type === "email" && (
            <div className="grid grid-cols-[1fr_7rem] sm:grid-cols-[1fr_7rem_1fr_7rem] gap-3">
              <Field label="IMAP host"><input value={draft.config.imapHost} onChange={(event) => patchConfig({ imapHost: event.target.value })} className="input w-full" /></Field>
              <Field label="IMAP port"><input type="number" value={draft.config.imapPort ?? ""} onChange={(event) => patchConfig({ imapPort: event.target.value ? Number(event.target.value) : null })} className="input w-full" /></Field>
              <Field label="SMTP host"><input value={draft.config.smtpHost} onChange={(event) => patchConfig({ smtpHost: event.target.value })} className="input w-full" /></Field>
              <Field label="SMTP port"><input type="number" value={draft.config.smtpPort ?? ""} onChange={(event) => patchConfig({ smtpPort: event.target.value ? Number(event.target.value) : null })} className="input w-full" /></Field>
            </div>
          )}

          <div className="border-t border-white/8 pt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={t("认证方式", "Authentication")}>
                <select value={draft.config.authType} onChange={(event) => patchConfig({ authType: event.target.value as IntegrationAuthType })} className="input w-full">
                  <option value="none">None</option>
                  <option value="api_key">API Key</option>
                  <option value="oauth2">OAuth 2.0</option>
                  <option value="basic">Username / Password</option>
                  <option value="webhook">Webhook token</option>
                </select>
              </Field>
            </div>
            {activeSecretFields.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeSecretFields.map((key) => {
                  const configured = adapter?.config.secretConfigured[key] === true;
                  return (
                    <Field key={key} label={SECRET_LABEL[key]}>
                      <div className="space-y-1.5">
                        <div className="relative">
                          <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-faint" />
                          <input
                            type="password"
                            value={secrets[key] ?? ""}
                            onChange={(event) => setSecrets((current) => ({ ...current, [key]: event.target.value }))}
                            className="input w-full pl-8"
                            placeholder={configured ? t("已安全保存；留空保持", "Stored securely; leave blank to keep") : t("输入后由系统安全存储加密", "Encrypted by system secure storage")}
                          />
                        </div>
                        {configured && (
                          <label className="flex items-center gap-2 text-[10px] text-ink-faint">
                            <input
                              type="checkbox"
                              checked={clearSecrets.has(key)}
                              onChange={(event) => setClearSecrets((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(key); else next.delete(key);
                                return next;
                              })}
                            />
                            {t("清除已保存凭据", "Clear stored credential")}
                          </label>
                        )}
                      </div>
                    </Field>
                  );
                })}
              </div>
            )}
          </div>

          {error && <div className="border border-coral/30 bg-coral/5 px-3 py-2 text-[11px] text-coral">{error}</div>}
        </div>

        <footer className="shrink-0 flex items-center justify-between gap-3 px-5 py-3 border-t border-phosphor-400/15 bg-obsidian-950/40">
          <div>
            {adapter && (
              <button onClick={() => void remove()} disabled={saving} className="btn-coral">
                <Trash2 className="w-3 h-3" /> {t("删除适配器", "Delete adapter")}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost">{t("取消", "Cancel")}</button>
            <button onClick={() => void submit()} disabled={!draft.name.trim() || saving} className="btn-phosphor disabled:opacity-40">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {t("保存配置", "Save configuration")}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] text-ink-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
