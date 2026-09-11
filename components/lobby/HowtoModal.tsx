"use client";

/**
 * 「玩法 · 90 秒看懂」弹窗：替代原右栏就地展开（小屏下内容被裁切且无法滚动）。
 */

import Modal from "@/components/ui/Modal";

const HOWTO_STEPS = [
  "五个 AI 角色围绕圆桌各自开场，只有一人篡改了原文。",
  "温和/直接/施压三种问法审讯，把发言存成录音证据对质。",
  "在证据板上拼出「来源事实 → 角色转述 → 被改变的关系」。",
  "提交指控：篡改者 + 篡改方式 + 证据链。",
  "揭底复盘：证据/审讯双维评分，生成可分享的辨别力战绩卡。",
];

export default function HowtoModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="玩法 · 90 秒看懂"
      subtitle="五步抓出那个篡改原文的家伙"
      icon="quote"
      onClose={onClose}
    >
      <ol className="mt-4 space-y-2.5">
        {HOWTO_STEPS.map((step, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5 rounded-xl border border-paper/10 bg-night-deep/60 p-3"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber/20 text-[10px] font-black text-amber">
              {i + 1}
            </span>
            <span className="text-xs leading-relaxed text-paper/75">{step}</span>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
