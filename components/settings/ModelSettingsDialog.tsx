"use client";

/**
 * 模型服务设置（ADR 0005 BYOK）：用户自配 OpenAI-compatible 供应商。
 * 「测试并保存」= 服务端真实连通性探针，成功才落库；之后对本人所有模型
 * 调用（建案 / 角色回合 / 开场 / Reveal）实时生效。API Key 只存服务端，
 * 回显一律掩码；留空表示沿用已存 Key。
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { errorCodeHint, toPublicError } from "@/lib/convex-errors";
import { Icon } from "@/components/ui/Icons";

const TASKS = [
  { key: "claim", label: "Claim 抽取" },
  { key: "case", label: "建案编译" },
  { key: "role", label: "角色回合" },
  { key: "validator", label: "Validator" },
  { key: "reveal", label: "Reveal" },
] as const;

type TaskKey = (typeof TASKS)[number]["key"];

const inputCls =
  "w-full rounded-xl border-2 border-paper/20 bg-night-deep/60 px-3 py-2 text-sm text-paper placeholder:text-paper/30 focus:border-amber/60 focus:outline-none";

interface StatusConfigured {
  configured: true;
  provider_name: string;
  base_url: string;
  api_key_masked: string;
  model: string;
  models: Partial<Record<TaskKey, string>>;
  updated_at_ms: number;
}
type StatusView = { configured: false } | StatusConfigured;

/** 圆形齿轮按钮 + 弹窗；大厅与对局 header 共用。 */
export function ModelSettingsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="模型服务设置"
        aria-label="模型服务设置"
        className={
          className ??
          "ml-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper/25 text-paper/70 transition-colors hover:border-amber hover:text-amber"
        }
      >
        <Icon name="settings" size={14} />
      </button>
      {open && <ModelSettingsDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export default function ModelSettingsDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const status = useQuery(
    api.userModelConfig.myModelConfig,
    isAuthenticated ? {} : "skip",
  ) as StatusView | undefined;
  const saveConfig = useAction(api.userModelConfig.saveUserModelConfig);
  const clearConfig = useMutation(api.userModelConfig.clearUserModelConfig);

  const [portalMounted, setPortalMounted] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [taskModels, setTaskModels] = useState<Record<TaskKey, string>>({
    claim: "",
    case: "",
    role: "",
    validator: "",
    reveal: "",
  });
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );

  useEffect(() => setPortalMounted(true), []);

  // 已存配置回填（Key 永不回显，只显示掩码占位）
  useEffect(() => {
    if (status?.configured) {
      setName(status.provider_name === "user-provider" ? "" : status.provider_name);
      setBaseUrl(status.base_url);
      setModel(status.model);
      setTaskModels({
        claim: status.models.claim ?? "",
        case: status.models.case ?? "",
        role: status.models.role ?? "",
        validator: status.models.validator ?? "",
        reveal: status.models.reveal ?? "",
      });
    }
  }, [status]);

  const canSubmit =
    /^https:\/\/.+/.test(baseUrl.trim()) &&
    model.trim().length > 0 &&
    (apiKey.trim().length > 0 || status?.configured === true) &&
    !saving;

  const save = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await saveConfig({
        name: name.trim() === "" ? undefined : name.trim(),
        base_url: baseUrl.trim(),
        api_key: apiKey,
        model: model.trim(),
        models: {
          claim: taskModels.claim.trim() === "" ? undefined : taskModels.claim.trim(),
          case: taskModels.case.trim() === "" ? undefined : taskModels.case.trim(),
          role: taskModels.role.trim() === "" ? undefined : taskModels.role.trim(),
          validator:
            taskModels.validator.trim() === "" ? undefined : taskModels.validator.trim(),
          reveal: taskModels.reveal.trim() === "" ? undefined : taskModels.reveal.trim(),
        },
      });
      setApiKey("");
      setSaved(true);
    } catch (err) {
      setError(toPublicError(err));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setError(null);
    setSaved(false);
    setClearing(true);
    try {
      await clearConfig({});
      setBaseUrl("");
      setModel("");
      setName("");
      setApiKey("");
      setTaskModels({ claim: "", case: "", role: "", validator: "", reveal: "" });
    } catch (err) {
      setError(toPublicError(err));
    } finally {
      setClearing(false);
    }
  };

  if (!portalMounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-night/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="模型服务设置"
    >
      <div className="card-dark max-h-[90vh] w-full max-w-md overflow-y-auto p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-paper/40 text-paper/80">
            <Icon name="settings" size={15} />
          </span>
          <div className="flex-1">
            <h2 className="text-sm font-black text-paper">模型服务设置</h2>
            <p className="text-[11px] text-paper/50">
              配置你自己的大模型 API，保存后立即对你的建案与对局生效
            </p>
          </div>
          <button
            onClick={onClose}
            title="关闭"
            aria-label="关闭设置"
            className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-paper/25 text-paper/60 transition-colors hover:border-coral hover:text-coral"
          >
            ✕
          </button>
        </div>

        {/* 当前状态 */}
        <div className="mt-4 rounded-xl border border-paper/10 bg-night/60 px-3 py-2.5 text-xs leading-relaxed text-paper/70">
          {status === undefined ? (
            <span className="text-paper/45">读取配置中…</span>
          ) : status.configured ? (
            <>
              <span className="mr-1.5 inline-block rounded-full border border-teal/50 bg-teal/10 px-2 py-0.5 text-[10px] font-bold text-teal">
                已配置
              </span>
              {status.base_url}
              <span className="mx-1 text-paper/30">·</span>
              Key {status.api_key_masked}
              <span className="mx-1 text-paper/30">·</span>
              {new Date(status.updated_at_ms).toLocaleString()}
            </>
          ) : (
            <>
              <span className="mr-1.5 inline-block rounded-full border border-coral/50 bg-coral/10 px-2 py-0.5 text-[10px] font-bold text-coral">
                未配置
              </span>
              建案、角色对话与真相揭晓都需要先配置你自己的模型服务。
            </>
          )}
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-paper/70">
              供应商名称（可选）
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：智谱 / DeepSeek / OpenRouter"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-paper/70">
              Base URL（HTTPS）
            </span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://open.bigmodel.cn/api/paas/v4"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-paper/70">
              API Key{" "}
              {status?.configured && (
                <span className="font-normal text-paper/45">
                  （留空沿用已存 {status.api_key_masked}）
                </span>
              )}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={status?.configured ? "••••••••" : "必填，仅存服务器"}
              autoComplete="off"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-paper/70">
              默认模型名
            </span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="如：glm-4.7-flash"
              className={inputCls}
            />
          </label>

          <details className="rounded-xl border border-paper/10 bg-night/50 px-3 py-2">
            <summary className="cursor-pointer text-xs font-bold text-paper/60 select-none">
              高级：按任务指定不同模型（留空用默认）
            </summary>
            <div className="mt-2 space-y-2">
              {TASKS.map((t) => (
                <label key={t.key} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-[11px] text-paper/55">
                    {t.label}
                  </span>
                  <input
                    value={taskModels[t.key]}
                    onChange={(e) =>
                      setTaskModels((m) => ({ ...m, [t.key]: e.target.value }))
                    }
                    placeholder={model.trim() === "" ? "默认模型" : model}
                    className={inputCls}
                  />
                </label>
              ))}
            </div>
          </details>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border-2 border-coral/40 bg-coral/10 px-3 py-2 text-xs text-coral">
            <span className="mr-1.5 rounded bg-coral/20 px-1.5 py-0.5 font-mono text-[10px]">
              {error.code}
            </span>
            {error.message}
            <span className="mt-0.5 block text-paper/60">
              {errorCodeHint(error.code as never)}
            </span>
          </div>
        )}
        {saved && (
          <div className="mt-3 rounded-xl border-2 border-teal/40 bg-teal/10 px-3 py-2 text-xs text-teal">
            已通过连通性测试并保存，对你的全部对局立即生效。
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => void save()}
            disabled={!canSubmit}
            className="btn btn-amber flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "测试连接中…" : "测试并保存"}
          </button>
          {status?.configured && (
            <button
              onClick={() => void clear()}
              disabled={clearing}
              className="btn !border-coral/50 !bg-transparent !text-coral hover:!bg-coral/10 disabled:opacity-40"
            >
              {clearing ? "清除中…" : "清除配置"}
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-paper/40">
          API Key 仅保存在服务端数据库，页面只显示掩码；保存前会先用这份配置做一次真实调用测试。
        </p>
      </div>
    </div>,
    document.body,
  );
}
