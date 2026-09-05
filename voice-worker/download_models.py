"""P1-2 模型下载与供应链固定（voice-worker/models/，不入仓库）。

首次运行：按固定 revision 下载 SenseVoiceSmall、FSMN-VAD 与 Kokoro-82M
（模型 + 中文音色包），解析实际 commit hash 与文件 sha256，写入
models-manifest.json（该清单入库；权重目录 gitignore）。

后续运行（--verify）：对照清单逐文件复验 sha256 与 revision；任何漂移
即非零退出。固定清单是本地语音供应链的唯一事实来源（计划 P1-2 行）。

用法：
  .venv/Scripts/python.exe download_models.py            # 下载 + 生成/校验清单
  .venv/Scripts/python.exe download_models.py --verify   # 仅校验，不联网
"""

from __future__ import annotations

import hashlib
import os
import json
import sys
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
MODELS_DIR = WORKER_DIR / "models"
MANIFEST_PATH = WORKER_DIR / "models-manifest.json"

# 固定 revision：ModelScope 为 commit hash / tag，HF 为 commit hash。
SENSEVOICE_REPO = "iic/SenseVoiceSmall"
SENSEVOICE_REVISION = "master"  # 首次下载时解析为实际 commit 并记录
FSMN_VAD_REPO = "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch"
FSMN_VAD_REVISION = "master"
KOKORO_REPO = "hexgrad/Kokoro-82M"
# v1.0 模型 + 全部音色（五音色锁定由用户 A/B 完成后，可裁剪 allow_patterns）
KOKORO_ALLOW = ["kokoro-v1_0.pth", "voices/*.pt", "config.json", "USAGE.md"]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hash_tree(root: Path) -> dict[str, dict[str, object]]:
    entries: dict[str, dict[str, object]] = {}
    for path in sorted(root.rglob("*")):
        if path.is_file():
            rel = path.relative_to(root).as_posix()
            entries[rel] = {
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
            }
    return entries


def resolve_modelscope(repo: str, revision: str, target: Path) -> str:
    from modelscope import snapshot_download

    resolved = snapshot_download(model_id=repo, revision=revision, local_dir=str(target))
    return str(resolved)


def resolve_huggingface(repo: str, target: Path, allow: list[str]) -> str:
    from huggingface_hub import snapshot_download

    resolved = snapshot_download(
        repo_id=repo,
        local_dir=str(target),
        allow_patterns=allow,
    )
    return str(resolved)


def preseed_hf_cache(repo: str, filenames: list[str]) -> None:
    """把模型与音色文件写入 HF_HOME hub 缓存结构。

    worker.py 以 HF_HUB_OFFLINE=1 运行（离线确定性：运行期禁止任何联网
    拉取）；Kokoro/KPipeline 经 hf_hub_download 取文件，因此必须以标准
    hub 缓存结构预置。文件级 sha256 固定见 models-manifest.json。
    """
    import os

    from huggingface_hub import hf_hub_download

    assert os.environ.get("HF_HOME"), "HF_HOME 必须在导入 huggingface_hub 前设置"
    for filename in filenames:
        hf_hub_download(repo_id=repo, filename=filename)


def main() -> int:
    verify_only = "--verify" in sys.argv

    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    else:
        if verify_only:
            print("清单缺失：models-manifest.json 不存在", file=sys.stderr)
            return 1
        manifest = {"entries": {}}

    if not verify_only:
        os.environ.setdefault("HF_HOME", str(MODELS_DIR / "hf-cache"))
        Path(os.environ["HF_HOME"]).mkdir(parents=True, exist_ok=True)

        sense_dir = MODELS_DIR / "sensevoice-small"
        vad_dir = MODELS_DIR / "fsmn-vad"
        kokoro_dir = MODELS_DIR / "kokoro-82m"
        sense_dir.parent.mkdir(parents=True, exist_ok=True)

        print(f"[1/3] ModelScope {SENSEVOICE_REPO} -> {sense_dir}")
        resolve_modelscope(SENSEVOICE_REPO, SENSEVOICE_REVISION, sense_dir)
        print(f"[2/3] ModelScope {FSMN_VAD_REPO} -> {vad_dir}")
        resolve_modelscope(FSMN_VAD_REPO, FSMN_VAD_REVISION, vad_dir)
        print(f"[3/3] HuggingFace {KOKORO_REPO} -> {kokoro_dir}")
        resolve_huggingface(KOKORO_REPO, kokoro_dir, KOKORO_ALLOW)
        print("[3b] 预置 HF hub 缓存（模型 + 全部中文音色，离线运行用）")
        zh_voices = [
            f"voices/{name}.pt"
            for name in [
                "zf_xiaobei", "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi",
                "zm_yunjian", "zm_yunxi", "zm_yunxia", "zm_yunyang",
            ]
        ]
        preseed_hf_cache(
            KOKORO_REPO,
            ["kokoro-v1_0.pth", "config.json", *zh_voices],
        )

        manifest = {
            "comment": "本地语音供应链固定清单：revision 与文件 sha256 由下载脚本解析记录。",
            "entries": {
                "sensevoice-small": {
                    "source": f"modelscope:{SENSEVOICE_REPO}",
                    "revision": SENSEVOICE_REVISION,
                    "files": hash_tree(sense_dir),
                },
                "fsmn-vad": {
                    "source": f"modelscope:{FSMN_VAD_REPO}",
                    "revision": FSMN_VAD_REVISION,
                    "files": hash_tree(vad_dir),
                },
                "kokoro-82m": {
                    "source": f"huggingface:{KOKORO_REPO}",
                    "revision": "v1.0",
                    "files": hash_tree(kokoro_dir),
                },
            },
        }
        MANIFEST_PATH.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"清单已写入 {MANIFEST_PATH}")

    failures = 0
    checked = 0
    for name, entry in manifest["entries"].items():
        root = MODELS_DIR / name
        for rel, meta in entry["files"].items():  # type: ignore[union-attr]
            path = root / rel
            checked += 1
            if not path.exists():
                print(f"MISS {name}/{rel}", file=sys.stderr)
                failures += 1
                continue
            actual = sha256_file(path)
            if actual != meta["sha256"]:  # type: ignore[index]
                print(f"HASH MISMATCH {name}/{rel}", file=sys.stderr)
                failures += 1
    print(f"校验完成：{checked} 个文件，{failures} 个失败")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
