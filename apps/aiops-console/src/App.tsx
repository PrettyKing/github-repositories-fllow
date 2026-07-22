import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, Bot, Boxes, CheckCircle2, ChevronRight,
  CloudCog, Code2, DatabaseZap, ExternalLink, FileTerminal, Gauge, LogOut,
  MapPin, Play, RefreshCw, Search, ShieldCheck, Sparkles, XCircle,
} from "lucide-react";
import { api } from "./api";
import { beginLogin, completeLogin, getToken, logout } from "./auth";
import type { Incident, LogEvent, Overview } from "./types";

const cn = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");
const formatTime = (value?: string | number) => value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const queueName = (arn: string) => arn.split(":").at(-1) ?? arn;
const visibleMessages = (overview?: Overview) => overview?.dlqs.reduce((sum, item) => sum + Number(item.attributes?.ApproximateNumberOfMessages ?? 0), 0) ?? 0;
const canaryState = (overview?: Overview) => overview?.canaries.flatMap((item) => item.runs).find(Boolean)?.Status?.State ?? "WAITING";
const healthy = (state?: string) => ["PASSED", "OK", "RESOLVED", "CLOSED"].includes(state?.toUpperCase() ?? "");

function Button({ children, variant = "primary", loading, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; loading?: boolean }) {
  return <button className={cn("button", `button-${variant}`, className)} disabled={loading || props.disabled} {...props}>
    {loading && <RefreshCw size={15} className="animate-spin" />}{children}
  </button>;
}

function StatusBadge({ value }: { value?: string }) {
  const ok = healthy(value);
  return <span className={cn("status-badge", ok ? "status-ok" : value === "WAITING" ? "status-muted" : "status-warn")}>
    {ok ? <CheckCircle2 size={12} /> : value === "WAITING" ? <Activity size={12} /> : <AlertTriangle size={12} />}{value ?? "UNKNOWN"}
  </span>;
}

function Panel({ id, title, eyebrow, icon: Icon, action, children, className }: { id?: string; title: string; eyebrow?: string; icon: React.ElementType; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section id={id} className={cn("panel", className)}>
    <header className="panel-header"><div className="panel-title-wrap"><span className="panel-icon"><Icon size={17} /></span><div>{eyebrow && <p>{eyebrow}</p>}<h2>{title}</h2></div></div>{action}</header>
    {children}
  </section>;
}

function Metric({ label, value, hint, icon: Icon, tone = "cyan" }: { label: string; value: string | number; hint: string; icon: React.ElementType; tone?: "cyan" | "violet" | "green" | "amber" }) {
  return <article className="metric-card"><div className={cn("metric-icon", `tone-${tone}`)}><Icon size={18} /></div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty"><CheckCircle2 size={20} /><span>{children}</span></div>;
}

function Login({ error }: { error?: string }) {
  return <main className="login-shell"><div className="login-grid" aria-hidden="true" /><section className="login-card">
    <div className="brand-mark"><Bot size={27} /></div><p className="overline">AWS OPERATIONS</p><h1>让系统状态<br /><span>一目了然。</span></h1>
    <p className="login-intro">统一查看 CloudWatch、Synthetics、消息队列与部署状态。通过 Cognito 安全访问。</p>
    {error && <div className="error-banner"><XCircle size={16} />{error}</div>}
    <Button onClick={() => void beginLogin()} className="login-button">管理员登录 <ArrowRight size={16} /></Button>
    <div className="security-note"><ShieldCheck size={15} /> Cognito PKCE · 不在浏览器保存 AWS 凭证</div>
  </section></main>;
}

function IncidentList({ incidents, selectedId, onSelect }: { incidents: Incident[]; selectedId?: string; onSelect: (incident: Incident) => void }) {
  if (!incidents.length) return <Empty>最近没有 Incident</Empty>;
  return <div className="incident-list">{incidents.map((incident) => <button key={incident.incidentId} className={cn("incident-row", selectedId === incident.incidentId && "incident-active")} onClick={() => onSelect(incident)}>
    <span className={cn("incident-dot", healthy(incident.state) ? "dot-ok" : "dot-warn")} /><span className="incident-main"><strong>{incident.alarmName ?? incident.incidentId}</strong><small>{incident.incidentId} · {formatTime(incident.updatedAt ?? incident.createdAt)}</small></span><StatusBadge value={incident.state} /><ChevronRight size={16} className="chevron" />
  </button>)}</div>;
}

function Dashboard() {
  const [overview, setOverview] = useState<Overview>();
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>();
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [logGroup, setLogGroup] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [queueResult, setQueueResult] = useState<Record<string, unknown>>();
  const [testingQueue, setTestingQueue] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<Incident>();
  const [incidentDetail, setIncidentDetail] = useState<Record<string, unknown> | null>();

  const refresh = useCallback(async () => {
    setRefreshing(true); setError("");
    try { const data = await api.overview(); setOverview(data); setLogGroup((current) => current || data.logGroups[0] || ""); setLastUpdated(new Date()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "数据加载失败"); }
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const systemHealthy = (overview?.alarms.length ?? 0) === 0 && visibleMessages(overview) === 0 && healthy(canaryState(overview));

  async function loadLogs() {
    if (!logGroup) return; setLoadingLogs(true); setError("");
    try { setLogs(await api.logs(logGroup, minutes)); } catch (cause) { setError(cause instanceof Error ? cause.message : "日志加载失败"); }
    finally { setLoadingLogs(false); }
  }
  async function runQueueTest() {
    setTestingQueue(true); setError("");
    try { setQueueResult(await api.queueTest()); window.setTimeout(() => void refresh(), 2500); } catch (cause) { setError(cause instanceof Error ? cause.message : "测试发送失败"); }
    finally { setTestingQueue(false); }
  }
  async function selectIncident(incident: Incident) {
    setSelectedIncident(incident); setIncidentDetail(undefined);
    try { setIncidentDetail(await api.incident(incident.incidentId)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Incident 加载失败"); }
  }

  const deploymentCount = useMemo(() => overview?.deployments.reduce((sum, item) => sum + item.deployments.length, 0) ?? 0, [overview]);
  return <div className="app-shell">
    <aside className="sidebar"><div className="sidebar-brand"><span><CloudCog size={21} /></span><div><strong>AI Ops</strong><small>Control plane</small></div></div><nav>
      <a className="nav-active" href="#overview"><Gauge size={18} />总览</a><a href="#signals"><Activity size={18} />运行信号</a><a href="#logs"><FileTerminal size={18} />日志</a><a href="#incidents"><AlertTriangle size={18} />Incidents</a>
    </nav><div className="sidebar-foot"><div className="region-chip"><MapPin size={14} /><span>{overview?.region ?? "加载中"}</span></div><button onClick={logout}><LogOut size={16} />退出登录</button></div></aside>
    <main className="main-content"><header className="topbar"><div><div className="breadcrumb">AWS / <span>AI Ops Console</span></div><h1>运行总览</h1><p>集中观察核心服务健康度与事件流转状态。</p></div><div className="top-actions"><div className={cn("health-chip", systemHealthy ? "health-ok" : "health-warn")}><span />{systemHealthy ? "所有系统正常" : "需要关注"}</div><Button variant="secondary" loading={refreshing} onClick={() => void refresh()}><RefreshCw size={15} />刷新</Button></div></header>
      {error && <div className="error-banner"><XCircle size={16} /><span>{error}</span><button onClick={() => setError("")}>关闭</button></div>}
      {window.AIOPS_CONFIG.demoMode && <div className="demo-banner"><Sparkles size={14} /><span><strong>本地预览模式</strong> 当前显示安全 Mock 数据，不会访问或修改 AWS。</span></div>}
      <section id="overview" className="metrics-grid"><Metric label="AWS 区域" value={overview?.region ?? "—"} hint="当前运行区域" icon={MapPin} /><Metric label="活跃告警" value={overview?.alarms.length ?? "—"} hint="CloudWatch ALARM" icon={AlertTriangle} tone="amber" /><Metric label="Canary 状态" value={canaryState(overview)} hint="最近一次巡检" icon={Activity} tone="green" /><Metric label="DLQ 可见消息" value={visibleMessages(overview)} hint="等待人工处理" icon={DatabaseZap} tone="violet" /></section>
      <div id="signals" className="two-column">
        <Panel title="活跃告警" eyebrow="CLOUDWATCH" icon={AlertTriangle} action={<span className="count-label">{overview?.alarms.length ?? 0} 项</span>}><div className="list-stack">{overview?.alarms.length ? overview.alarms.map((alarm) => <div className="data-row" key={alarm.AlarmName}><span className="data-icon warn"><AlertTriangle size={15} /></span><div><strong>{alarm.AlarmName}</strong><small>{alarm.StateReason ?? "等待状态说明"}</small></div><time>{formatTime(alarm.StateUpdatedTimestamp)}</time></div>) : <Empty>当前没有活跃告警</Empty>}</div></Panel>
        <Panel title="API 巡检" eyebrow="SYNTHETICS CANARY" icon={Activity}>{overview?.canaries.length ? <div className="list-stack">{overview.canaries.map((canary) => <div className="data-row" key={canary.name}><span className="data-icon ok"><Activity size={15} /></span><div><strong>{canary.name}</strong><small>最近 {canary.runs.length} 次运行</small></div><div className="badge-stack">{canary.runs.slice(0, 3).map((run, index) => <StatusBadge value={run.Status?.State} key={index} />)}</div></div>)}</div> : <Empty>暂无 Canary 数据</Empty>}</Panel>
        <Panel title="死信队列" eyebrow="SQS" icon={DatabaseZap}>{overview?.dlqs.length ? <div className="list-stack">{overview.dlqs.map((queue) => <div className="data-row" key={queue.arn}><span className="data-icon violet"><DatabaseZap size={15} /></span><div><strong>{queueName(queue.arn)}</strong><small>处理中 {queue.attributes?.ApproximateNumberOfMessagesNotVisible ?? 0}</small></div><span className="number-value">{queue.attributes?.ApproximateNumberOfMessages ?? 0}<small>可见</small></span></div>)}</div> : <Empty>未配置死信队列</Empty>}</Panel>
        <Panel title="最近部署" eyebrow="CODEDEPLOY · 24H" icon={Code2} action={<span className="count-label">{deploymentCount} 次</span>}>{overview?.deployments.length ? <div className="list-stack">{overview.deployments.map((deployment) => <div className="data-row" key={deployment.group}><span className="data-icon cyan"><Code2 size={15} /></span><div><strong>{deployment.group.split("/").at(-1)}</strong><small>{deployment.deployments.length ? deployment.deployments.join(", ") : "24 小时内无部署"}</small></div></div>)}</div> : <Empty>没有部署记录</Empty>}</Panel>
      </div>
      <Panel title="消息链路验证" eyebrow="SNS → SQS → CONSUMER" icon={Boxes} className="queue-panel" action={<Button loading={testingQueue} onClick={() => void runQueueTest()}><Play size={15} />发送测试事件</Button>}><div className="queue-flow"><div><span><CloudCog size={17} /></span><strong>SNS Topic</strong></div><ArrowRight /><div><span><Boxes size={17} /></span><strong>SQS Queue</strong></div><ArrowRight /><div><span><Bot size={17} /></span><strong>Consumer</strong></div></div>{queueResult ? <div className="result-box"><div><CheckCircle2 size={16} /><strong>测试事件已发布</strong></div><code>{JSON.stringify(queueResult, null, 2)}</code></div> : <p className="panel-help">发送无用户数据的安全测试事件，验证完整消息链路。正常情况下 Consumer 会消费消息，DLQ 保持为 0。</p>}</Panel>
      <Panel id="logs" title="日志检索" eyebrow="CLOUDWATCH LOGS · 已脱敏" icon={FileTerminal} action={<div className="filter-bar"><select value={logGroup} onChange={(event) => setLogGroup(event.target.value)} aria-label="日志组">{overview?.logGroups.map((group) => <option key={group}>{group}</option>)}</select><select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} aria-label="时间范围"><option value={15}>最近 15 分钟</option><option value={30}>最近 30 分钟</option><option value={60}>最近 60 分钟</option></select><Button loading={loadingLogs} onClick={() => void loadLogs()}><Search size={15} />查询</Button></div>}><div className="log-viewer">{logs.length ? logs.map((entry, index) => <div className="log-line" key={`${entry.timestamp}-${index}`}><time>{formatTime(entry.timestamp)}</time><code>{entry.message}</code></div>) : <div className="log-placeholder"><FileTerminal size={24} /><span>选择日志组并开始查询</span></div>}</div></Panel>
      <Panel id="incidents" title="最近 Incident" eyebrow="AI OPS EVENT HISTORY" icon={Sparkles} className="incident-panel"><div className="incident-layout"><IncidentList incidents={overview?.incidents ?? []} selectedId={selectedIncident?.incidentId} onSelect={(incident) => void selectIncident(incident)} /><div className="incident-detail">{selectedIncident ? <><div className="detail-heading"><div><p>INCIDENT DETAIL</p><h3>{selectedIncident.alarmName ?? selectedIncident.incidentId}</h3></div><StatusBadge value={selectedIncident.state} /></div>{incidentDetail === undefined ? <div className="detail-loading"><RefreshCw className="animate-spin" />加载详情…</div> : <pre>{JSON.stringify(incidentDetail, null, 2)}</pre>}</> : <div className="detail-empty"><Sparkles size={25} /><strong>选择一个 Incident</strong><span>查看触发告警、分析结论与建议动作</span></div>}</div></div></Panel>
      <footer><span>AI Ops Console · AWS 托管</span><span>{lastUpdated ? `最后更新 ${formatTime(lastUpdated.getTime())}` : "正在同步状态"}</span><a href="https://console.aws.amazon.com/" target="_blank" rel="noreferrer">打开 AWS Console <ExternalLink size={12} /></a></footer>
    </main>
  </div>;
}

export function App() {
  const [authenticated, setAuthenticated] = useState(window.AIOPS_CONFIG.demoMode || Boolean(getToken()));
  const [authError, setAuthError] = useState("");
  useEffect(() => { void completeLogin().then((completed) => { if (completed) setAuthenticated(true); }).catch((cause: unknown) => setAuthError(cause instanceof Error ? cause.message : "登录失败")); }, []);
  return authenticated ? <Dashboard /> : <Login error={authError} />;
}
