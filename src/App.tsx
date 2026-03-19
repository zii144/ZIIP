import React, { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Send,
  History,
  Settings,
  Trash2,
  ArrowUp,
  Copy,
  Plus,
  FileInput,
  ChevronDown,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import logoSvg from "/logo.svg";
import "./App.css";

type KeyValuePair = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

type ChatMessage = { id: string; role: "user" | "assistant"; text: string };

type RequestHistoryEntry = {
  id: string;
  method: string;
  url: string;
  timestamp: number;
  status?: number;
  time_ms?: number;
};

const HISTORY_STORAGE_KEY = "ziip-request-history";
const LLM_PROVIDER_STORAGE = "ziip-llm-provider";
const GEMINI_API_KEY_STORAGE = "ziip-gemini-api-key";
const OPENAI_API_KEY_STORAGE = "ziip-openai-api-key";
const ENVIRONMENTS_STORAGE_KEY = "ziip-environments";
const ACTIVE_ENVIRONMENT_STORAGE_KEY = "ziip-active-environment";
const HISTORY_MAX_ITEMS = 50;

type EnvironmentVariable = { id: string; key: string; value: string };
type Environment = {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
};

function substituteVariables(
  text: string,
  vars: Record<string, string>,
): { resolved: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const resolved = text.replace(/\{\{([^}]+)\}\}/g, (_, name) => {
    const key = name.trim();
    if (key && vars[key] !== undefined) return vars[key];
    if (key && !unresolved.includes(key)) unresolved.push(key);
    return `{{${key}}}`;
  });
  return { resolved, unresolved };
}

function getActiveEnvVariables(
  environments: Environment[],
  activeId: string | null,
): Record<string, string> {
  if (!activeId) return {};
  const env = environments.find((e) => e.id === activeId);
  if (!env) return {};
  const out: Record<string, string> = {};
  for (const v of env.variables) {
    if (v.key.trim()) out[v.key.trim()] = v.value;
  }
  return out;
}

function loadEnvironments(): Environment[] {
  try {
    const raw = localStorage.getItem(ENVIRONMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEnvironments(envs: Environment[]) {
  try {
    localStorage.setItem(ENVIRONMENTS_STORAGE_KEY, JSON.stringify(envs));
  } catch {}
}

function resolveRequestData(
  vars: Record<string, string>,
  url: string,
  params: KeyValuePair[],
  headers: KeyValuePair[],
  bodyContent: string,
  authType: "None" | "Bearer" | "Basic",
  bearerToken: string,
  basicUsername: string,
  basicPassword: string,
): {
  finalUrl: string;
  compiledHeaders: Record<string, string>;
  body: string;
  contextParams: { key: string; value: string }[];
  unresolved: string[];
} {
  const allUnresolved: string[] = [];
  const addUnresolved = (u: string[]) => {
    for (const name of u) if (!allUnresolved.includes(name)) allUnresolved.push(name);
  };
  const sub = (text: string) => {
    const r = substituteVariables(text, vars);
    addUnresolved(r.unresolved);
    return r.resolved;
  };

  let resolvedUrl = sub(url);
  const compiledHeaders: Record<string, string> = {};
  for (const h of headers) {
    if (h.enabled && h.key) {
      compiledHeaders[sub(h.key)] = sub(h.value);
    }
  }
  if (authType === "Bearer" && bearerToken) {
    const t = sub(bearerToken);
    compiledHeaders["Authorization"] = `Bearer ${t.trim()}`;
  } else if (authType === "Basic" && (basicUsername || basicPassword)) {
    compiledHeaders["Authorization"] =
      `Basic ${btoa(`${sub(basicUsername)}:${sub(basicPassword)}`)}`;
  }
  const resolvedBody = sub(bodyContent);
  const contextParams = params
    .filter((p) => p.enabled && p.key)
    .map((p) => ({ key: sub(p.key), value: sub(p.value) }));

  let finalUrl = resolvedUrl;
  try {
    const urlObj = new URL(resolvedUrl.includes("://") ? resolvedUrl : `https://${resolvedUrl}`);
    for (const p of contextParams) urlObj.searchParams.append(p.key, p.value);
    finalUrl = urlObj.toString();
  } catch {}

  return {
    finalUrl,
    compiledHeaders,
    body: resolvedBody,
    contextParams,
    unresolved: allUnresolved,
  };
}

function renderHighlightedText(text: string): React.ReactNode {
  if (!text.includes("{{")) return text;
  const parts: React.ReactNode[] = [];
  const regex = /\{\{([^}]*)\}\}/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    parts.push(
      <span
        key={match.index}
        className="text-violet-600 bg-violet-50 rounded-[3px] px-[2px] ring-1 ring-inset ring-violet-200/80"
      >
        {match[0]}
      </span>,
    );
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

function VarInput({
  value,
  className = "",
  wrapperClassName = "",
  mirrorPadding = "px-3 py-1.5",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  wrapperClassName?: string;
  mirrorPadding?: string;
}) {
  const text = String(value ?? "");
  const hasVars = /\{\{[^}]*\}\}/.test(text);
  if (!hasVars) return <input {...props} value={value} className={className} />;
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        {...props}
        value={value}
        className={`${className} !text-transparent caret-slate-900 selection:bg-violet-200/50`}
      />
      <div
        className={`absolute inset-0 ${mirrorPadding} text-sm font-mono pointer-events-none overflow-hidden whitespace-nowrap text-slate-900 flex items-center`}
        aria-hidden="true"
      >
        {renderHighlightedText(text)}
      </div>
    </div>
  );
}

function VarTextarea({
  value,
  className = "",
  mirrorPadding = "p-4",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  mirrorPadding?: string;
}) {
  const text = String(value ?? "");
  const hasVars = /\{\{[^}]*\}\}/.test(text);
  if (!hasVars) return <textarea {...props} value={value} className={className} />;
  return (
    <div className="relative w-full h-full">
      <textarea
        {...props}
        value={value}
        className={`${className} !text-transparent caret-slate-900 selection:bg-violet-200/50`}
      />
      <div
        className={`absolute inset-0 ${mirrorPadding} text-sm font-mono pointer-events-none overflow-auto whitespace-pre-wrap text-slate-800`}
        aria-hidden="true"
      >
        {renderHighlightedText(text)}
      </div>
    </div>
  );
}

const LLM_PROVIDERS = [
  { id: "gemini", label: "Gemini (Google)", keyHint: "AIza...", keyUrl: "ai.google.dev" },
  { id: "openai", label: "OpenAI (GPT)", keyHint: "sk-...", keyUrl: "platform.openai.com" },
] as const;
type LLMProviderId = (typeof LLM_PROVIDERS)[number]["id"];

function getApiKeyStorageKey(provider: LLMProviderId): string {
  return provider === "gemini" ? GEMINI_API_KEY_STORAGE : OPENAI_API_KEY_STORAGE;
}

function formatRelativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function loadHistory(): RequestHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: RequestHistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

const HEADER_PRESETS: { label: string; key: string; value: string }[] = [
  {
    label: "Content-Type JSON",
    key: "Content-Type",
    value: "application/json",
  },
  { label: "Accept JSON", key: "Accept", value: "application/json" },
  { label: "User-Agent", key: "User-Agent", value: "ZIIP/0.1" },
  {
    label: "Cache No-Store",
    key: "Cache-Control",
    value: "no-cache, no-store",
  },
  {
    label: "X-Requested-With",
    key: "X-Requested-With",
    value: "XMLHttpRequest",
  },
];

function App() {
  const [url, setUrl] = useState("https://httpbin.org/get");
  const [response, setResponse] = useState("");
  const [responseMeta, setResponseMeta] = useState<{
    status: number;
    time_ms: number;
  } | null>(null);
  const [method, setMethod] = useState("GET");

  const [activeTab, setActiveTab] = useState<
    "Headers" | "Params" | "Body" | "Auth"
  >("Headers");
  const [headers, setHeaders] = useState<KeyValuePair[]>([
    { id: crypto.randomUUID(), key: "", value: "", enabled: true },
  ]);
  const [params, setParams] = useState<KeyValuePair[]>([
    { id: crypto.randomUUID(), key: "", value: "", enabled: true },
  ]);
  const [bodyContent, setBodyContent] = useState("");
  const [authType, setAuthType] = useState<"None" | "Bearer" | "Basic">("None");
  const [bearerToken, setBearerToken] = useState("");
  const [basicUsername, setBasicUsername] = useState("");
  const [basicPassword, setBasicPassword] = useState("");

  const [lastResponseHeaders, setLastResponseHeaders] = useState<
    Record<string, string>
  >({});
  const [headersBulkPasteOpen, setHeadersBulkPasteOpen] = useState(false);
  const [headersBulkPasteText, setHeadersBulkPasteText] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Hello! I am ZII. Tell me what API endpoint you want to test, or ask me to generate a mock payload for your current request.",
    },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [requestHistory, setRequestHistory] = useState<RequestHistoryEntry[]>(
    loadHistory,
  );
  const [historyDropdownOpen, setHistoryDropdownOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [environments, setEnvironments] = useState<Environment[]>(loadEnvironments);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_ENVIRONMENT_STORAGE_KEY),
  );
  const [settingsProvider, setSettingsProvider] = useState<LLMProviderId>(
    () => (localStorage.getItem(LLM_PROVIDER_STORAGE) as LLMProviderId) ?? "gemini",
  );
  const [settingsApiKey, setSettingsApiKey] = useState(
    () => localStorage.getItem(GEMINI_API_KEY_STORAGE) ?? "",
  );
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"General" | "Environments">(
    "General",
  );
  const [envDropdownOpen, setEnvDropdownOpen] = useState(false);
  const envDropdownRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    saveHistory(requestHistory);
  }, [requestHistory]);

  useEffect(() => {
    if (settingsOpen) {
      const provider = (localStorage.getItem(LLM_PROVIDER_STORAGE) as LLMProviderId) ?? "gemini";
      setSettingsProvider(provider);
      setSettingsApiKey(localStorage.getItem(getApiKeyStorageKey(provider)) ?? "");
    }
  }, [settingsOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (historyDropdownOpen && historyDropdownRef.current && !historyDropdownRef.current.contains(target)) {
        setHistoryDropdownOpen(false);
      }
      if (envDropdownOpen && envDropdownRef.current && !envDropdownRef.current.contains(target)) {
        setEnvDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [historyDropdownOpen, envDropdownOpen]);

  useEffect(() => {
    saveEnvironments(environments);
  }, [environments]);

  useEffect(() => {
    if (activeEnvironmentId) {
      localStorage.setItem(ACTIVE_ENVIRONMENT_STORAGE_KEY, activeEnvironmentId);
    } else {
      localStorage.removeItem(ACTIVE_ENVIRONMENT_STORAGE_KEY);
    }
  }, [activeEnvironmentId]);

  const addToHistory = (
    method: string,
    finalUrl: string,
    status: number,
    time_ms: number,
  ) => {
    const entry: RequestHistoryEntry = {
      id: crypto.randomUUID(),
      method,
      url: finalUrl,
      timestamp: Date.now(),
      status,
      time_ms,
    };
    setRequestHistory((prev) => {
      const next = [entry, ...prev].slice(0, HISTORY_MAX_ITEMS);
      return next;
    });
  };

  const applyHistoryEntry = (entry: RequestHistoryEntry) => {
    setMethod(entry.method);
    setUrl(entry.url);
    setHistoryDropdownOpen(false);
  };

  const clearHistory = () => {
    setRequestHistory([]);
    setHistoryDropdownOpen(false);
  };

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || isChatLoading) return;
    setChatInput("");
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsChatLoading(true);
    try {
      const provider = (localStorage.getItem(LLM_PROVIDER_STORAGE) as LLMProviderId) ?? "gemini";
      const apiKey = localStorage.getItem(getApiKeyStorageKey(provider))?.trim();
      if (!apiKey) {
        throw new Error(
          `${LLM_PROVIDERS.find((p) => p.id === provider)?.label ?? provider} API key not found. Open Settings (gear icon), paste your key, then click Save.`,
        );
      }
      const vars = getActiveEnvVariables(environments, activeEnvironmentId);
      const { finalUrl, compiledHeaders, body: resolvedBody, contextParams } =
        resolveRequestData(
          vars,
          url,
          params,
          headers,
          bodyContent,
          authType,
          bearerToken,
          basicUsername,
          basicPassword,
        );

      const MAX_RESPONSE_BODY = 4000;
      const context = {
        url: finalUrl,
        method,
        params: contextParams.length > 0 ? contextParams : undefined,
        headers: Object.keys(compiledHeaders).length > 0 ? compiledHeaders : undefined,
        body: resolvedBody.trim() || undefined,
        lastResponse: responseMeta
          ? {
              status: responseMeta.status,
              time_ms: responseMeta.time_ms,
              headers: Object.keys(lastResponseHeaders).length > 0 ? lastResponseHeaders : undefined,
              body:
                response && response !== "Loading..."
                  ? response.length > MAX_RESPONSE_BODY
                    ? response.slice(0, MAX_RESPONSE_BODY) + "\n... (truncated)"
                    : response
                  : undefined,
            }
          : null,
      };

      const reply = await invoke<string>("chat", {
        message: text,
        provider,
        apiKey,
        context,
      });
      setChatMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: reply },
      ]);
    } catch (e) {
      const errMsg =
        typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: unknown }).message)
          : "Sorry, something went wrong.";
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: errMsg,
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }

  async function makeRequest() {
    const vars = getActiveEnvVariables(environments, activeEnvironmentId);
    const { finalUrl, compiledHeaders, body: resolvedBody, unresolved } =
      resolveRequestData(
        vars,
        url,
        params,
        headers,
        bodyContent,
        authType,
        bearerToken,
        basicUsername,
        basicPassword,
      );

    if (unresolved.length > 0) {
      setResponse(
        JSON.stringify(
          {
            error: `Unresolved variables: ${unresolved.join(", ")}. Add them in Settings → Environments.`,
          },
          null,
          2,
        ),
      );
      setResponseMeta(null);
      return;
    }

    setResponse("Loading...");
    setResponseMeta(null);
    try {
      const res: any = await invoke("make_request", {
        method,
        url: finalUrl,
        body: resolvedBody,
        headers: compiledHeaders,
      });

      setResponseMeta({ status: res.status, time_ms: res.time_ms });

      const resData: any = {
        headers: res.headers,
        body: res.body,
      };

      try {
        resData.body = JSON.parse(res.body);
      } catch (e) {}

      if (res.headers && typeof res.headers === "object") {
        setLastResponseHeaders(res.headers);
      }
      setResponse(JSON.stringify(resData, null, 2));
      addToHistory(method, finalUrl, res.status, res.time_ms);
    } catch (error) {
      setResponse(JSON.stringify({ error }, null, 2));
    }
  }

  const highlightJson = (text: string): React.ReactNode => {
    const isJsonLike = /^[\s{}\[\]:,"\d\-tfnu]|"[^"]*"/.test(
      text.trim().slice(0, 100),
    );
    if (!isJsonLike) return text;

    const patterns: { type: string; regex: RegExp }[] = [
      { type: "key", regex: /"(?:[^"\\]|\\.)*"(?=\s*:)/g },
      { type: "string", regex: /"(?:[^"\\]|\\.)*"/g },
      { type: "number", regex: /-?\d+\.?\d*([eE][+-]?\d+)?/g },
      { type: "literal", regex: /\b(true|false|null)\b/g },
    ];

    const all: { idx: number; type: string; value: string }[] = [];
    for (const { type, regex } of patterns) {
      regex.lastIndex = 0;
      let m;
      while ((m = regex.exec(text)) !== null)
        all.push({ idx: m.index, type, value: m[0] });
    }
    const typeOrder: Record<string, number> = {
      key: 0,
      string: 1,
      number: 2,
      literal: 3,
    };
    all.sort(
      (a, b) =>
        a.idx - b.idx || (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9),
    );

    const spans: React.ReactNode[] = [];
    let pos = 0;
    const used: { start: number; end: number }[] = [];
    const overlaps = (s: number, e: number) =>
      used.some(
        (u) =>
          (s >= u.start && s < u.end) ||
          (e > u.start && e <= u.end) ||
          (s <= u.start && e >= u.end),
      );

    for (const { idx, type, value } of all) {
      const end = idx + value.length;
      if (idx < pos || overlaps(idx, end)) continue;
      if (idx > pos) spans.push(text.slice(pos, idx));
      const cls =
        type === "key"
          ? "text-sky-700"
          : type === "string"
            ? "text-amber-700"
            : type === "number"
              ? "text-emerald-700"
              : "text-violet-600";
      spans.push(
        <span key={`${idx}-${value.slice(0, 20)}`} className={cls}>
          {value}
        </span>,
      );
      pos = end;
      used.push({ start: idx, end });
    }
    if (pos < text.length) spans.push(text.slice(pos));
    return spans;
  };

  const addHeaderPreset = (preset: { key: string; value: string }) => {
    const newHeader = {
      id: crypto.randomUUID(),
      key: preset.key,
      value: preset.value,
      enabled: true,
    };
    setHeaders((prev) => {
      const withoutEmpty = prev.filter((h) => h.key || h.value);
      return [
        ...withoutEmpty,
        newHeader,
        { id: crypto.randomUUID(), key: "", value: "", enabled: true },
      ];
    });
  };

  const parseBulkHeaders = (text: string): { key: string; value: string }[] => {
    const lines = text.split(/\r?\n/);
    const pairs: { key: string; value: string }[] = [];
    for (const line of lines) {
      const match = line.match(/^\s*([^:=\s]+)\s*[:=]\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, "");
        if (key) pairs.push({ key, value });
      }
    }
    return pairs;
  };

  const applyBulkPasteHeaders = () => {
    const pairs = parseBulkHeaders(headersBulkPasteText);
    if (pairs.length === 0) return;
    const newItems = pairs.map((p) => ({
      id: crypto.randomUUID(),
      ...p,
      enabled: true,
    }));
    setHeaders([
      ...newItems,
      { id: crypto.randomUUID(), key: "", value: "", enabled: true },
    ]);
    setHeadersBulkPasteText("");
    setHeadersBulkPasteOpen(false);
  };

  const importHeadersFromResponse = () => {
    const entries = Object.entries(lastResponseHeaders);
    if (entries.length === 0) return;
    const newItems = entries.map(([key, value]) => ({
      id: crypto.randomUUID(),
      key,
      value: String(value),
      enabled: true,
    }));
    setHeaders([
      ...newItems,
      { id: crypto.randomUUID(), key: "", value: "", enabled: true },
    ]);
  };

  const copyResponse = async () => {
    if (!response || response === "Loading...") return;
    try {
      await navigator.clipboard.writeText(response);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (_) {}
  };

  const renderKeyValueEditor = (
    items: KeyValuePair[],
    setItems: (items: KeyValuePair[]) => void,
  ) => {
    return (
      <div className="flex flex-col gap-2 w-full h-full overflow-y-auto pr-2 pb-2">
        <AnimatePresence>
          {items.map((item, index) => (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              key={item.id}
              className="flex gap-2 items-center group"
            >
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => {
                  const newItems = [...items];
                  newItems[index].enabled = e.target.checked;
                  setItems(newItems);
                }}
                className="w-4 h-4 bg-white border border-slate-300 rounded text-slate-800 focus:ring-slate-400/50 cursor-pointer accent-slate-800 transition-colors"
              />
              <VarInput
                type="text"
                value={item.key}
                placeholder="Key"
                onChange={(e) => {
                  const newItems = [...items];
                  newItems[index].key = e.target.value;
                  setItems(newItems);
                  if (index === items.length - 1 && e.target.value) {
                    setItems([
                      ...newItems,
                      {
                        id: crypto.randomUUID(),
                        key: "",
                        value: "",
                        enabled: true,
                      },
                    ]);
                  }
                }}
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-slate-900 placeholder:text-slate-400 font-mono shadow-sm transition-all"
                wrapperClassName="flex-1 min-w-0"
              />
              <VarInput
                type="text"
                value={item.value}
                placeholder="Value"
                onChange={(e) => {
                  const newItems = [...items];
                  newItems[index].value = e.target.value;
                  setItems(newItems);
                  if (index === items.length - 1 && e.target.value) {
                    setItems([
                      ...newItems,
                      {
                        id: crypto.randomUUID(),
                        key: "",
                        value: "",
                        enabled: true,
                      },
                    ]);
                  }
                }}
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-slate-900 placeholder:text-slate-400 font-mono shadow-sm transition-all"
                wrapperClassName="flex-1 min-w-0"
              />
              <button
                onClick={() => {
                  if (items.length > 1) {
                    setItems(items.filter((_, i) => i !== index));
                  } else {
                    setItems([
                      {
                        id: crypto.randomUUID(),
                        key: "",
                        value: "",
                        enabled: true,
                      },
                    ]);
                  }
                }}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-md transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        <motion.button
          type="button"
          whileTap={{ scale: 0.99 }}
          onClick={() =>
            setItems([
              ...items,
              { id: crypto.randomUUID(), key: "", value: "", enabled: true },
            ])
          }
          className="flex items-center justify-center gap-2 mt-1 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 bg-white border border-dashed border-slate-300 rounded-lg hover:border-slate-400 hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add row
        </motion.button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-900 font-sans selection:bg-slate-200">
      {/* Top Navigation */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white/80 backdrop-blur-xl shrink-0 z-20"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <motion.div
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex items-center select-none"
            >
              <img
                src={logoSvg}
                alt="ZIIP Logo"
                style={{ height: "32px", width: "auto" }}
              />
            </motion.div>
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 tracking-wide">
              Alpha
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div ref={envDropdownRef} className="relative flex items-center">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setEnvDropdownOpen((o) => !o)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              title="Environment"
              aria-label="Select environment"
            >
              <Layers className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600 max-w-[100px] truncate">
                {activeEnvironmentId
                  ? environments.find((e) => e.id === activeEnvironmentId)?.name ?? "Unknown"
                  : "No env"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </motion.button>
            <AnimatePresence>
              {envDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-56 max-h-64 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-xl z-[100] flex flex-col"
                >
                  <div className="px-3 py-2 border-b border-slate-200 shrink-0">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Environment
                    </span>
                  </div>
                  <div className="overflow-y-auto py-1">
                    <button
                      onClick={() => {
                        setActiveEnvironmentId(null);
                        setEnvDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${!activeEnvironmentId ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
                    >
                      No environment
                    </button>
                    {environments.map((env) => (
                      <button
                        key={env.id}
                        onClick={() => {
                          setActiveEnvironmentId(env.id);
                          setEnvDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer ${activeEnvironmentId === env.id ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
                      >
                        {env.name}
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setSettingsOpen(true);
                        setSettingsTab("Environments");
                        setEnvDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors cursor-pointer border-t border-slate-100"
                    >
                      Manage environments…
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div ref={historyDropdownRef} className="relative flex items-center">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setHistoryDropdownOpen((o) => !o)}
              className={`transition-colors cursor-pointer ${historyDropdownOpen ? "text-slate-900" : "text-slate-400 hover:text-slate-900"}`}
              title="Request history"
              aria-label="Request history"
            >
              <History className="w-5 h-5" />
            </motion.button>
            <AnimatePresence>
              {historyDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-80 max-h-72 overflow-hidden bg-white border border-slate-200 rounded-xl shadow-xl z-[100] flex flex-col"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 shrink-0">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Recent requests
                    </span>
                    {requestHistory.length > 0 && (
                      <button
                        onClick={clearHistory}
                        className="text-[11px] text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto min-h-0 flex-1 py-1">
                    {requestHistory.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-slate-400">
                        No requests yet. Send one to see it here.
                      </div>
                    ) : (
                      requestHistory.map((entry) => (
                        <button
                          key={entry.id}
                          onClick={() => applyHistoryEntry(entry)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors cursor-pointer flex flex-col gap-0.5 group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 shrink-0">
                              {entry.method}
                            </span>
                            <span className="text-xs text-slate-500 shrink-0">
                              {formatRelativeTime(entry.timestamp)}
                            </span>
                            {entry.status != null && (
                              <span
                                className={`text-[10px] ml-auto shrink-0 ${entry.status >= 200 && entry.status < 300 ? "text-emerald-600" : "text-rose-600"}`}
                              >
                                {entry.status}
                              </span>
                            )}
                          </div>
                          <span className="text-sm text-slate-800 font-mono truncate group-hover:text-slate-900">
                            {entry.url}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setSettingsOpen(true)}
            className="text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="w-5 h-5" />
          </motion.button>
        </div>
      </motion.header>

      {/* Settings Modal */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            key="settings-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
            onClick={() => {
              const val = settingsApiKey.trim();
              if (val) localStorage.setItem(getApiKeyStorageKey(settingsProvider), val);
              setSettingsOpen(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col p-6"
            >
              <h3 className="text-lg font-semibold text-slate-900 mb-4 shrink-0">
                Settings
              </h3>
              <div className="flex gap-2 border-b border-slate-200 mb-4 shrink-0">
                <button
                  onClick={() => setSettingsTab("General")}
                  className={`text-sm font-medium pb-2 px-1 transition-colors cursor-pointer ${settingsTab === "General" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-500 hover:text-slate-800"}`}
                >
                  General
                </button>
                <button
                  onClick={() => setSettingsTab("Environments")}
                  className={`text-sm font-medium pb-2 px-1 transition-colors cursor-pointer ${settingsTab === "Environments" ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Environments
                </button>
              </div>
              {settingsTab === "General" && (
                <>
              <div className="space-y-2 mb-4">
                <label className="block text-sm font-medium text-slate-600">
                  LLM Provider
                </label>
                <select
                  value={settingsProvider}
                  onChange={(e) => {
                    const newProvider = e.target.value as LLMProviderId;
                    const currentKey = settingsApiKey.trim();
                    if (currentKey) localStorage.setItem(getApiKeyStorageKey(settingsProvider), currentKey);
                    setSettingsProvider(newProvider);
                    setSettingsApiKey(localStorage.getItem(getApiKeyStorageKey(newProvider)) ?? "");
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 bg-white"
                >
                  {LLM_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-600">
                  {LLM_PROVIDERS.find((p) => p.id === settingsProvider)?.label ?? settingsProvider} API Key
                </label>
                <input
                  type="password"
                  value={settingsApiKey}
                  onChange={(e) => setSettingsApiKey(e.target.value)}
                  placeholder={LLM_PROVIDERS.find((p) => p.id === settingsProvider)?.keyHint ?? "sk-..."}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                  autoComplete="off"
                />
                <p className="text-xs text-slate-500">
                  Required for ZII Assistant. Get a key at {LLM_PROVIDERS.find((p) => p.id === settingsProvider)?.keyUrl ?? "provider website"}. Stored locally.
                </p>
              </div>
              <div className="flex gap-2 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    const val = settingsApiKey.trim();
                    const keyStorage = getApiKeyStorageKey(settingsProvider);
                    if (val) localStorage.setItem(keyStorage, val);
                    else localStorage.removeItem(keyStorage);
                    localStorage.setItem(LLM_PROVIDER_STORAGE, settingsProvider);
                    setSettingsSaved(true);
                    setTimeout(() => setSettingsSaved(false), 1500);
                    setSettingsOpen(false);
                  }}
                  className="flex-1 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {settingsSaved ? "Saved!" : "Save"}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSettingsOpen(false)}
                  className="flex-1 px-4 py-2 text-slate-600 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </motion.button>
              </div>
                </>
              )}
              {settingsTab === "Environments" && (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <p className="text-sm text-slate-500 mb-3">
                    Use <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">{`{{variableName}}`}</code> in URL, params, headers, and body to substitute values.
                  </p>
                  <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
                    {environments.map((env) => (
                      <div
                        key={env.id}
                        className="border border-slate-200 rounded-lg p-4 bg-slate-50/50"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <input
                            type="text"
                            value={env.name}
                            onChange={(e) =>
                              setEnvironments((prev) =>
                                prev.map((x) =>
                                  x.id === env.id
                                    ? { ...x, name: e.target.value }
                                    : x,
                                ),
                              )
                            }
                            placeholder="Environment name"
                            className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 bg-white"
                          />
                          <button
                            onClick={() => {
                              setEnvironments((prev) =>
                                prev.filter((x) => x.id !== env.id),
                              );
                              if (activeEnvironmentId === env.id)
                                setActiveEnvironmentId(null);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-100 rounded transition-colors cursor-pointer ml-2"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          {env.variables.map((v) => (
                            <div key={v.id} className="flex gap-2">
                              <input
                                type="text"
                                value={v.key}
                                onChange={(e) =>
                                  setEnvironments((prev) =>
                                    prev.map((x) =>
                                      x.id === env.id
                                        ? {
                                            ...x,
                                            variables: x.variables.map((vb) =>
                                              vb.id === v.id
                                                ? { ...vb, key: e.target.value }
                                                : vb,
                                            ),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                                placeholder="Key (e.g. baseUrl)"
                                className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 bg-white"
                              />
                              <input
                                type="text"
                                value={v.value}
                                onChange={(e) =>
                                  setEnvironments((prev) =>
                                    prev.map((x) =>
                                      x.id === env.id
                                        ? {
                                            ...x,
                                            variables: x.variables.map((vb) =>
                                              vb.id === v.id
                                                ? {
                                                    ...vb,
                                                    value: e.target.value,
                                                  }
                                                : vb,
                                            ),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                                placeholder="Value"
                                className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 bg-white"
                              />
                              <button
                                onClick={() =>
                                  setEnvironments((prev) =>
                                    prev.map((x) =>
                                      x.id === env.id
                                        ? {
                                            ...x,
                                            variables: x.variables.filter(
                                              (vb) => vb.id !== v.id,
                                            ),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                                className="p-1.5 text-slate-400 hover:text-rose-500 rounded transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() =>
                              setEnvironments((prev) =>
                                prev.map((x) =>
                                  x.id === env.id
                                    ? {
                                        ...x,
                                        variables: [
                                          ...x.variables,
                                          {
                                            id: crypto.randomUUID(),
                                            key: "",
                                            value: "",
                                          },
                                        ],
                                      }
                                    : x,
                                ),
                              )
                            }
                            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            Add variable
                          </button>
                        </div>
                      </div>
                    ))}
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() =>
                        setEnvironments((prev) => [
                          ...prev,
                          {
                            id: crypto.randomUUID(),
                            name: "New Environment",
                            variables: [
                              {
                                id: crypto.randomUUID(),
                                key: "",
                                value: "",
                              },
                            ],
                          },
                        ])
                      }
                      className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:text-slate-700 hover:border-slate-400 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      Add environment
                    </motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main App Layout */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row relative z-0">
        {/* Left Column: API Client */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-1 flex flex-col min-w-0 border-r border-slate-200 bg-white z-0"
        >
          {/* URL Bar */}
          <div className="p-6 pb-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Target Endpoint
            </h2>
            <div className="flex gap-2 p-1 bg-slate-50 border border-slate-200 rounded-xl focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-400 transition-all shadow-sm">
              <select
                className="bg-transparent text-slate-700 border-none px-4 py-2 text-sm font-bold focus:outline-none cursor-pointer hover:bg-slate-200/50 rounded-lg transition-colors appearance-none"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option className="bg-white text-slate-900">GET</option>
                <option className="bg-white text-slate-900">POST</option>
                <option className="bg-white text-slate-900">PUT</option>
                <option className="bg-white text-slate-900">DELETE</option>
                <option className="bg-white text-slate-900">PATCH</option>
              </select>
              <div className="w-px bg-slate-200 my-2" />
              <VarInput
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && makeRequest()}
                placeholder="https://api.example.com/v1/users"
                className="flex-1 bg-transparent border-none px-2 py-2 text-sm focus:outline-none font-mono text-slate-900 placeholder:text-slate-400"
                wrapperClassName="flex-1 min-w-0"
                mirrorPadding="px-2 py-2"
              />
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={makeRequest}
                className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 rounded-lg font-medium text-sm transition-all shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Send</span>
              </motion.button>
            </div>
          </div>

          {/* Request Config */}
          <div className="px-6 pb-6 flex-1 flex flex-col min-h-0">
            <div className="flex gap-4 border-b border-slate-200 mb-4 shrink-0">
              {["Headers", "Params", "Body", "Auth"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`text-sm font-medium pb-2 px-1 transition-colors cursor-pointer ${
                    activeTab === tab
                      ? "text-slate-900 border-b-2 border-slate-900"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.2 }}
                  className="h-full"
                >
                  {activeTab === "Headers" && (
                    <div className="flex flex-col gap-3 h-full min-h-0">
                      {/* Headers toolbar */}
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <div className="relative group">
                          <select
                            onChange={(e) => {
                              const idx = e.target.selectedIndex;
                              const opt = e.target.options[idx];
                              const preset = HEADER_PRESETS.find(
                                (p) => p.label === opt?.value,
                              );
                              if (preset) addHeaderPreset(preset);
                              e.target.selectedIndex = 0;
                            }}
                            className="appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-1.5 text-sm text-slate-700 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 cursor-pointer shadow-sm"
                          >
                            <option value="">Add preset…</option>
                            {HEADER_PRESETS.map((p) => (
                              <option key={p.key} value={p.label}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() =>
                            setHeadersBulkPasteOpen(!headersBulkPasteOpen)
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:border-slate-300 transition-colors cursor-pointer"
                        >
                          <FileInput className="w-4 h-4" />
                          Bulk paste
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={importHeadersFromResponse}
                          disabled={
                            Object.keys(lastResponseHeaders).length === 0
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                          title="Import headers from last response"
                        >
                          <Plus className="w-4 h-4" />
                          Import from response
                        </motion.button>
                      </div>

                      {headersBulkPasteOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="flex gap-2">
                            <textarea
                              value={headersBulkPasteText}
                              onChange={(e) =>
                                setHeadersBulkPasteText(e.target.value)
                              }
                              placeholder={`Content-Type: application/json\nAccept: application/json\nX-Custom: value`}
                              className="flex-1 h-20 resize-y bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                              autoFocus
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={applyBulkPasteHeaders}
                                className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                Apply
                              </button>
                              <button
                                onClick={() => {
                                  setHeadersBulkPasteOpen(false);
                                  setHeadersBulkPasteText("");
                                }}
                                className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      <div className="flex-1 min-h-0 overflow-hidden">
                        {renderKeyValueEditor(headers, setHeaders)}
                      </div>
                    </div>
                  )}
                  {activeTab === "Params" &&
                    renderKeyValueEditor(params, setParams)}

                  {activeTab === "Body" && (
                    <VarTextarea
                      value={bodyContent}
                      onChange={(e) => setBodyContent(e.target.value)}
                      placeholder='{\n  "key": "value"\n}'
                      className="w-full h-full bg-white border border-slate-200 rounded-xl p-4 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-slate-800 placeholder:text-slate-400 font-mono resize-none shadow-sm transition-all"
                    />
                  )}

                  {activeTab === "Auth" && (
                    <div className="flex flex-col gap-4">
                      <div className="flex gap-2">
                        <label className="text-sm text-slate-500 w-24 flex items-center">
                          Auth Type
                        </label>
                        <select
                          value={authType}
                          onChange={(e) => setAuthType(e.target.value as any)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-slate-800 flex-1 shadow-sm transition-all"
                        >
                          <option
                            className="bg-white text-slate-900"
                            value="None"
                          >
                            None
                          </option>
                          <option
                            className="bg-white text-slate-900"
                            value="Bearer"
                          >
                            Bearer Token
                          </option>
                          <option
                            className="bg-white text-slate-900"
                            value="Basic"
                          >
                            Basic Auth
                          </option>
                        </select>
                      </div>

                      <AnimatePresence>
                        {authType === "Bearer" && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex gap-2 overflow-hidden w-full min-w-0"
                          >
                            <label className="text-sm text-slate-500 w-24 flex-shrink-0 flex items-center">
                              Token
                            </label>
                            <VarInput
                              type="text"
                              value={bearerToken}
                              onChange={(e) => setBearerToken(e.target.value)}
                              placeholder="eyJhbGci..."
                              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-slate-800 flex-1 min-w-0 font-mono shadow-sm transition-all"
                              wrapperClassName="flex-1 min-w-0"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <AnimatePresence>
                        {authType === "Basic" && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex flex-col gap-4 overflow-hidden"
                          >
                            <div className="flex gap-2">
                              <label className="text-sm text-slate-500 w-24 flex items-center">
                                Username
                              </label>
                              <VarInput
                                type="text"
                                value={basicUsername}
                                onChange={(e) =>
                                  setBasicUsername(e.target.value)
                                }
                                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-slate-800 flex-1 font-mono shadow-sm transition-all"
                                wrapperClassName="flex-1 min-w-0"
                              />
                            </div>
                            <div className="flex gap-2">
                              <label className="text-sm text-slate-500 w-24 flex items-center">
                                Password
                              </label>
                              <VarInput
                                type="text"
                                value={basicPassword}
                                onChange={(e) =>
                                  setBasicPassword(e.target.value)
                                }
                                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 text-slate-800 flex-1 font-mono shadow-sm transition-all"
                                wrapperClassName="flex-1 min-w-0"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Response Pane — IDE-style (light) */}
          <div className="flex-1 flex flex-col h-1/2 min-h-[300px] border-t border-slate-200 overflow-hidden">
            {/* IDE Tab Bar */}
            <div className="flex items-center justify-between bg-slate-100 border-b border-slate-300 px-3 py-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-700 bg-white px-3 py-1.5 rounded-t border border-b-0 border-slate-300 -mb-[2px] shadow-sm">
                  response.json
                </span>
                <span className="text-[11px] text-slate-500">JSON</span>
              </div>
              <div className="flex items-center gap-3">
                <AnimatePresence>
                  {responseMeta && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-3 text-[11px] font-mono"
                    >
                      <span
                        className={`flex items-center gap-1.5 ${responseMeta.status >= 200 && responseMeta.status < 300 ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${responseMeta.status >= 200 && responseMeta.status < 300 ? "bg-emerald-500" : "bg-rose-500"}`}
                        />
                        {responseMeta.status}
                      </span>
                      <span className="text-slate-500">
                        {responseMeta.time_ms}ms
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={copyResponse}
                  disabled={!response || response === "Loading..."}
                  className="relative p-1.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Copy response"
                  aria-label="Copy response"
                >
                  <AnimatePresence mode="wait">
                    {copied ? (
                      <motion.span
                        key="copied"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[11px] text-emerald-600 font-medium"
                      >
                        Copied
                      </motion.span>
                    ) : (
                      <motion.span
                        key="copy"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Copy className="w-4 h-4" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </div>

            {/* IDE Editor Content */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white min-h-0">
              {response && response !== "Loading..." ? (
                <div className="flex flex-1 min-h-0 overflow-auto font-mono text-[13px] leading-[22px]">
                  {/* Line numbers gutter */}
                  <div className="shrink-0 py-4 pr-4 pl-3 text-right select-none text-slate-400 bg-slate-50 border-r border-slate-200 min-w-[52px] tabular-nums">
                    {response.split("\n").map((_, i) => (
                      <div key={i} className="leading-[22px] pr-2">
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  {/* Code content */}
                  <motion.pre
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 py-4 pl-4 overflow-auto text-slate-700 bg-white whitespace-pre min-w-0 select-text [&::selection]:bg-slate-200 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-slate-400"
                  >
                    {highlightJson(response) ?? response}
                  </motion.pre>
                </div>
              ) : response === "Loading..." ? (
                <div className="flex-1 flex items-center justify-center text-slate-400 italic text-sm animate-pulse font-mono">
                  Requesting...
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400 italic text-sm font-mono">
                  Workspace is empty. Waiting for request...
                </div>
              )}

              {/* IDE Status Bar */}
              <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-slate-200 text-slate-700 text-[11px] font-mono border-t border-slate-300">
                <div className="flex items-center gap-4">
                  <span className="text-slate-600">JSON</span>
                  {response && response !== "Loading..." && (
                    <span className="text-slate-500">
                      {response.split("\n").length} lines
                    </span>
                  )}
                  <span className="text-slate-500">UTF-8</span>
                </div>
                {responseMeta && (
                  <span className="text-slate-600">
                    {responseMeta.status} · {responseMeta.time_ms}ms
                  </span>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right Column: ZII AI Assistant */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full md:w-80 lg:w-96 bg-gradient-to-b from-slate-50 to-white flex flex-col shrink-0 border-l border-slate-200 relative overflow-hidden hidden md:flex -z-10"
        >
          {/* Background Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-slate-200/40 blur-[80px] rounded-full pointer-events-none" />

          {/* Assistant Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-white/80 backdrop-blur-md shrink-0 relative z-10">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="w-9 h-9 rounded-xl flex items-center justify-center bg-white border border-slate-200 shadow-sm overflow-hidden p-1"
            >
              <img
                src={logoSvg}
                className="w-full h-full object-contain"
                alt="ZII Logo"
              />
            </motion.div>
            <div>
              <h3 className="font-bold text-sm leading-tight text-slate-900">
                ZII Assistant
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                AI-powered API helper
              </p>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 relative z-10">
            <AnimatePresence initial={false}>
              {chatMessages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-slate-900 text-white rounded-br-sm"
                        : "bg-white border border-slate-200 text-slate-700 shadow-sm rounded-bl-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isChatLoading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="bg-white border border-slate-200 shadow-sm px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5 items-center">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="px-4 py-4 border-t border-slate-200 bg-white/80 backdrop-blur-md shrink-0 relative z-10">
            <div className="flex gap-2 items-end bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2 focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-400 transition-all shadow-sm">
              <textarea
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height =
                    Math.min(e.target.scrollHeight, 120) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChatMessage();
                  }
                }}
                placeholder="Ask ZII anything..."
                rows={1}
                className="flex-1 bg-transparent border-none text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-none leading-relaxed py-0.5 max-h-[120px]"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || isChatLoading}
                className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-700 disabled:bg-slate-200 disabled:cursor-not-allowed flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer mb-0.5"
              >
                <ArrowUp className="w-4 h-4 text-white" />
              </motion.button>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center">
              Enter to send · Shift+Enter for newline
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default App;
