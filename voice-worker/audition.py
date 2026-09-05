"""五音色 A/B 试听辅助：把 Kokoro 全部中文候选音色各合成同一段台词，
输出到 voice-worker/audition/<voice>.wav，供用户试听后确定
voice-pack.json 五个槽位的最终映射（把 locked 改为 true）。

用法（worker 是否在运行均可，本脚本独立加载模型）：
  cd voice-worker
  .venv/Scripts/python.exe -u audition.py [可选：自定义台词]
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
MODELS_DIR = WORKER_DIR / "models"
AUDITION_DIR = WORKER_DIR / "audition"

DEFAULT_TEXT = (
    "根据文中数据，Meta 计划裁减约百分之二十的员工，涉及约一万五千八百人。"
    "这个数字意味着什么，我们还要结合时间线和条件来看。"
)

ZH_VOICES = [
    "zf_xiaobei",
    "zf_xiaoni",
    "zf_xiaoxiao",
    "zf_xiaoyi",
    "zm_yunjian",
    "zm_yunxi",
    "zm_yunxia",
    "zm_yunyang",
]


def main() -> int:
    os.environ.setdefault("HF_HOME", str(MODELS_DIR / "hf-cache"))
    os.environ.setdefault("HF_HUB_OFFLINE", "1")

    text = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TEXT

    import numpy as np
    import soundfile as sf
    import torch
    from kokoro import KPipeline

    AUDITION_DIR.mkdir(exist_ok=True)
    pipeline = KPipeline(lang_code="z", repo_id="hexgrad/Kokoro-82M")

    for voice in ZH_VOICES:
        target = AUDITION_DIR / f"{voice}.wav"
        chunks = [
            result.audio
            for result in pipeline(text, voice=voice, speed=1.0)
            if result.audio is not None
        ]
        if not chunks:
            print(f"[skip] {voice}: 无音频产出")
            continue
        audio = chunks[0] if len(chunks) == 1 else torch.cat(chunks)
        sf.write(
            target,
            audio.detach().cpu().numpy().astype(np.float32),
            24000,
            subtype="PCM_16",
            format="WAV",
        )
        print(f"[ok] {voice} -> {target.name}")

    print(f"完成。试听目录：{AUDITION_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
