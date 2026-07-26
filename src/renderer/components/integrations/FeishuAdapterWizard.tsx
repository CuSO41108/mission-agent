import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, ExternalLink, HelpCircle, Loader2, Send, Trash2, X } from "lucide-react";
import { useMissionStore } from "@/store/useMissionStore";
import { usePreferences } from "@/i18n";
import type {
  IntegrationAdapter,
  IntegrationMode,
  IntegrationSecretKey,
  IntegrationTarget,
  UpsertIntegrationInput,
} from "@/types";

interface Props {
  open: boolean;
  adapter: IntegrationAdapter | null;
  onClose: () => void;
}

const STEPS = ["接入方式", "应用凭据", "授权目标群", "测试连接", "完成"];

function emptyInput(mode: IntegrationMode = "feishu_webhook"): UpsertIntegrationInput {
  return {
    name: mode === "feishu_app" ? "飞书自建应用" : "飞书群机器人",
    type: "chat",
    description: "由显式工作流节点向授权群发送文本消息",
    config: {
      provider: "Feishu",
      account: "",
      endpoint: "https://open.feishu.cn",
      imapHost: "",
      imapPort: null,
      smtpHost: "",
      smtpPort: null,
      webhookUrl: "",
      authType: mode === "feishu_app" ? "oauth2" : "webhook",
      mode,
      targets: [],
    },
  };
}

function inputFromAdapter(adapter: IntegrationAdapter): UpsertIntegrationInput {
  return {
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
      webhookUrl: "",
      authType: adapter.config.authType,
      mode: adapter.config.mode === "legacy" ? "feishu_webhook" : adapter.config.mode,
      targets: adapter.config.targets,
    },
  };
}

export default function FeishuAdapterWizard({ open, adapter, onClose }: Props) {
  const { text: t } = usePreferences();
  const createIntegration = useMissionStore((state) => state.createIntegration);
  const updateIntegration = useMissionStore((state) => state.updateIntegration);
  const deleteIntegration = useMissionStore((state) => state.deleteIntegration);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<UpsertIntegrationInput>(emptyInput);
  const [workingAdapter, setWorkingAdapter] = useState<IntegrationAdapter | null>(null);
  const [secrets, setSecrets] = useState<Partial<Record<IntegrationSecretKey, string | null>>>({});
  const [availableTargets, setAvailableTargets] = useState<IntegrationTarget[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set());
  const [testTargetId, setTestTargetId] = useState("");
  const [webhookTargetName, setWebhookTargetName] = useState("飞书通知群");
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const next = adapter ? inputFromAdapter(adapter) : emptyInput();
    setDraft(next);
    setWorkingAdapter(adapter);
    setStep(1);
    setSecrets({});
    setAvailableTargets(adapter?.config.targets ?? []);
    setSelectedTargetIds(new Set(adapter?.config.targets.map((target) => target.id) ?? []));
    setTestTargetId(adapter?.config.targets[0]?.id ?? "");
    setWebhookTargetName(adapter?.config.targets[0]?.name ?? "飞书通知群");
    setError("");
    setHelpOpen(false);
  }, [adapter, open]);

  const mode = draft.config.mode;
  const configured = workingAdapter?.config.secretConfigured;
  const selectedTargets = useMemo(() => {
    if (mode === "feishu_webhook") {
      return webhookTargetName.trim()
        ? [{ id: "webhook", name: webhookTargetName.trim(), kind: "webhook" as const }]
        : [];
    }
    return availableTargets.filter((target) => selectedTargetIds.has(target.id));
  }, [availableTargets, mode, selectedTargetIds, webhookTargetName]);

  const setMode = (nextMode: IntegrationMode) => {
    setDraft(emptyInput(nextMode));
    setSecrets(nextMode === "feishu_app"
      ? { webhookUrl: null, token: null }
      : { clientId: null, clientSecret: null });
    setAvailableTargets([]);
    setSelectedTargetIds(new Set());
    setTestTargetId("");
    setError("");
  };

  const persist = async (): Promise<IntegrationAdapter> => {
    const input: UpsertIntegrationInput = {
      ...draft,
      config: { ...draft.config, targets: selectedTargets },
      secrets,
    };
    const saved = workingAdapter
      ? await updateIntegration(workingAdapter.id, input)
      : await createIntegration(input);
    setWorkingAdapter(saved);
    setDraft(inputFromAdapter(saved));
    return saved;
  };

  const next = async () => {
    if (busy) return;
    setError("");
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      const hasWebhook = Boolean(secrets.webhookUrl || configured?.webhookUrl);
      const hasAppId = Boolean(secrets.clientId || configured?.clientId);
      const hasAppSecret = Boolean(secrets.clientSecret || configured?.clientSecret);
      if (mode === "feishu_webhook" && !hasWebhook) return setError("请填写群机器人 Webhook URL");
      if (mode === "feishu_app" && (!hasAppId || !hasAppSecret)) return setError("请填写 App ID 和 App Secret");
      setBusy(true);
      try {
        const saved = await persist();
        if (mode === "feishu_app") {
          const targets = await window.missionConsole.getIntegrationTargets(saved.id);
          setAvailableTargets(targets);
        }
        setStep(3);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 3) {
      if (selectedTargets.length === 0) return setError("请至少授权一个目标群");
      setBusy(true);
      try {
        await persist();
        setTestTargetId((current) => selectedTargets.some((target) => target.id === current)
          ? current
          : selectedTargets[0]?.id ?? "");
        setStep(4);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 4) {
      const target = selectedTargets.find((item) => item.id === testTargetId) ?? selectedTargets[0];
      if (!target) return setError("请选择测试目标群");
      const confirmed = window.confirm(t(
        `将向“${target.name}”发送测试消息：\n\nMission Console 连接测试，可安全忽略。\n\n是否继续？`,
        `Send a test message to “${target.name}”?\n\nMission Console connection test. You can safely ignore this message.`,
      ));
      if (!confirmed) return;
      setBusy(true);
      try {
        const saved = await persist();
        const tested = await window.missionConsole.testIntegration(saved.id, target.id);
        if (tested) setWorkingAdapter(tested);
        setStep(5);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    }
  };

  const remove = async () => {
    if (!workingAdapter || busy) return;
    if (!window.confirm(t(`确定删除“${workingAdapter.name}”吗？`, `Delete “${workingAdapter.name}”?`))) return;
    setBusy(true);
    try {
      await deleteIntegration(workingAdapter.id);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-950/80 backdrop-blur-sm" onClick={onClose}>
      <section className="w-full max-w-4xl max-h-[92dvh] mx-4 overflow-hidden border border-phosphor-400/30 bg-obsidian-900 shadow-2xl flex flex-col" onClick={(event) => event.stopPropagation()}>
        <header className="shrink-0 flex items-start justify-between gap-4 px-5 py-4 border-b border-phosphor-400/15">
          <div>
            <p className="text-[9px] data-mono text-phosphor-400 uppercase tracking-[0.2em] mb-1">FEISHU CONNECTOR · BETA</p>
            <h2 className="font-display text-[15px] font-semibold text-ink">{t("飞书适配器配置向导", "Feishu connector setup")}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setHelpOpen((value) => !value)} className="btn-ghost"><HelpCircle className="w-3.5 h-3.5" />{t("配置帮助", "Help")}</button>
            <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
          </div>
        </header>

        <div className="shrink-0 grid grid-cols-5 border-b border-white/6">
          {STEPS.map((label, index) => <div key={label} className={`px-3 py-2 text-center text-[9px] data-mono ${step === index + 1 ? "text-phosphor-400 bg-phosphor-400/5" : index + 1 < step ? "text-jade" : "text-ink-faint"}`}>{index + 1}. {label}</div>)}
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[10px] leading-relaxed text-amber-300">
              {t("实验性：保存配置不会发送消息。只有通过测试的适配器，才能被显式工作流节点调用。", "Experimental: saving never sends messages. Only tested connectors can be used by explicit workflow nodes.")}
            </div>

            {step === 1 && <ModeStep mode={mode} setMode={setMode} />}
            {step === 2 && <CredentialStep mode={mode} draft={draft} setDraft={setDraft} secrets={secrets} setSecrets={setSecrets} configured={configured} />}
            {step === 3 && <TargetStep mode={mode} targetName={webhookTargetName} setTargetName={setWebhookTargetName} targets={availableTargets} selected={selectedTargetIds} setSelected={setSelectedTargetIds} />}
            {step === 4 && <TestStep adapterName={draft.name} mode={mode} targets={selectedTargets} testTargetId={testTargetId} setTestTargetId={setTestTargetId} />}
            {step === 5 && <div className="min-h-56 flex flex-col items-center justify-center text-center"><Check className="w-10 h-10 text-jade mb-3" /><h3 className="font-display text-lg text-ink">{t("飞书连接测试成功", "Feishu connection verified")}</h3><p className="mt-2 max-w-lg text-[11px] leading-relaxed text-ink-faint">{t("现在可以在工作流画布中添加“发送飞书消息”节点，并从授权目标群列表中选择收件群。", "You can now add a Send Feishu Message node and select from the authorized target list.")}</p></div>}
            {error && <div className="border border-coral/30 bg-coral/5 px-3 py-2 text-[11px] text-coral">{error}</div>}
          </div>

          {helpOpen && <HelpPanel mode={mode} />}
        </div>

        <footer className="shrink-0 flex items-center justify-between px-5 py-3 border-t border-phosphor-400/15 bg-obsidian-950/40">
          <div>{workingAdapter && <button onClick={() => void remove()} disabled={busy} className="btn-coral"><Trash2 className="w-3 h-3" />{t("删除适配器", "Delete")}</button>}</div>
          <div className="flex items-center gap-2">
            {step > 1 && step < 5 && <button onClick={() => { setStep((value) => Math.max(1, value - 1)); setError(""); }} disabled={busy} className="btn-ghost"><ChevronLeft className="w-3 h-3" />{t("上一步", "Back")}</button>}
            {step === 5 ? <button onClick={onClose} className="btn-phosphor"><Check className="w-3 h-3" />{t("完成", "Done")}</button> : <button onClick={() => void next()} disabled={busy} className="btn-phosphor disabled:opacity-40">{busy ? <Loader2 className="w-3 h-3 animate-spin" /> : step === 4 ? <Send className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{step === 4 ? t("预览并测试连接", "Preview and test") : t("下一步", "Continue")}</button>}
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function ModeStep({ mode, setMode }: { mode: IntegrationMode; setMode: (mode: IntegrationMode) => void }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {([
      { id: "feishu_webhook", title: "群机器人 Webhook", detail: "最小权限，只能向绑定群发送消息。不读取聊天内容。" },
      { id: "feishu_app", title: "企业自建应用", detail: "使用 App ID / Secret，可从机器人所在群列表中授权多个目标群。" },
    ] as const).map((item) => <button key={item.id} onClick={() => setMode(item.id)} className={`p-5 border text-left transition-colors ${mode === item.id ? "border-phosphor-400 bg-phosphor-400/5" : "border-white/10 hover:border-phosphor-400/35"}`}><p className="font-display text-[14px] text-ink">{item.title}</p><p className="mt-2 text-[11px] leading-relaxed text-ink-faint">{item.detail}</p></button>)}
  </div>;
}

function CredentialStep({ mode, draft, setDraft, secrets, setSecrets, configured }: { mode: IntegrationMode; draft: UpsertIntegrationInput; setDraft: React.Dispatch<React.SetStateAction<UpsertIntegrationInput>>; secrets: Partial<Record<IntegrationSecretKey, string | null>>; setSecrets: React.Dispatch<React.SetStateAction<Partial<Record<IntegrationSecretKey, string | null>>>>; configured?: Record<IntegrationSecretKey, boolean> }) {
  const secret = (key: IntegrationSecretKey, label: string, optional = false) => <Field label={`${label}${optional ? "（可选）" : ""}`}><input type="password" className="input w-full" value={secrets[key] ?? ""} onChange={(event) => setSecrets((current) => ({ ...current, [key]: event.target.value }))} placeholder={configured?.[key] ? "已安全保存；留空保持" : "输入后保存至系统安全存储"} /></Field>;
  return <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="适配器名称"><input className="input w-full" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></Field>
      <Field label="用途说明"><input className="input w-full" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></Field>
    </div>
    {mode === "feishu_webhook" ? <div className="grid grid-cols-1 gap-3">{secret("webhookUrl", "Webhook URL")}{secret("token", "签名密钥", true)}</div> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{secret("clientId", "App ID")}{secret("clientSecret", "App Secret")}</div>}
    <p className="text-[10px] leading-relaxed text-ink-faint">凭据不会进入 SQLite、工作流 JSON、运行日志或渲染进程持久状态。</p>
  </div>;
}

function TargetStep({ mode, targetName, setTargetName, targets, selected, setSelected }: { mode: IntegrationMode; targetName: string; setTargetName: (value: string) => void; targets: IntegrationTarget[]; selected: Set<string>; setSelected: React.Dispatch<React.SetStateAction<Set<string>>> }) {
  if (mode === "feishu_webhook") return <div className="space-y-3"><Field label="目标群显示名称"><input className="input w-full" value={targetName} onChange={(event) => setTargetName(event.target.value)} placeholder="例如：产品研发群" /></Field><p className="text-[10px] text-ink-faint">Webhook 已固定绑定一个群；这里的名称仅用于工作流下拉选择和审计日志。</p></div>;
  return <div className="space-y-2"><p className="text-[11px] text-ink-muted">选择允许工作流发送消息的群。未勾选的群不会出现在工作流节点中。</p>{targets.length === 0 ? <div className="border border-amber-500/25 p-3 text-[10px] text-amber-300">没有读取到机器人所在群。请确认应用已启用机器人能力、发布版本，并把机器人加入目标群。</div> : targets.map((target) => <label key={target.id} className="flex items-center gap-3 border border-white/8 px-3 py-2.5 text-[11px] text-ink-muted"><input type="checkbox" checked={selected.has(target.id)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(target.id); else next.delete(target.id); return next; })} />{target.name}<span className="ml-auto text-[9px] data-mono text-ink-faint">{target.id}</span></label>)}</div>;
}

function TestStep({ adapterName, mode, targets, testTargetId, setTestTargetId }: { adapterName: string; mode: IntegrationMode; targets: IntegrationTarget[]; testTargetId: string; setTestTargetId: (value: string) => void }) {
  return <div className="space-y-4"><div className="border border-white/8 p-4"><p className="text-[10px] text-ink-faint">适配器</p><p className="mt-1 text-[12px] text-ink">{adapterName} · {mode === "feishu_app" ? "企业自建应用" : "群机器人 Webhook"}</p><div className="mt-3"><Field label="测试目标群"><select className="input w-full" value={testTargetId} onChange={(event) => setTestTargetId(event.target.value)}>{targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></Field></div></div><div className="border border-phosphor-400/20 bg-phosphor-400/[0.03] p-4"><p className="text-[10px] data-mono text-phosphor-400">MESSAGE PREVIEW</p><p className="mt-3 text-[12px] text-ink">Mission Console 连接测试，可安全忽略。</p></div><p className="text-[10px] leading-relaxed text-amber-300">点击测试后会产生一条真实飞书消息；保存配置本身不会发送。</p></div>;
}

function HelpPanel({ mode }: { mode: IntegrationMode }) {
  return <aside className="w-80 shrink-0 border-l border-white/8 overflow-y-auto p-4 space-y-4 bg-obsidian-950/35"><div><p className="text-[10px] data-mono text-phosphor-400">配置帮助</p><h3 className="mt-1 font-display text-[13px] text-ink">{mode === "feishu_app" ? "企业自建应用" : "群机器人 Webhook"}</h3></div>{mode === "feishu_webhook" ? <ol className="list-decimal pl-4 space-y-2 text-[10px] leading-relaxed text-ink-muted"><li>进入目标飞书群的群设置。</li><li>添加“自定义机器人”。</li><li>复制 Webhook 地址。</li><li>如开启签名校验，同时复制签名密钥。</li></ol> : <ol className="list-decimal pl-4 space-y-2 text-[10px] leading-relaxed text-ink-muted"><li>在飞书开放平台创建企业自建应用。</li><li>启用机器人能力。</li><li>申请发送消息和读取机器人所在群基本信息权限。</li><li>发布应用，并将机器人加入目标群。</li><li>复制 App ID 与 App Secret。</li></ol>}<a href="https://open.feishu.cn/app" target="_blank" rel="noreferrer" className="btn-ghost w-full justify-center">打开飞书开放平台<ExternalLink className="w-3 h-3" /></a><p className="text-[9px] leading-relaxed text-ink-faint">外部文档由飞书维护；Mission Console 不会从链接中读取或保存登录信息。</p></aside>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="block text-[10px] text-ink-muted mb-1.5">{label}</span>{children}</label>;
}
