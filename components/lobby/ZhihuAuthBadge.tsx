"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toPublicError } from "@/lib/convex-errors";
import { Icon } from "@/components/ui/Icons";
import type { PublicError } from "@/contracts/public";

/**
 * AUTH1：大厅「知乎账号登录」徽章。
 * 资料来自 zhihuAuth.zhihuMe（仅 ZhihuProfilePublic 投影，token 永不下发）；
 * 点击登录 → zhihuAuthorize 拿授权页 URL 后整页跳转（用户在知乎页亲自确认）。
 * 回跳结果用 URL 参数呈现（zhihu_auth=success|failed&stage=…），展示一次后清理。
 * 不接入 XState toast（B 所有权）；徽章自包含行内状态。
 */

const STAGE_HINTS: Record<string, string> = {
  code_missing: "知乎没有返回授权码，请重新发起登录",
  state_missing: "登录会话参数缺失，请重新发起登录",
  state_invalid: "登录会话已过期或已被使用（5 分钟内有效），请重新登录",
  service_not_configured: "登录服务未配置，请联系团队检查部署凭证",
  token_exchange_failed: "授权码换取登录凭证失败，请重新发起登录",
  profile_invalid: "未能取得知乎账号资料，请重新授权",
};

export default function ZhihuAuthBadge() {
  const me = useQuery(api.zhihuAuth.zhihuMe);
  const startAuthorize = useMutation(api.zhihuAuth.zhihuAuthorize);
  const unbind = useMutation(api.zhihuAuth.zhihuUnbind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PublicError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const handledRef = useRef(false);

  const searchParams = useSearchParams();
  useEffect(() => {
    if (handledRef.current) return;
    const outcome = searchParams.get("zhihu_auth");
    if (!outcome) return;
    handledRef.current = true;
    if (outcome === "success") {
      setNotice("知乎账号登录成功");
    } else {
      const stage = searchParams.get("stage") ?? "";
      setError({
        code: "SERVICE_UNAVAILABLE",
        message: STAGE_HINTS[stage] ?? "知乎登录失败，请重新发起",
      });
    }
    // 清理回跳参数，避免刷新重复展示；不触发整页导航。
    const cleaned = new URL(window.location.href);
    cleaned.searchParams.delete("zhihu_auth");
    cleaned.searchParams.delete("stage");
    window.history.replaceState(null, "", cleaned.toString());
  }, [searchParams]);

  const login = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const receipt = await startAuthorize({});
      window.location.href = receipt.authorize_url;
    } catch (err) {
      setError(toPublicError(err));
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError(null);
    try {
      await unbind({});
      setNotice("已退出知乎登录（匿名游玩数据不受影响）");
    } catch (err) {
      setError(toPublicError(err));
    }
    setBusy(false);
  };

  if (me === undefined) {
    return (
      <div className="card-dark flex items-center gap-3 p-3 opacity-70">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-paper/20 text-paper/40">
          <Icon name="mask" size={16} />
        </span>
        <span className="text-xs font-bold text-paper/50">知乎登录状态读取中…</span>
      </div>
    );
  }

  if (me === null) {
    return (
      <div className="card-dark p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-paper/20 text-paper/40">
            <Icon name="mask" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-paper">用知乎账号登录</p>
            <p className="text-[10px] leading-snug text-paper/50">
              登录后大厅展示你的知乎昵称与头像；不读取其他数据
            </p>
          </div>
          <button
            onClick={login}
            disabled={busy}
            className="btn btn-amber shrink-0 !px-3 !py-1.5 text-xs"
          >
            {busy ? "跳转中…" : "知乎登录"}
          </button>
        </div>
        <AuthFooter error={error} notice={notice} />
      </div>
    );
  }

  const expired =
    me.expires_at !== null && new Date(me.expires_at).getTime() < Date.now();

  return (
    <div className="card-dark p-3">
      <div className="flex items-center gap-3">
        {me.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- 知乎外链头像，域名不定
          <img
            src={me.avatar_url}
            alt={me.fullname || "知乎头像"}
            className="h-9 w-9 shrink-0 rounded-full border-2 border-amber/60 object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-amber/60 text-amber">
            <Icon name="mask" size={16} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-black text-paper">
            {me.fullname || "知乎用户"}
            {expired && (
              <span className="ml-1 font-bold text-coral">（授权已过期）</span>
            )}
          </p>
          <p className="truncate text-[10px] leading-snug text-paper/50">
            {expired ? "请重新登录以恢复知乎登录态" : me.headline || "已连接知乎账号"}
          </p>
        </div>
        {expired ? (
          <button
            onClick={login}
            disabled={busy}
            className="btn btn-amber shrink-0 !px-3 !py-1.5 text-xs"
          >
            <Icon name="refresh" size={12} className="mr-1" />
            重新登录
          </button>
        ) : (
          <button
            onClick={logout}
            disabled={busy}
            className="btn btn-ghost shrink-0 !px-3 !py-1.5 text-xs"
          >
            退出
          </button>
        )}
      </div>
      <AuthFooter error={error} notice={notice} />
    </div>
  );
}

function AuthFooter({
  error,
  notice,
}: {
  error: PublicError | null;
  notice: string | null;
}) {
  if (!error && !notice) return null;
  return (
    <div className="mt-2">
      {error && (
        <p className="flex items-start gap-1.5 text-[11px] font-bold leading-snug text-coral">
          <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
          {error.message}
        </p>
      )}
      {!error && notice && (
        <p className="flex items-start gap-1.5 text-[11px] font-bold leading-snug text-amber">
          <Icon name="check" size={12} className="mt-0.5 shrink-0" />
          {notice}
        </p>
      )}
    </div>
  );
}
