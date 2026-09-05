"""P1-2 本地语音 Worker（A9）。

只绑定 127.0.0.1：Browser 不得直连，Next 同源 Route 是唯一入口
（ENGINEERING_SPEC 5.6 / 计划 P1-2 行）。同一进程加载 SenseVoiceSmall
（FunASR，含 FSMN-VAD）与 Kokoro-82M（Misaki 中文 G2P），CPU 推理，
模型调用串行（单用户本地演示语义，无排队承诺）。

内部接口（供 Next Route 调用，非公开契约）：
  GET  /health -> {"ok":true,"asr":bool,"tts":bool,"voice_pack_locked":bool}
  POST /asr    头 X-Audio-Mime ∈ webm/ogg/wav/mpeg；body=原始音频字节
               -> {"ok":true,"text","duration_ms"} | {"ok":false,"code"}
  POST /tts    body {"text","voice","speed"} -> WAV 字节（头 X-Sample-Rate、
               X-Content-Sha256）| JSON {"ok":false,"code"}

worker 级错误码（由 Route 映射为 Public Error，CONTRACTS 13.3 Voice 列）：
  TOO_LONG / NO_SPEECH / DECODE_FAILED / ASR_FAILED / TTS_FAILED / BAD_REQUEST

配置（全部显式；缺失即退出，不做默认兜底）：
  VOICE_WORKER_PORT（缺省 8717，本地演示端口，与 .env.local 的
  VOICE_WORKER_URL 必须一致）、HF_HOME 固定到 models/hf-cache（离线缓存）。
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
MODELS_DIR = WORKER_DIR / "models"
MAX_AUDIO_BYTES = 20 * 1024 * 1024
MAX_DURATION_MS = 30_000
ASR_SAMPLE_RATE = 16_000
TTS_SAMPLE_RATE = 24_000
SUPPORTED_MIME = {"audio/webm", "audio/ogg", "audio/wav", "audio/mpeg"}

_model_lock = threading.Lock()
_state: dict[str, object] = {"asr": None, "tts": None}


def fail_exit(message: str) -> None:
    print(f"voice-worker 配置错误：{message}", file=sys.stderr)
    raise SystemExit(1)


def load_voice_pack() -> dict:
    path = WORKER_DIR / "voice-pack.json"
    if not path.exists():
        fail_exit(f"缺少 {path}")
    return json.loads(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# ASR：SenseVoiceSmall + FSMN-VAD（FunASR，本地固定目录）

def init_asr():
    from funasr import AutoModel

    sense_dir = MODELS_DIR / "sensevoice-small"
    vad_dir = MODELS_DIR / "fsmn-vad"
    if not sense_dir.exists() or not vad_dir.exists():
        fail_exit("模型目录缺失，请先运行 download_models.py")
    return AutoModel(
        model=str(sense_dir),
        vad_model=str(vad_dir),
        vad_kwargs={"max_single_segment_time": 30_000},
        device="cpu",
        disable_update=True,
        disable_pbar=True,
    )


def decode_audio(data: bytes):
    """任意受支持容器 -> 单声道 16k (np.int16, duration_ms)。DECODE_FAILED 可抛。"""
    import av
    import numpy as np

    try:
        container = av.open(io.BytesIO(data))
        resampler = av.AudioResampler(format="s16", layout="mono", rate=ASR_SAMPLE_RATE)
        chunks: list[np.ndarray] = []
        for frame in container.decode(audio=0):
            for out_frame in resampler.resample(frame):
                array = out_frame.to_ndarray()
                if array.ndim == 2:
                    # to_ndarray 布局为 (channels, samples)：沿通道轴平均。
                    array = array.mean(axis=0)
                chunks.append(array.astype(np.int16).ravel())
        if not chunks:
            raise ValueError("无音频流")
        samples = np.concatenate(chunks)
        return samples, int(len(samples) / ASR_SAMPLE_RATE * 1000)
    except Exception:
        raise DecodeFailed()


class DecodeFailed(Exception):
    pass


def run_asr(data: bytes, mime: str) -> dict:
    import numpy as np

    if mime not in SUPPORTED_MIME:
        return {"ok": False, "code": "BAD_REQUEST"}
    if len(data) > MAX_AUDIO_BYTES:
        return {"ok": False, "code": "TOO_LONG"}
    try:
        samples, duration_ms = decode_audio(data)
    except DecodeFailed:
        return {"ok": False, "code": "DECODE_FAILED"}
    if duration_ms > MAX_DURATION_MS:
        return {"ok": False, "code": "TOO_LONG", "duration_ms": duration_ms}

    with _model_lock:
        model = _state["asr"]
        result = model.generate(
            input=samples.astype(np.float32) / 32768.0,
            fs=ASR_SAMPLE_RATE,
            cache={},
            language="zh",
            use_itn=True,
        )
    from funasr.utils.postprocess_utils import rich_transcription_postprocess

    text = rich_transcription_postprocess(result[0]["text"]).strip()
    if text == "":
        return {"ok": False, "code": "NO_SPEECH", "duration_ms": duration_ms}
    return {"ok": True, "text": text, "duration_ms": duration_ms}


# ---------------------------------------------------------------------------
# TTS：Kokoro-82M（Misaki 中文 G2P，固定 HF 缓存）

def init_tts(voice_pack: dict):
    from kokoro import KPipeline

    kokoro_dir = MODELS_DIR / "kokoro-82m"
    if not kokoro_dir.exists():
        fail_exit("Kokoro 模型目录缺失，请先运行 download_models.py")
    return KPipeline(lang_code="z", repo_id="hexgrad/Kokoro-82M")


def wav_bytes(samples, sample_rate: int) -> bytes:
    import soundfile as sf

    buffer = io.BytesIO()
    sf.write(buffer, samples, sample_rate, subtype="PCM_16", format="WAV")
    return buffer.getvalue()


def run_tts(payload: dict, voice_pack: dict) -> tuple[bytes, int] | dict:
    text = payload.get("text")
    voice = payload.get("voice")
    speed = payload.get("speed")
    if not isinstance(text, str) or text.strip() == "":
        return {"ok": False, "code": "BAD_REQUEST"}
    voices = voice_pack["voices"]
    if voice not in voices:
        return {"ok": False, "code": "VOICE_NOT_IN_PACK"}
    pace_speed = voice_pack["pace_speed"].get(str(speed))
    if pace_speed is None:
        return {"ok": False, "code": "BAD_REQUEST"}

    with _model_lock:
        pipeline = _state["tts"]
        chunks = [
            result.audio
            for result in pipeline(text, voice=voices[voice]["kokoro_voice"], speed=pace_speed)
            if result.audio is not None
        ]
    if len(chunks) == 0:
        return {"ok": False, "code": "TTS_FAILED"}
    audio = chunks[0] if len(chunks) == 1 else __import__("torch").cat(chunks)
    import numpy as np

    return wav_bytes(audio.detach().cpu().numpy().astype(np.float32), TTS_SAMPLE_RATE), TTS_SAMPLE_RATE


# ---------------------------------------------------------------------------
# HTTP（stdlib；仅 127.0.0.1）

class Handler(BaseHTTPRequestHandler):
    server_version = "voice-worker/0.1"

    def log_message(self, format: str, *args) -> None:
        print(f"[voice-worker] {self.address_string()} {format % args}", flush=True)

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self._json(404, {"ok": False, "code": "BAD_REQUEST"})
            return
        self._json(
            200,
            {
                "ok": True,
                "asr": _state["asr"] is not None,
                "tts": _state["tts"] is not None,
                "voice_pack_locked": bool(VOICE_PACK.get("locked")),
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path == "/asr":
            self._handle_asr()
            return
        if self.path == "/tts":
            self._handle_tts()
            return
        self._json(404, {"ok": False, "code": "BAD_REQUEST"})

    def _handle_asr(self) -> None:
        mime = self.headers.get("X-Audio-Mime", "")
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_AUDIO_BYTES:
            self._json(400, {"ok": False, "code": "BAD_REQUEST"})
            return
        data = self.rfile.read(length)
        try:
            result = run_asr(data, mime)
        except Exception as error:  # 模型层任何异常 -> ASR_FAILED（Route 映射 VOICE_ASR_FAILED）
            import traceback

            traceback.print_exc()
            print(f"[voice-worker] asr 异常: {type(error).__name__}: {error}", flush=True)
            result = {"ok": False, "code": "ASR_FAILED"}
        status = 200 if result.get("ok") else 422
        self._json(status, result)

    def _handle_tts(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > (4 * 1024 * 1024):
            self._json(400, {"ok": False, "code": "BAD_REQUEST"})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            self._json(400, {"ok": False, "code": "BAD_REQUEST"})
            return
        try:
            outcome = run_tts(payload, VOICE_PACK)
        except Exception as error:  # 模型层任何异常 -> TTS_FAILED（Route 映射 VOICE_TTS_FAILED）
            print(f"[voice-worker] tts 异常: {type(error).__name__}: {error}")
            outcome = {"ok": False, "code": "TTS_FAILED"}
        if isinstance(outcome, dict):
            self._json(422, outcome)
            return
        wav, sample_rate = outcome
        duration_ms = int(len(wav) / 2 / sample_rate * 1000)  # PCM16 mono
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("X-Sample-Rate", str(sample_rate))
        self.send_header("X-Duration-Ms", str(duration_ms))
        self.send_header(
            "X-Content-Sha256",
            "sha256:" + hashlib.sha256(wav).hexdigest(),
        )
        self.send_header("Content-Length", str(len(wav)))
        self.end_headers()
        self.wfile.write(wav)


VOICE_PACK = load_voice_pack()

if __name__ == "__main__":
    if MODELS_DIR.exists():
        os.environ.setdefault("HF_HOME", str(MODELS_DIR / "hf-cache"))
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
    port = int(os.environ.get("VOICE_WORKER_PORT", "8717"))
    print("[voice-worker] 加载 ASR（SenseVoiceSmall + FSMN-VAD，CPU）...")
    _state["asr"] = init_asr()
    print("[voice-worker] 加载 TTS（Kokoro-82M + Misaki zh，CPU）...")
    _state["tts"] = init_tts(VOICE_PACK)
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"[voice-worker] 监听 http://127.0.0.1:{port}（仅本机回环）")
    server.serve_forever()
