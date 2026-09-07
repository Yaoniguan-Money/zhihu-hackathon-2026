"use client";
/* eslint-disable react-hooks/set-state-in-effect -- 管理台：口令初始化与异步加载 */

import { useCallback, useEffect, useState } from "react";
import { useConvex } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * AI 供应商管理台（ADR 0003 补充决议）。
 * 显示当前生效的供应商注册表与每任务路由（Key 掩码），编辑后保存进
 * Convex 单例表——网关每次模型调用时解析配置，保存即对下一次任务生效。
 * 口令来自服务端 AI_ADMIN_SECRET；页面不持久化口令（仅 sessionStorage）。
 */

const TASKS = ["claim", "case", "role", "validator", "reveal"] as const;
const TASK_LABELS: Record<(typeof TASKS)[number], string> = {
  claim: "Claim 抽取",
  case: "建案编译",
  role: "角色回合",
  validator: "Validator",
  reveal: "Reveal",
};

interface ProviderRow {
  name: string;
  base_url: string;
  api_key: string; // 空 = 沿用已有 Key
  api_key_masked: string;
  enabled: boolean;
  model: string;
  models: Record<string, string>;
}

interface AdminView {
  source: "db" | "env";
  updated_at_ms: number | null;
  providers: Array<{
    name: string;
    base_url: string;
    api_key_masked: string;
    enabled: boolean;
    model?: string;
    models?: Record<string, string | undefined>;
  }>;
  routing: Record<string, string>;
}


export default function AdminProvidersPage() {
  const convex = useConvex();
  const [secret, setSecret] = useState("");
  const [view, setView] = useState<AdminView | null>(null);
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [routing, setRouting] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(
    async (secretValue: string) => {
      setError("");
      try {
        const v = await convex.query(api.aiConfig.adminView, {
          secret: secretValue,
        });
        setView(v);
        setRows(
          v.providers.map((p) => ({
            name: p.name,
            base_url: p.base_url,
            api_key: "",
            api_key_masked: p.api_key_masked,
            enabled: p.enabled,
            model: p.model ?? "",
            models: Object.fromEntries(
              TASKS.map((t) => [t, p.models?.[t] ?? ""]),
            ),
          })),
        );
        setRouting({ ...v.routing });
        setLoaded(true);
      } catch (e) {
        const detail =
          (e as { data?: { detail?: string } })?.data?.detail ??
          (e as Error).message ??
          "加载失败";
        setError(detail);
        setLoaded(false);
      }
    },
    [convex],
  );

  useEffect(() => {
    const saved = sessionStorage.getItem("ai_admin_secret");
    if (saved) {
      setSecret(saved);
      void load(saved);
    }
  }, [load]);

  const buildRegistryJson = (): string => {
    const registry = {
      providers: rows.map((r) => {
        const models: Record<string, string> = {};
        for (const t of TASKS) {
          const v = (r.models[t] ?? "").trim();
          if (v !== "") models[t] = v;
        }
        return {
          name: r.name.trim(),
          base_url: r.base_url.trim(),
          api_key: r.api_key,
          enabled: r.enabled,
          ...(r.model.trim() !== "" ? { model: r.model.trim() } : {}),
          ...(Object.keys(models).length > 0 ? { models } : {}),
        };
      }),
      routing,
    };
    return JSON.stringify(registry, null, 2);
  };

  const save = async () => {
    setError("");
    setMessage("");
    try {
      // 含掩码 Key 的新供应商无法在服务端还原真 Key：要求改 Key 或补全新 Key
      const invalid = rows.filter(
        (r) => r.enabled && r.api_key.trim() === "" && r.api_key_masked === "",
      );
      if (invalid.length > 0) {
        throw new Error(
          `供应商 ${invalid.map((r) => r.name).join(", ")} 处于启用状态但还没有录入 API Key`,
        );
      }
      const registryJson = buildRegistryJson();
      const res = await convex.mutation(api.aiConfig.saveRegistry, {
        secret,
        registry_json: registryJson,
      });
      setMessage(`已保存，下一次任务调用即生效（${new Date(res.updated_at_ms).toLocaleTimeString()}）`);
      await load(secret);
    } catch (e) {
      const detail =
        (e as { data?: { detail?: string } })?.data?.detail ??
        (e as Error).message ??
        "保存失败";
      setError(detail);
    }
  };

  const clearRegistry = async () => {
    setError("");
    setMessage("");
    try {
      await convex.mutation(api.aiConfig.clearRegistry, { secret });
      setMessage("已清除 DB 配置，回退到环境变量（AI_* 八项）");
      await load(secret);
    } catch (e) {
      const detail =
        (e as { data?: { detail?: string } })?.data?.detail ??
        (e as Error).message ??
        "清除失败";
      setError(detail);
    }
  };

  const updateRow = (idx: number, patch: Partial<ProviderRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        name: `provider-${prev.length + 1}`,
        base_url: "https://",
        api_key: "",
        api_key_masked: "",
        enabled: true,
        model: "",
        models: Object.fromEntries(TASKS.map((t) => [t, ""])),
      },
    ]);
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#171430", padding: 24, color: "#e8e6f5" }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>AI 供应商管理台</h1>
      <p style={{ fontSize: 12, color: "#9a96c8", marginBottom: 16 }}>
        修改保存后，下一次模型任务调用（Claim/建案/角色回合/Validator/Reveal）即按新路由执行；请求内不会自动切换供应商，失败仍是显式错误。
      </p>

      {!loaded && (
        <div style={{ maxWidth: 420, display: "grid", gap: 8 }}>
          <input
            type="password"
            placeholder="管理口令（服务端 AI_ADMIN_SECRET）"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            style={input}
          />
          <button onClick={() => void load(secret)} style={btn}>
            加载配置
          </button>
          {error && <div style={err}>{error}</div>}
        </div>
      )}

      {loaded && view && (
        <div style={{ display: "grid", gap: 16, maxWidth: 1100 }}>
          <div style={{ fontSize: 13 }}>
            生效来源：
            <span style={{ color: view.source === "db" ? "#7ee2a8" : "#ffd27e" }}>
              {view.source === "db" ? "数据库注册表" : "环境变量（AI_* 八项，尚未在管理台保存过）"}
            </span>
            {view.updated_at_ms
              ? ` · 更新于 ${new Date(view.updated_at_ms).toLocaleString()}`
              : ""}
          </div>

          {rows.map((row, idx) => (
            <div key={idx} style={{ ...card, opacity: row.enabled ? 1 : 0.55 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                <input
                  value={row.name}
                  onChange={(e) => updateRow(idx, { name: e.target.value })}
                  style={{ ...input, width: 180, fontWeight: 600 }}
                />
                <label style={{ fontSize: 13, display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => updateRow(idx, { enabled: e.target.checked })}
                  />
                  启用
                </label>
                <span style={{ fontSize: 12, color: "#9a96c8" }}>
                  {row.api_key_masked ? `当前 Key: ${row.api_key_masked}` : "尚未录入 Key"}
                </span>
                <button onClick={() => removeRow(idx)} style={{ ...btn, background: "#5a2740", marginLeft: "auto" }}>
                  删除
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <input
                  value={row.base_url}
                  placeholder="Base URL（https）"
                  onChange={(e) => updateRow(idx, { base_url: e.target.value })}
                  style={input}
                />
                <input
                  value={row.api_key}
                  placeholder="API Key（留空 = 保持不变）"
                  onChange={(e) => updateRow(idx, { api_key: e.target.value })}
                  style={input}
                />
                <input
                  value={row.model}
                  placeholder="默认模型 ID（可选）"
                  onChange={(e) => updateRow(idx, { model: e.target.value })}
                  style={input}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {TASKS.map((t) => (
                  <div key={t}>
                    <div style={{ fontSize: 11, color: "#9a96c8", marginBottom: 2 }}>{TASK_LABELS[t]}</div>
                    <input
                      value={row.models[t] ?? ""}
                      placeholder="模型 ID"
                      onChange={(e) =>
                        updateRow(idx, { models: { ...row.models, [t]: e.target.value } })
                      }
                      style={{ ...input, fontSize: 12 }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div>
            <button onClick={addRow} style={{ ...btn, background: "#2a3a5a" }}>
              + 新增供应商
            </button>
          </div>

          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>任务路由（claim 等五任务 → 供应商）</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
              {TASKS.map((t) => (
                <div key={t}>
                  <div style={{ fontSize: 11, color: "#9a96c8", marginBottom: 2 }}>{TASK_LABELS[t]}</div>
                  <select
                    value={routing[t] ?? ""}
                    onChange={(e) => setRouting((prev) => ({ ...prev, [t]: e.target.value }))}
                    style={{ ...input, width: "100%" }}
                  >
                    {rows.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name}
                        {r.enabled ? "" : "（已禁用）"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => void save()} style={{ ...btn, background: "#2f6b46", fontSize: 14, padding: "8px 22px" }}>
              保存并生效
            </button>
            <button onClick={() => void clearRegistry()} style={{ ...btn, background: "#5a2740" }}>
              清除 DB 配置（回退环境变量）
            </button>
            <button
              onClick={() => void load(secret)}
              style={{ ...btn, background: "#2a3a5a" }}
            >
              重新加载
            </button>
          </div>

          {message && <div style={{ color: "#7ee2a8", fontSize: 13 }}>{message}</div>}
          {error && <div style={err}>{error}</div>}
        </div>
      )}
    </div>
  );
}

const input: React.CSSProperties = {
  background: "#0f1230",
  border: "1px solid #33305a",
  borderRadius: 6,
  color: "#e8e6f5",
  padding: "6px 10px",
  fontSize: 13,
};

const btn: React.CSSProperties = {
  background: "#3a5a9a",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const card: React.CSSProperties = {
  background: "#1f1c46",
  border: "1px solid #33305a",
  borderRadius: 10,
  padding: 14,
};

const err: React.CSSProperties = {
  background: "#3a1830",
  border: "1px solid #7a2a50",
  borderRadius: 6,
  color: "#ffb8d0",
  fontSize: 13,
  padding: "6px 10px",
};
