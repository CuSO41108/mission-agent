import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calendar,
  KeyRound,
  Mail,
  MessageSquare,
  Plus,
  Plug,
  Send,
  Settings2,
} from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { usePreferences } from "@/i18n";
import type { IntegrationAdapter, IntegrationType } from "@/types";
import AdapterEditor from "@/components/integrations/AdapterEditor";

const TYPE_ICON: Record<IntegrationType, typeof Mail> = {
  email: Mail,
  calendar: Calendar,
  social: MessageSquare,
  chat: Send,
  custom: Plug,
};

const TYPE_LABEL: Record<IntegrationType, string> = {
  email: "EMAIL",
  calendar: "CALENDAR",
  social: "SOCIAL",
  chat: "CHAT",
  custom: "CUSTOM API",
};

export default function Integrations() {
  const { text: t } = usePreferences();
  const integrations = useMissionStore((state) => state.integrations);
  const [searchParams, setSearchParams] = useSearchParams();
  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<IntegrationAdapter | null>(null);
  useEffect(() => {
    if (searchParams.get("register") !== "1") return;
    setSelected(null);
    setEditorOpen(true);
  }, [searchParams]);

  const credentialCount = useMemo(
    () => integrations.filter((item) => Object.values(item.config.secretConfigured).some(Boolean)).length,
    [integrations],
  );

  const openCreate = () => {
    setSelected(null);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setSelected(null);
    if (searchParams.has("register")) setSearchParams({}, { replace: true });
  };

  return (
    <main className="p-5 space-y-5 max-w-[1400px] mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] text-ink-faint mb-1">
            {t("连接外部服务与数据源", "Connect services and data sources")}
          </p>
          <h1 className="font-display font-semibold text-2xl text-ink">
            {t("集成", "Integrations")} <span className="text-ink-faint">{integrations.length}</span>
          </h1>
          <div className="flex items-center gap-4 mt-1 text-[11px] data-mono text-ink-faint">
            <span>{t("已注册", "Registered")} {integrations.length}</span>
            <span>{t("已存凭据", "Credentials stored")} {credentialCount}</span>
            <span className="text-amber-500">{t("运行时未连接", "Runtime not connected")}</span>
          </div>
        </div>
        <button onClick={openCreate} className="btn-phosphor h-9">
          <Plus className="w-3.5 h-3.5" strokeWidth={2} />
          {t("注册适配器", "Register adapter")}
        </button>
      </header>

      {integrations.length === 0 ? (
        <section className="min-h-[360px] panel border-dashed flex flex-col items-center justify-center text-center px-6">
          <div className="w-12 h-12 border border-obsidian-700 bg-obsidian-850 rounded flex items-center justify-center mb-4">
            <Plug className="w-5 h-5 text-phosphor-400" strokeWidth={1.5} />
          </div>
          <h2 className="font-display text-[15px] font-semibold text-ink">
            {t("尚未注册适配器", "No adapters registered")}
          </h2>
          <p className="mt-1.5 text-[11px] text-ink-faint max-w-md leading-relaxed">
            {t("从空配置开始。注册记录只保存在本机，真实连接需要后续接入对应运行时。", "Start with a local configuration. Connecting to a provider requires its runtime adapter.")}
          </p>
          <button onClick={openCreate} className="btn-phosphor mt-4">
            <Plus className="w-3 h-3" /> {t("注册第一个适配器", "Register first adapter")}
          </button>
        </section>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
          {integrations.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onConfigure={() => {
                setSelected(integration);
                setEditorOpen(true);
              }}
            />
          ))}
          <button
            onClick={openCreate}
            className="min-h-[270px] border border-dashed border-phosphor-400/18 text-ink-faint hover:text-phosphor-400 hover:border-phosphor-400/45 hover:bg-phosphor-400/[0.03] transition-colors flex flex-col items-center justify-center"
          >
            <Plus className="w-5 h-5 mb-2" strokeWidth={1.5} />
            <span className="text-[11px] font-display">{t("注册新适配器", "Register adapter")}</span>
          </button>
        </section>
      )}

      <AdapterEditor open={editorOpen} adapter={selected} onClose={closeEditor} />
    </main>
  );
}

function IntegrationCard({
  integration,
  onConfigure,
}: {
  integration: IntegrationAdapter;
  onConfigure: () => void;
}) {
  const { text: t } = usePreferences();
  const Icon = TYPE_ICON[integration.type];
  const secrets = Object.values(integration.config.secretConfigured).filter(Boolean).length;
  const endpoint = integration.config.endpoint || integration.config.webhookUrl || integration.config.imapHost;

  return (
    <article className="panel relative min-h-[270px] flex flex-col overflow-hidden border-white/8 hover:border-phosphor-400/35 transition-colors">
      <Icon className="absolute -right-4 top-16 w-24 h-24 text-phosphor-400 opacity-[0.035] pointer-events-none" strokeWidth={1} />

      <div className="relative p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="w-10 h-10 border border-phosphor-400/25 bg-phosphor-400/[0.04] flex items-center justify-center clip-corner">
            <Icon className="w-4.5 h-4.5 text-phosphor-400" strokeWidth={1.5} />
          </div>
          <div className="flex items-center gap-2 text-[9px] data-mono text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {t("未验证", "UNVERIFIED")}
          </div>
        </div>

        <div className="mt-4">
          <h2 className="font-display font-semibold text-[15px] text-ink leading-tight break-words">
            {integration.name}
          </h2>
          <p className="mt-1 text-[9px] data-mono text-ink-faint uppercase tracking-wider">
            {TYPE_LABEL[integration.type]} · {integration.config.provider || "CUSTOM"}
          </p>
          <p className="mt-3 text-[11px] text-ink-muted leading-relaxed min-h-[2.75rem]">
            {integration.description || t("未填写用途说明", "No description")}
          </p>
        </div>

        <dl className="mt-auto pt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/6 text-[10px]">
          <div className="min-w-0">
            <dt className="text-ink-faint">{t("目标地址", "Endpoint")}</dt>
            <dd className="mt-0.5 text-ink-muted truncate" title={endpoint || undefined}>{endpoint || "—"}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">{t("认证", "Authentication")}</dt>
            <dd className="mt-0.5 text-ink-muted uppercase">{integration.config.authType.replace("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">{t("安全凭据", "Secure credentials")}</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-ink-muted">
              <KeyRound className="w-3 h-3" /> {secrets}
            </dd>
          </div>
          <div>
            <dt className="text-ink-faint">{t("运行事件", "Runtime events")}</dt>
            <dd className="mt-0.5 text-ink-muted">0</dd>
          </div>
        </dl>
      </div>

      <footer className="relative shrink-0 border-t border-phosphor-400/12 p-3 bg-obsidian-950/30">
        <button onClick={onConfigure} className="w-full h-9 border border-phosphor-400/35 text-phosphor-400 hover:bg-phosphor-400/10 transition-colors flex items-center justify-center gap-2 text-[11px] font-display">
          <Settings2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          {t("编辑配置", "Edit configuration")}
        </button>
      </footer>
    </article>
  );
}
