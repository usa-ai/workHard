"""Windows desktop pet for the work-hard control service."""

from __future__ import annotations

import base64
import io
import json
import math
import os
import random
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date
from pathlib import Path
from typing import Any

import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog

try:
    from PIL import Image, ImageDraw, ImageTk
    import pystray
except ImportError as exc:  # pragma: no cover - exercised only before installation
    raise SystemExit("桌宠需要 Pillow 和 pystray，请先运行 py -m pip install -r desktop_pet/requirements.txt") from exc


APP_NAME = "WorkHardPet"
SERVER_PORT = int(os.environ.get("WORK_SERVER_PORT", "37651"))
DAILY_LIMIT = 3
MAX_IMAGE_BYTES = 10 * 1024 * 1024
TRANSPARENT_KEY = "#f7fbff"
MIN_SCALE = 0.55
MAX_SCALE = 2.30
MIN_SPEED = 0.5
MAX_SPEED = 12.0
DEFAULT_SCALE = 1.0
DEFAULT_SPEED = 3.5
DEFAULT_QUOTES = ("摸我干嘛", "今天也要加油", "别打扰我摸鱼")
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
SAFE_STATUS = {
    "start": "开始工作，任务已在第二桌面（Win + Tab 切换）最小化打开",
    "refresh": "已继续在未登录状态下使用，并开始工作",
    "login": "已检测到登录状态，并开始工作",
    "off": "下班",
    "next": "已切换下一个任务",
    "prev": "已切换上一个任务",
    "pause": "当前任务已暂停",
    "playing": "当前任务已继续",
    "mute": "提示音已关闭",
    "unmute": "提示音已开启",
    "like": "任务已标记完成",
    "favorite": "任务已归档",
    "search": "搜索任务已开始处理",
    "quickly": "处理速度已调整为",
}


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def app_data_dir() -> Path:
    root = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    return Path(root) / APP_NAME if root else Path.home() / f".{APP_NAME.lower()}"


def normalize_path_list(raw: str | None) -> list[Path]:
    if not raw:
        return []
    items: list[Path] = []
    for part in raw.split(os.pathsep):
        piece = part.strip()
        if piece:
            items.append(Path(piece))
    return items


def asset_roots(project_root: Path) -> list[Path]:
    roots: list[Path] = []
    roots.extend(normalize_path_list(os.environ.get("PET_ASSET_DIR")))
    if getattr(sys, "frozen", False):
        roots.append(Path(sys.executable).resolve().parent / f"{APP_NAME}.assets")
    else:
        roots.append(project_root / "desktop_pet" / "assets")
    roots.append(app_data_dir() / "assets")

    deduped: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        key = str(root.resolve(strict=False)).lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(root)
    return deduped


def random_quote() -> str:
    return random.choice(DEFAULT_QUOTES)


def neutral_status(action: str, returned: str = "") -> str:
    if action == "quickly" and returned:
        return f"处理速度已调整为 {returned}"
    return SAFE_STATUS.get(action, "工作任务已处理")


def _load_rgba_image(path: Path) -> Image.Image:
    with Image.open(path) as image:
        if getattr(image, "is_animated", False):
            image.seek(0)
        image.load()
        return image.convert("RGBA")


def default_pet_image() -> Image.Image:
    image = Image.new("RGBA", (240, 280), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((48, 238, 192, 270), fill=(20, 35, 54, 45))
    draw.rounded_rectangle((52, 38, 188, 226), radius=52, fill=(250, 206, 149, 255), outline=(107, 80, 43, 255), width=5)
    draw.polygon([(72, 62), (90, 20), (106, 64)], fill=(250, 206, 149, 255), outline=(107, 80, 43, 255))
    draw.polygon([(124, 64), (142, 20), (160, 62)], fill=(250, 206, 149, 255), outline=(107, 80, 43, 255))
    draw.ellipse((80, 94, 112, 124), fill=(42, 58, 79, 255))
    draw.ellipse((136, 94, 168, 124), fill=(42, 58, 79, 255))
    draw.ellipse((91, 103, 99, 111), fill="white")
    draw.ellipse((147, 103, 155, 111), fill="white")
    draw.arc((98, 129, 144, 168), 15, 165, fill=(107, 80, 43, 255), width=5)
    draw.ellipse((64, 136, 90, 152), fill=(255, 170, 176, 120))
    draw.ellipse((146, 136, 172, 152), fill=(255, 170, 176, 120))
    draw.line((52, 158, 26, 152), fill=(107, 80, 43, 255), width=5)
    draw.line((188, 158, 214, 152), fill=(107, 80, 43, 255), width=5)
    draw.line((88, 226, 78, 255), fill=(107, 80, 43, 255), width=9)
    draw.line((152, 226, 162, 255), fill=(107, 80, 43, 255), width=9)
    return image


class PetStore:
    def __init__(self, root: Path | None = None):
        self.root = root or app_data_dir()
        self.assets = ensure_dir(self.root / "assets")
        self.state_file = self.root / "state.json"
        self.lock = threading.RLock()
        self.root.mkdir(parents=True, exist_ok=True)
        self.assets.mkdir(parents=True, exist_ok=True)
        self.state: dict[str, Any] = self._load_state()
        self.state.setdefault("profile_id", str(uuid.uuid4()))
        self.state.setdefault("quota", {})
        self.state.setdefault("prefs", {})
        self._persist()

    def _load_state(self) -> dict[str, Any]:
        try:
            return json.loads(self.state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _persist(self) -> None:
        temporary = self.state_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(self.state, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.state_file)

    @property
    def profile_id(self) -> str:
        return str(self.state["profile_id"])

    @staticmethod
    def today() -> str:
        return date.today().isoformat()

    def get_pref(self, key: str, default: Any = None) -> Any:
        with self.lock:
            return self.state.setdefault("prefs", {}).get(key, default)

    def set_pref(self, key: str, value: Any) -> None:
        with self.lock:
            self.state.setdefault("prefs", {})[key] = value
            self._persist()

    def quota(self) -> dict[str, Any]:
        with self.lock:
            quota_key = f"{self.profile_id}:{self.today()}"
            used = int(self.state.setdefault("quota", {}).get(quota_key, 0))
            return {
                "used": used,
                "limit": DAILY_LIMIT,
                "remaining": max(DAILY_LIMIT - used, 0),
                "date": self.today(),
            }

    def reserve_generation(self) -> str:
        with self.lock:
            current = self.quota()
            if current["remaining"] <= 0:
                raise RuntimeError("今日的素材生成额度已用完，请明天再试")
            quota_key = f"{self.profile_id}:{self.today()}"
            self.state["quota"][quota_key] = current["used"] + 1
            self._persist()
            return quota_key

    def release_generation(self, reservation_key: str, success: bool) -> None:
        if success:
            return
        with self.lock:
            self.state.setdefault("quota", {})[reservation_key] = max(int(self.state["quota"].get(reservation_key, 1)) - 1, 0)
            self._persist()

    def list_assets(self, extra_roots: list[Path]) -> list[Path]:
        items: list[Path] = []
        seen: set[str] = set()
        for root in [self.assets, *extra_roots]:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if not path.is_file() or path.suffix.lower() not in IMAGE_EXTENSIONS:
                    continue
                key = str(path.resolve(strict=False)).lower()
                if key in seen:
                    continue
                seen.add(key)
                items.append(path)
        return sorted(items, key=lambda path: (path.parent.as_posix().lower(), path.name.lower()))

    def save_uploaded(self, source: Path) -> Path:
        if source.stat().st_size > MAX_IMAGE_BYTES:
            raise RuntimeError("图片不能超过 10 MB")
        try:
            image = _load_rgba_image(source)
            image.thumbnail((1600, 1600))
            output = self.assets / f"upload-{uuid.uuid4().hex}.png"
            image.save(output, "PNG")
            return output
        except Exception as exc:
            raise RuntimeError("无法读取这张图片，请选择 PNG、JPG、WEBP、GIF 或 BMP 文件") from exc

    def save_generated(self, data: bytes) -> Path:
        if len(data) > MAX_IMAGE_BYTES:
            raise RuntimeError("生成的图片超过 10 MB 限制")
        try:
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                image = image.convert("RGBA")
                image.thumbnail((1600, 1600))
                output = self.assets / f"generated-{uuid.uuid4().hex}.png"
                image.save(output, "PNG")
                return output
        except Exception as exc:
            raise RuntimeError("生成服务返回的内容不是有效图片") from exc


class ActionClient:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.process: subprocess.Popen[Any] | None = None

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{SERVER_PORT}"

    def _request(self, method: str, path: str, timeout: float = 15) -> dict[str, Any]:
        request = urllib.request.Request(f"{self.base_url}{path}", method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                body = json.loads(exc.read().decode("utf-8"))
            except Exception:
                body = {}
            raise RuntimeError(body.get("error", "工作控制服务返回错误")) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError("工作控制服务暂时不可用") from exc

    def ensure_service(self) -> None:
        try:
            if self._request("GET", "/health", timeout=1).get("ok"):
                return
        except RuntimeError:
            pass

        if self.process is None or self.process.poll() is not None:
            node = shutil.which("node") or "node"
            self.process = subprocess.Popen(
                [node, str(self.project_root / "src" / "server.js")],
                cwd=self.project_root,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

        for _ in range(40):
            try:
                if self._request("GET", "/health", timeout=1).get("ok"):
                    return
            except RuntimeError:
                pass
            time.sleep(0.25)
        raise RuntimeError("工作控制服务启动超时")

    def action(self, action: str, payload: str = "") -> dict[str, Any]:
        self.ensure_service()
        path = f"/action/{urllib.parse.quote(action, safe='')}"
        if payload:
            path += f"/{urllib.parse.quote(payload, safe='')}"
        return self._request("POST", path)


class ImageGenerator:
    def __init__(self, store: PetStore):
        self.store = store
        self.key = os.environ.get("PET_AI_API_KEY", "")
        self.base_url = os.environ.get("PET_AI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.model = os.environ.get("PET_AI_MODEL", "gpt-image-1")

    def generate(self, prompt: str) -> tuple[Path, dict[str, Any]]:
        prompt = prompt.strip()
        if not prompt:
            raise RuntimeError("请输入素材描述")
        if len(prompt) > 800:
            raise RuntimeError("素材描述不能超过 800 个字符")
        if not self.key:
            raise RuntimeError("未配置 PET_AI_API_KEY")

        reservation = self.store.reserve_generation()
        success = False
        try:
            body = json.dumps({
                "model": self.model,
                "prompt": f"{prompt}\nCreate a centered desktop pet character on a transparent background. No text, no watermark, full body visible.",
                "n": 1,
                "size": os.environ.get("PET_AI_SIZE", "1024x1024"),
            }).encode("utf-8")
            request = urllib.request.Request(
                f"{self.base_url}/images/generations",
                data=body,
                method="POST",
                headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = json.loads(response.read().decode("utf-8"))
            item = (payload.get("data") or [{}])[0]
            if item.get("b64_json"):
                raw = base64.b64decode(item["b64_json"])
            elif item.get("url"):
                with urllib.request.urlopen(item["url"], timeout=60) as image_response:
                    raw = image_response.read()
            else:
                raise RuntimeError("生成服务没有返回图片")
            path = self.store.save_generated(raw)
            success = True
            return path, self.store.quota()
        except urllib.error.HTTPError as exc:
            try:
                detail = json.loads(exc.read().decode("utf-8")).get("error", {}).get("message", "")
            except Exception:
                detail = ""
            raise RuntimeError(detail or f"生成服务返回 HTTP {exc.code}") from exc
        finally:
            self.store.release_generation(reservation, success)

    def generate_from_image(self, source: Path, prompt: str) -> tuple[Path, dict[str, Any]]:
        if not self.key:
            raise RuntimeError("未配置 PET_AI_API_KEY")
        if not source.exists() or source.stat().st_size > MAX_IMAGE_BYTES:
            raise RuntimeError("参考图片为空或超过 10 MB 限制")

        reservation = self.store.reserve_generation()
        success = False
        boundary = f"----WorkHardPet{uuid.uuid4().hex}"
        fields = {
            "model": self.model,
            "prompt": (prompt or "根据这张参考图生成一个适合桌面显示的完整桌宠，透明背景，无文字和水印。").strip(),
            "n": "1",
            "size": os.environ.get("PET_AI_SIZE", "1024x1024"),
        }
        body = bytearray()
        try:
            image_bytes = source.read_bytes()
            for name, value in fields.items():
                body.extend(
                    f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode("utf-8")
                )
            body.extend(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"reference.png\"\r\nContent-Type: image/png\r\n\r\n".encode("utf-8")
            )
            body.extend(image_bytes)
            body.extend(f"\r\n--{boundary}--\r\n".encode("utf-8"))

            request = urllib.request.Request(
                f"{self.base_url}/images/edits",
                data=bytes(body),
                method="POST",
                headers={
                    "Authorization": f"Bearer {self.key}",
                    "Content-Type": f"multipart/form-data; boundary={boundary}",
                },
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = json.loads(response.read().decode("utf-8"))
            item = (payload.get("data") or [{}])[0]
            if item.get("b64_json"):
                raw = base64.b64decode(item["b64_json"])
            elif item.get("url"):
                with urllib.request.urlopen(item["url"], timeout=60) as image_response:
                    raw = image_response.read()
            else:
                raise RuntimeError("生成服务没有返回图片")
            path = self.store.save_generated(raw)
            success = True
            return path, self.store.quota()
        except urllib.error.HTTPError as exc:
            try:
                detail = json.loads(exc.read().decode("utf-8")).get("error", {}).get("message", "")
            except Exception:
                detail = ""
            raise RuntimeError(detail or f"生成服务返回 HTTP {exc.code}") from exc
        finally:
            self.store.release_generation(reservation, success)


def _round_rectangle(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill, outline=None, width: int = 1):
    try:
        draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)
    except AttributeError:  # pragma: no cover - old Pillow fallback
        draw.rectangle(box, fill=fill, outline=outline, width=width)


def _scale_image(image: Image.Image, scale: float) -> Image.Image:
    scale = clamp(scale, MIN_SCALE, MAX_SCALE)
    width = max(1, int(image.width * scale))
    height = max(1, int(image.height * scale))
    return image.resize((width, height), Image.LANCZOS)


def open_directory(path: Path) -> None:
    ensure_dir(path)
    if sys.platform == "win32":
        os.startfile(str(path))  # type: ignore[attr-defined]
        return
    subprocess.Popen(["xdg-open", str(path)])


class DesktopPet:
    def __init__(self, root: tk.Tk, project_root: Path):
        self.root = root
        self.project_root = project_root
        self.store = PetStore()
        self.client = ActionClient(project_root)
        self.generator = ImageGenerator(self.store)
        self.asset_paths = asset_roots(project_root)
        self.available_assets: list[Path] = []
        self.selected_asset: Path | None = None
        self.current_image = default_pet_image()
        self.current_photo: ImageTk.PhotoImage | None = None
        self.hidden = False
        self.library_open = False
        self.walking_enabled = bool(self.store.get_pref("walking_enabled", True))
        self.scale = clamp(float(self.store.get_pref("scale", DEFAULT_SCALE)), MIN_SCALE, MAX_SCALE)
        self.speed = clamp(float(self.store.get_pref("speed", DEFAULT_SPEED)), MIN_SPEED, MAX_SPEED)
        self.walk_direction = self._random_direction()
        self.last_interaction = time.monotonic()
        self.next_idle_at = self.last_interaction + random.uniform(10.0, 18.0)
        self.drag_anchor: tuple[int, int] | None = None
        self.dragging = False
        self.press_position: tuple[int, int] | None = None
        self.single_click_job: str | None = None
        self.quote_hide_job: str | None = None
        self.walk_job: str | None = None
        self.idle_job: str | None = None
        self.tray_icon: pystray.Icon | None = None
        self.settings_frame_visible = False

        self._configure_window()
        self._build_ui()
        self._restore_state()
        self._refresh_assets()
        self._render_current_asset()
        self._start_loops()
        self._start_tray()

    def _configure_window(self) -> None:
        self.root.title(APP_NAME)
        self.root.overrideredirect(True)
        self.root.resizable(False, False)
        self.root.attributes("-topmost", True)
        self.root.configure(bg=TRANSPARENT_KEY)
        try:
            self.root.attributes("-transparentcolor", TRANSPARENT_KEY)
            self.root.attributes("-alpha", 1.0)
        except tk.TclError:
            self.root.attributes("-alpha", 0.98)

        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        x = max(screen_w - 380, 20)
        y = max(screen_h - 520, 20)
        self.root.geometry(f"360x500+{x}+{y}")
        self.root.protocol("WM_DELETE_WINDOW", self.hide_to_tray)

    def _build_ui(self) -> None:
        shell = tk.Frame(self.root, bg=TRANSPARENT_KEY, highlightthickness=0)
        shell.pack(fill="both", expand=True)

        header = tk.Frame(shell, bg=TRANSPARENT_KEY)
        header.pack(fill="x", padx=10, pady=(6, 0))
        tk.Label(header, text="WorkHardPet", bg="#f7fbff", fg="#4f6f8b", font=("Segoe UI", 10, "bold")).pack(side="left")
        tk.Button(header, text="⚙", command=self.toggle_library, relief="flat", bg="#f0f5fa", fg="#4f6f8b", width=2).pack(side="right", padx=(2, 0))
        tk.Button(header, text="—", command=self.hide_to_tray, relief="flat", bg="#f0f5fa", fg="#4f6f8b", width=2).pack(side="right", padx=(2, 0))
        tk.Button(header, text="×", command=self.quit, relief="flat", bg="#f0f5fa", fg="#4f6f8b", width=2).pack(side="right", padx=(2, 0))

        self.quote_label = tk.Label(
            shell,
            text="",
            bg="#fff6df",
            fg="#5b4c34",
            font=("Segoe UI", 9, "bold"),
            wraplength=220,
            padx=10,
            pady=6,
            relief="solid",
            borderwidth=1,
            justify="center",
        )

        pet_frame = tk.Frame(shell, bg=TRANSPARENT_KEY)
        pet_frame.pack(fill="both", expand=True, padx=18, pady=(8, 0))
        self.pet_label = tk.Label(pet_frame, bg=TRANSPARENT_KEY, cursor="hand2")
        self.pet_label.pack(fill="both", expand=True)
        self.pet_label.bind("<ButtonPress-1>", self._on_pet_press)
        self.pet_label.bind("<B1-Motion>", self._on_pet_drag)
        self.pet_label.bind("<ButtonRelease-1>", self._on_pet_release)
        self.pet_label.bind("<Double-Button-1>", self._on_pet_double_click)
        self.pet_label.bind("<Button-3>", lambda _event: self.quit())
        self.pet_label.bind("<MouseWheel>", self._on_mouse_wheel)
        self.pet_label.bind("<Button-4>", self._on_mouse_wheel)
        self.pet_label.bind("<Button-5>", self._on_mouse_wheel)

        toolbar = tk.Frame(shell, bg=TRANSPARENT_KEY)
        toolbar.pack(fill="x", padx=10, pady=(2, 0))
        self._make_action_button(toolbar, "开", "start")
        self._make_action_button(toolbar, "刷", "refresh")
        self._make_action_button(toolbar, "前", "prev")
        self._make_action_button(toolbar, "后", "next")
        self._make_action_button(toolbar, "赞", "like")
        self._make_action_button(toolbar, "藏", "favorite")
        self._make_action_button(toolbar, "静", "mute")
        tk.Button(toolbar, text="搜", command=self.search, relief="flat", bg="#dbeaf8", fg="#31587f", width=3).pack(side="left", padx=2)
        tk.Button(toolbar, text="库", command=self.toggle_library, relief="flat", bg="#edf3fa", fg="#31587f", width=3).pack(side="left", padx=2)

        self.status = tk.Label(shell, text="准备就绪", bg="#f7fbff", fg="#60758a", font=("Segoe UI", 9))
        self.status.pack(fill="x", padx=10, pady=(6, 4))

        self.library = tk.Frame(shell, bg=TRANSPARENT_KEY)
        self._build_library_panel()

    def _build_library_panel(self) -> None:
        top = tk.Frame(self.library, bg=TRANSPARENT_KEY)
        top.pack(fill="x", padx=10, pady=(0, 2))
        tk.Label(top, text="素材与设置", bg="#f7fbff", fg="#1f2d3a", font=("Segoe UI", 9, "bold")).pack(side="left")
        self.quota_label = tk.Label(top, text="今日额度 0/3", bg="#f7fbff", fg="#71879b", font=("Segoe UI", 8))
        self.quota_label.pack(side="right")

        self.asset_frame = tk.Frame(self.library, bg=TRANSPARENT_KEY)
        self.asset_frame.pack(fill="x", padx=10, pady=(2, 0))

        actions = tk.Frame(self.library, bg=TRANSPARENT_KEY)
        actions.pack(fill="x", padx=10, pady=(6, 2))
        tk.Button(actions, text="上传图片", command=self.upload, relief="flat", bg="#edf3fa", fg="#31587f").pack(side="left", expand=True, fill="x", padx=(0, 4))
        tk.Button(actions, text="上传并生成", command=self.upload_and_generate, relief="flat", bg="#dbeaf8", fg="#31587f").pack(side="left", expand=True, fill="x", padx=(0, 4))
        tk.Button(actions, text="AI 生成", command=self.generate, relief="flat", bg="#dbeaf8", fg="#31587f").pack(side="left", expand=True, fill="x")

        open_dir = tk.Frame(self.library, bg=TRANSPARENT_KEY)
        open_dir.pack(fill="x", padx=10, pady=(4, 2))
        tk.Button(open_dir, text="打开素材目录", command=self.open_asset_directory, relief="flat", bg="#edf3fa", fg="#31587f").pack(fill="x")

        settings = tk.Frame(self.library, bg=TRANSPARENT_KEY)
        settings.pack(fill="x", padx=10, pady=(6, 2))
        tk.Label(settings, text="尺寸", bg="#f7fbff", fg="#1f2d3a", font=("Segoe UI", 8)).pack(anchor="w")
        self.scale_var = tk.DoubleVar(value=self.scale)
        self.scale_slider = tk.Scale(
            settings,
            from_=MIN_SCALE,
            to=MAX_SCALE,
            resolution=0.05,
            orient="horizontal",
            variable=self.scale_var,
            command=self._on_scale_changed,
            showvalue=True,
            length=260,
            bg="#f7fbff",
            highlightthickness=0,
            troughcolor="#d7e4f0",
            fg="#4f6f8b",
        )
        self.scale_slider.pack(fill="x")

        tk.Label(settings, text="移动速度", bg="#f7fbff", fg="#1f2d3a", font=("Segoe UI", 8)).pack(anchor="w", pady=(4, 0))
        self.speed_var = tk.DoubleVar(value=self.speed)
        self.speed_slider = tk.Scale(
            settings,
            from_=MIN_SPEED,
            to=MAX_SPEED,
            resolution=0.1,
            orient="horizontal",
            variable=self.speed_var,
            command=self._on_speed_changed,
            showvalue=True,
            length=260,
            bg="#f7fbff",
            highlightthickness=0,
            troughcolor="#d7e4f0",
            fg="#4f6f8b",
        )
        self.speed_slider.pack(fill="x")

        self.walk_var = tk.BooleanVar(value=self.walking_enabled)
        tk.Checkbutton(
            settings,
            text="自动行走",
            variable=self.walk_var,
            command=self.toggle_walking,
            bg="#f7fbff",
            fg="#4f6f8b",
            activebackground="#f7fbff",
            selectcolor="#f7fbff",
        ).pack(anchor="w", pady=(4, 0))

        tk.Label(
            self.library,
            text="素材放在 EXE 旁边的 WorkHardPet.assets 目录，或 %LOCALAPPDATA%\\WorkHardPet\\assets，替换文件后无需重新打包。",
            bg="#f7fbff",
            fg="#6b7e90",
            font=("Segoe UI", 8),
            wraplength=310,
            justify="left",
        ).pack(fill="x", padx=10, pady=(6, 4))

    def _make_action_button(self, parent: tk.Widget, label: str, action: str) -> None:
        tk.Button(
            parent,
            text=label,
            command=lambda a=action: self.run_action(a),
            relief="flat",
            bg="#e7eff9",
            fg="#31587f",
            width=3,
        ).pack(side="left", padx=2)

    def _restore_state(self) -> None:
        saved_asset = self.store.get_pref("selected_asset")
        saved_x = self.store.get_pref("window_x")
        saved_y = self.store.get_pref("window_y")
        if isinstance(saved_x, int) and isinstance(saved_y, int):
            width = self.root.winfo_width() or 360
            height = self.root.winfo_height() or 500
            screen_w = self.root.winfo_screenwidth()
            screen_h = self.root.winfo_screenheight()
            x = int(clamp(saved_x, 0, max(screen_w - width, 0)))
            y = int(clamp(saved_y, 0, max(screen_h - height, 0)))
            self.root.geometry(f"+{x}+{y}")
        if isinstance(saved_asset, str) and saved_asset:
            path = Path(saved_asset)
            if path.exists():
                self.selected_asset = path
        self._save_state_flags()

    def _save_state_flags(self) -> None:
        self.store.set_pref("scale", self.scale)
        self.store.set_pref("speed", self.speed)
        self.store.set_pref("walking_enabled", self.walking_enabled)
        if self.selected_asset:
            self.store.set_pref("selected_asset", str(self.selected_asset))

    def _save_window_position(self) -> None:
        try:
            self.store.set_pref("window_x", self.root.winfo_x())
            self.store.set_pref("window_y", self.root.winfo_y())
        except tk.TclError:
            pass

    def _refresh_assets(self) -> None:
        self.available_assets = self.store.list_assets(self.asset_paths)
        current = self.selected_asset if self.selected_asset and self.selected_asset.exists() else None
        if current is None and self.available_assets:
            current = self.available_assets[0]
        self.selected_asset = current
        self._render_asset_grid()
        self._update_quota()

    def _render_asset_grid(self) -> None:
        for child in self.asset_frame.winfo_children():
            child.destroy()

        buttons: list[tuple[Path | None, str]] = [(None, "默认")]
        buttons.extend((path, path.stem[:8] or "素材") for path in self.available_assets[:6])

        self.asset_photos: list[ImageTk.PhotoImage] = []
        for path, title in buttons:
            frame = tk.Frame(self.asset_frame, bg="#ffffff", highlightbackground="#d9e3ef", highlightthickness=1)
            frame.pack(side="left", padx=2, pady=2)
            try:
                image = default_pet_image() if path is None else _load_rgba_image(path)
                image.thumbnail((52, 52))
                photo = ImageTk.PhotoImage(image)
                self.asset_photos.append(photo)
                button = tk.Button(
                    frame,
                    image=photo,
                    text=title,
                    compound="bottom",
                    command=lambda p=path: self.select_asset(p),
                    relief="flat",
                    bg="#ffffff",
                    fg="#476b8f",
                    font=("Segoe UI", 7),
                )
            except Exception:
                button = tk.Button(
                    frame,
                    text=title,
                    command=lambda p=path: self.select_asset(p),
                    relief="flat",
                    bg="#ffffff",
                    fg="#476b8f",
                    font=("Segoe UI", 7),
                )
            button.pack(padx=2, pady=2)

    def _render_current_asset(self) -> None:
        source = self._current_base_image()
        scaled = _scale_image(source, self.scale)
        self.current_image = source
        self.current_photo = ImageTk.PhotoImage(scaled)
        self.pet_label.configure(image=self.current_photo)
        self.root.update_idletasks()
        self._clamp_to_screen()
        self._save_state_flags()

    def _current_base_image(self) -> Image.Image:
        if self.selected_asset and self.selected_asset.exists():
            try:
                return _load_rgba_image(self.selected_asset)
            except Exception:
                self.selected_asset = None
        return default_pet_image()

    def _clamp_to_screen(self) -> None:
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        x = clamp(self.root.winfo_x(), 0, max(screen_w - width, 0))
        y = clamp(self.root.winfo_y(), 0, max(screen_h - height, 0))
        self.root.geometry(f"{width}x{height}+{int(x)}+{int(y)}")

    def _update_quota(self) -> None:
        current = self.store.quota()
        self.quota_label.configure(text=f"今日额度 {current['used']}/{current['limit']}")

    def _start_tray(self) -> None:
        icon_image = default_pet_image().resize((64, 64))
        menu = pystray.Menu(
            pystray.MenuItem("显示桌宠", lambda _icon, _item: self.root.after(0, self.show_from_tray)),
            pystray.MenuItem("隐藏桌宠", lambda _icon, _item: self.root.after(0, self.hide_to_tray)),
            pystray.MenuItem("退出", lambda _icon, _item: self.root.after(0, self.quit)),
        )
        self.tray_icon = pystray.Icon("work-hard-pet", icon_image, APP_NAME, menu)
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def _start_loops(self) -> None:
        self.walk_job = self.root.after(60, self._walk_tick)
        self.idle_job = self.root.after(800, self._idle_tick)

    def _random_direction(self) -> tuple[float, float]:
        angle = random.uniform(0, math.tau)
        return math.cos(angle), math.sin(angle)

    def _touch(self) -> None:
        self.last_interaction = time.monotonic()
        self.next_idle_at = self.last_interaction + random.uniform(10.0, 18.0)

    def _walk_tick(self) -> None:
        if self.root.winfo_exists():
            self.walk_job = self.root.after(60, self._walk_tick)
        if self.hidden or not self.walking_enabled or self.dragging:
            return

        self._drift_walk_direction()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        x = self.root.winfo_x()
        y = self.root.winfo_y()
        dx, dy = self.walk_direction
        step = max(1.0, self.speed * (0.75 + self.scale * 0.18))
        x += dx * step
        y += dy * step

        max_x = max(screen_w - width, 0)
        max_y = max(screen_h - height, 0)
        bounced = False
        if x <= 0:
            x = 0
            dx = abs(dx)
            bounced = True
        elif x >= max_x:
            x = max_x
            dx = -abs(dx)
            bounced = True
        if y <= 0:
            y = 0
            dy = abs(dy)
            bounced = True
        elif y >= max_y:
            y = max_y
            dy = -abs(dy)
            bounced = True

        if bounced:
            self.walk_direction = self._normalize_direction(dx, dy)
        self.root.geometry(f"{width}x{height}+{int(x)}+{int(y)}")
        self._save_window_position()

    def _drift_walk_direction(self) -> None:
        if random.random() < 0.02:
            dx, dy = self.walk_direction
            dx += random.uniform(-0.25, 0.25)
            dy += random.uniform(-0.25, 0.25)
            self.walk_direction = self._normalize_direction(dx, dy)

    @staticmethod
    def _normalize_direction(dx: float, dy: float) -> tuple[float, float]:
        length = math.hypot(dx, dy)
        if not length:
            return 1.0, 0.0
        return dx / length, dy / length

    def _idle_tick(self) -> None:
        if self.root.winfo_exists():
            self.idle_job = self.root.after(800, self._idle_tick)
        if self.hidden or self.dragging or not self.walking_enabled:
            return
        if time.monotonic() >= self.next_idle_at:
            self._perform_idle_action()
            self._touch()

    def _perform_idle_action(self) -> None:
        action = random.choice(("quote", "bounce", "wiggle"))
        if action == "quote":
            self.show_quote(random_quote())
            self._pulse(0, -8)
        elif action == "bounce":
            self._pulse(0, -10)
        else:
            self._pulse(random.choice((-8, 8)), 0)

    def _pulse(self, dx: int, dy: int, delay_ms: int = 180) -> None:
        if self.hidden or not self.root.winfo_exists():
            return
        start_x = self.root.winfo_x()
        start_y = self.root.winfo_y()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        self.root.geometry(f"{width}x{height}+{start_x + dx}+{start_y + dy}")

        def restore() -> None:
            if self.root.winfo_exists():
                self.root.geometry(f"{width}x{height}+{start_x}+{start_y}")
                self._save_window_position()

        self.root.after(delay_ms, restore)

    def show_quote(self, text: str) -> None:
        if self.hidden:
            return
        if self.quote_hide_job:
            try:
                self.root.after_cancel(self.quote_hide_job)
            except tk.TclError:
                pass
            self.quote_hide_job = None
        self.quote_label.configure(text=text)
        self.quote_label.place(relx=0.5, y=35, anchor="n")
        self.quote_label.lift()
        self.quote_hide_job = self.root.after(1800, self.hide_quote)

    def hide_quote(self) -> None:
        if self.quote_hide_job:
            try:
                self.root.after_cancel(self.quote_hide_job)
            except tk.TclError:
                pass
        self.quote_hide_job = None
        self.quote_label.place_forget()

    def set_status(self, text: str, error: bool = False) -> None:
        if not self.root.winfo_exists():
            return
        self.status.configure(text=text, fg="#a74444" if error else "#60758a")

    def _on_pet_press(self, event: tk.Event[Any]) -> None:
        self._touch()
        self.dragging = False
        self.press_position = (event.x_root, event.y_root)
        self.drag_anchor = (event.x_root - self.root.winfo_x(), event.y_root - self.root.winfo_y())

    def _on_pet_drag(self, event: tk.Event[Any]) -> None:
        if not self.drag_anchor:
            return
        self.dragging = True
        x = event.x_root - self.drag_anchor[0]
        y = event.y_root - self.drag_anchor[1]
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        screen_w = self.root.winfo_screenwidth()
        screen_h = self.root.winfo_screenheight()
        x = int(clamp(x, 0, max(screen_w - width, 0)))
        y = int(clamp(y, 0, max(screen_h - height, 0)))
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def _on_pet_release(self, _event: tk.Event[Any]) -> None:
        self._save_window_position()
        if self.dragging:
            self.dragging = False
            self.drag_anchor = None
            return
        if self.single_click_job:
            try:
                self.root.after_cancel(self.single_click_job)
            except tk.TclError:
                pass
        self.single_click_job = self.root.after(150, self._handle_single_click)

    def _handle_single_click(self) -> None:
        self.single_click_job = None
        self.show_quote(random_quote())
        self._pulse(0, -8)
        self._touch()

    def _on_pet_double_click(self, _event: tk.Event[Any]) -> None:
        if self.single_click_job:
            try:
                self.root.after_cancel(self.single_click_job)
            except tk.TclError:
                pass
            self.single_click_job = None
        self.run_action("start")

    def _on_mouse_wheel(self, event: tk.Event[Any]) -> None:
        self._touch()
        raw_delta = getattr(event, "delta", 0)
        if raw_delta == 0:
            raw_delta = 1 if getattr(event, "num", 0) == 4 else -1
        if event.state & 0x0004:  # Control
            delta = 0.25 if raw_delta > 0 else -0.25
            self.set_speed(self.speed + delta)
        else:
            delta = 0.05 if raw_delta > 0 else -0.05
            self.set_scale(self.scale + delta)

    def set_scale(self, value: float, persist: bool = True) -> None:
        new_value = clamp(float(value), MIN_SCALE, MAX_SCALE)
        if abs(new_value - self.scale) < 0.001:
            return
        self.scale = new_value
        self.scale_var.set(self.scale)
        self._render_current_asset()
        self.set_status(f"尺寸已调整为 {self.scale:.2f}x")
        if persist:
            self.store.set_pref("scale", self.scale)
        self._touch()

    def set_speed(self, value: float, persist: bool = True) -> None:
        new_value = clamp(float(value), MIN_SPEED, MAX_SPEED)
        if abs(new_value - self.speed) < 0.001:
            return
        self.speed = new_value
        self.speed_var.set(self.speed)
        self.set_status(f"移动速度已调整为 {self.speed:.1f}")
        if persist:
            self.store.set_pref("speed", self.speed)
        self._touch()

    def _on_scale_changed(self, value: str) -> None:
        try:
            self.set_scale(float(value))
        except ValueError:
            return

    def _on_speed_changed(self, value: str) -> None:
        try:
            self.set_speed(float(value))
        except ValueError:
            return

    def toggle_walking(self) -> None:
        self.walking_enabled = bool(self.walk_var.get())
        self.store.set_pref("walking_enabled", self.walking_enabled)
        self.set_status("自动行走已开启" if self.walking_enabled else "自动行走已关闭")
        self._touch()

    def toggle_library(self) -> None:
        self.library_open = not self.library_open
        if self.library_open:
            self.library.pack(fill="x", padx=0, pady=(0, 6))
            self._refresh_assets()
            self._update_quota()
            self.set_status("素材面板已打开")
        else:
            self.library.pack_forget()
            self.set_status("素材面板已关闭")
        self.root.update_idletasks()
        self._clamp_to_screen()
        self._touch()

    def select_asset(self, path: Path | None) -> None:
        self.selected_asset = path if path and path.exists() else None
        self._render_current_asset()
        self._refresh_assets()
        self.set_status("已经切换桌宠素材")
        self._touch()

    def _resolve_open_directory(self) -> Path:
        if self.asset_paths:
            return ensure_dir(self.asset_paths[0])
        return self.store.assets

    def open_asset_directory(self) -> None:
        try:
            open_directory(self._resolve_open_directory())
        except Exception as exc:
            messagebox.showerror("无法打开素材目录", str(exc), parent=self.root)

    def _show_action_result(self, result: dict[str, Any], action: str) -> None:
        message = neutral_status(action, str(result.get("message", "")).strip())
        self.set_status(message)

    def run_action(self, action: str, payload: str = "") -> None:
        self.set_status("正在处理…")
        self._touch()

        def worker() -> None:
            try:
                result = self.client.action(action, payload)
                self.root.after(0, lambda: self._show_action_result(result, action))
            except Exception as exc:
                self.root.after(0, lambda: self.set_status(str(exc), True))

        threading.Thread(target=worker, daemon=True).start()

    def search(self) -> None:
        query = simpledialog.askstring("搜索素材", "请输入关键词", parent=self.root)
        if not query or not query.strip():
            self.set_status("请先输入关键词", True)
            return
        self.run_action("search", query.strip())

    def upload(self) -> None:
        source = filedialog.askopenfilename(
            title="选择图片素材",
            filetypes=[("图片", "*.png *.jpg *.jpeg *.webp *.gif *.bmp")],
            parent=self.root,
        )
        if not source:
            return
        try:
            selected = self.store.save_uploaded(Path(source))
            self.selected_asset = selected
            self._refresh_assets()
            self._render_current_asset()
            self.set_status("素材已加入素材库")
        except Exception as exc:
            messagebox.showerror("素材上传失败", str(exc), parent=self.root)

    def upload_and_generate(self) -> None:
        source = filedialog.askopenfilename(
            title="选择参考图片",
            filetypes=[("图片", "*.png *.jpg *.jpeg *.webp *.gif *.bmp")],
            parent=self.root,
        )
        if not source:
            return
        prompt = simpledialog.askstring("生成桌宠素材", "可选：补充角色描述", parent=self.root) or ""
        try:
            reference = self.store.save_uploaded(Path(source))
        except Exception as exc:
            messagebox.showerror("参考图片不可用", str(exc), parent=self.root)
            return
        self.set_status("正在根据参考图生成…")
        self._touch()

        def worker() -> None:
            try:
                path, _quota = self.generator.generate_from_image(reference, prompt)

                def done() -> None:
                    self.selected_asset = path
                    self._refresh_assets()
                    self._render_current_asset()
                    self._update_quota()
                    self.set_status("新素材已加入素材库")

                self.root.after(0, done)
            except Exception as exc:
                self.root.after(0, lambda: (self._update_quota(), self.set_status(str(exc), True)))

        threading.Thread(target=worker, daemon=True).start()

    def generate(self) -> None:
        prompt = simpledialog.askstring("生成桌宠素材", "描述你想要的桌宠形象", parent=self.root)
        if not prompt or not prompt.strip():
            return
        self.set_status("正在生成素材…")
        self._touch()

        def worker() -> None:
            try:
                path, _quota = self.generator.generate(prompt.strip())

                def done() -> None:
                    self.selected_asset = path
                    self._refresh_assets()
                    self._render_current_asset()
                    self._update_quota()
                    self.set_status("新素材已加入素材库")

                self.root.after(0, done)
            except Exception as exc:
                self.root.after(0, lambda: (self._update_quota(), self.set_status(str(exc), True)))

        threading.Thread(target=worker, daemon=True).start()

    def _update_geometry_from_current_size(self) -> None:
        self.root.update_idletasks()
        self._clamp_to_screen()

    def hide_to_tray(self) -> None:
        self.hidden = True
        self._save_window_position()
        self.root.withdraw()

    def show_from_tray(self) -> None:
        self.hidden = False
        self.root.deiconify()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.after(0, self._clamp_to_screen)
        self._touch()

    def quit(self) -> None:
        self._save_window_position()
        self._save_state_flags()
        if self.tray_icon:
            self.tray_icon.stop()
            self.tray_icon = None
        if self.root.winfo_exists():
            self.root.destroy()


def find_project_root() -> Path:
    candidates: list[Path] = []
    configured = os.environ.get("WORK_HARD_ROOT")
    if configured:
        candidates.append(Path(configured))
    candidates.extend([Path.cwd(), Path(__file__).resolve().parents[1]])
    if getattr(sys, "frozen", False):
        candidates.insert(0, Path(sys.executable).resolve().parent)
    for candidate in candidates:
        if (candidate / "src" / "server.js").exists():
            return candidate
    return candidates[0]


def main() -> None:
    project_root = find_project_root()
    root = tk.Tk()
    DesktopPet(root, project_root)
    root.mainloop()


if __name__ == "__main__":
    main()
