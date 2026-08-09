"""Discreet Windows desktop pet for the work-hard control service."""

from __future__ import annotations

import base64
import io
import json
import os
import re
import shutil
import subprocess
import sys
import threading
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
    raise SystemExit("桌宠需要 Pillow 和 pystray，请先执行: py -m pip install -r desktop_pet/requirements.txt") from exc


SERVER_PORT = int(os.environ.get("WORK_SERVER_PORT", "37651"))
DAILY_LIMIT = 3
MAX_IMAGE_BYTES = 10 * 1024 * 1024
SAFE_STATUS = {
    "start": "开始工作",
    "refresh": "已刷新工作状态",
    "login": "登录状态已更新",
    "off": "工作模式已关闭",
    "next": "已切换到下一个任务",
    "prev": "已切换到上一个任务",
    "play": "已开始工作",
    "pause": "已暂停工作",
    "toggle": "工作状态已切换",
    "mute": "已静音",
    "unmute": "已取消静音",
    "like": "任务已标记完成",
    "favorite": "任务已归档",
    "search": "搜索任务已开始处理",
    "quickly": "处理速度已调整",
}
FORBIDDEN_STATUS = re.compile(r"抖音|douyin|视频|播放|刷视频|启动抖音|打开抖音|搜索视频|点赞|收藏|\bvideo\b|\bplay(?:back)?\b|\bwatch(?:ing)?\b", re.IGNORECASE)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
TRANSPARENT_KEY = "#f7fbff"


def neutral_status(action: str, returned: str = "") -> str:
    """Keep all desktop-pet status text neutral, including old service replies."""
    return SAFE_STATUS.get(action, "工作任务已处理")


def app_data_dir() -> Path:
    root = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
    return Path(root) / "WorkHardPet" if root else Path.home() / ".work-hard-pet"


class PetStore:
    def __init__(self, root: Path | None = None):
        self.root = root or app_data_dir()
        self.assets = self.root / "assets"
        self.state_file = self.root / "state.json"
        self.lock = threading.RLock()
        self.root.mkdir(parents=True, exist_ok=True)
        self.assets.mkdir(parents=True, exist_ok=True)
        try:
            self.state: dict[str, Any] = json.loads(self.state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.state = {"profile_id": str(uuid.uuid4()), "quota": {}}
            self._persist()
        configured_profile = os.environ.get("PET_USER_ID", "").strip()
        if configured_profile:
            self.state["profile_id"] = configured_profile[:120]
        self.state.setdefault("profile_id", str(uuid.uuid4()))
        self.state.setdefault("quota", {})
        self._persist()

    @property
    def profile_id(self) -> str:
        return str(self.state["profile_id"])

    def _persist(self) -> None:
        temporary = self.state_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(self.state, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.state_file)

    @staticmethod
    def today() -> str:
        return date.today().isoformat()

    def quota(self) -> dict[str, Any]:
        with self.lock:
            key = f"{self.profile_id}:{self.today()}"
            used = int(self.state["quota"].get(key, 0))
            return {"used": used, "limit": DAILY_LIMIT, "remaining": max(DAILY_LIMIT - used, 0), "date": self.today()}

    def reserve_generation(self) -> str:
        with self.lock:
            current = self.quota()
            if current["remaining"] <= 0:
                raise RuntimeError("今日的素材生成额度已用完，请明天再试")
            key = f"{self.profile_id}:{self.today()}"
            self.state["quota"][key] = current["used"] + 1
            self._persist()
            return key

    def release_generation(self, key: str, success: bool) -> None:
        if success:
            return
        with self.lock:
            self.state["quota"][key] = max(int(self.state["quota"].get(key, 1)) - 1, 0)
            self._persist()

    def list_assets(self) -> list[Path]:
        return sorted((path for path in self.assets.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS), key=lambda p: p.name)

    def save_uploaded(self, source: Path) -> Path:
        if source.stat().st_size > MAX_IMAGE_BYTES:
            raise RuntimeError("图片不能超过 10 MB")
        try:
            with Image.open(source) as image:
                image.load()
                image.thumbnail((1200, 1200))
                output = self.assets / f"upload-{uuid.uuid4().hex}.png"
                image.convert("RGBA").save(output, "PNG")
                return output
        except Exception as exc:
            raise RuntimeError("无法读取这张图片，请选择 PNG、JPG、WEBP 或 GIF 文件") from exc

    def save_generated(self, data: bytes) -> Path:
        if len(data) > MAX_IMAGE_BYTES:
            raise RuntimeError("生成的图片超过 10 MB 限制")
        try:
            with Image.open(io.BytesIO(data)) as image:
                image.load()
                image.thumbnail((1200, 1200))
                output = self.assets / f"generated-{uuid.uuid4().hex}.png"
                image.convert("RGBA").save(output, "PNG")
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
            import time
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
            payload = json.dumps({
                "model": self.model,
                "prompt": f"{prompt}\nCreate a centered desktop pet character on a transparent background. No text, no watermark, full body visible.",
                "n": 1,
                "size": os.environ.get("PET_AI_SIZE", "1024x1024"),
            }).encode("utf-8")
            request = urllib.request.Request(
                f"{self.base_url}/images/generations",
                data=payload,
                method="POST",
                headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                body = json.loads(response.read().decode("utf-8"))
            item = (body.get("data") or [{}])[0]
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
        """Create a normalized pet asset from an uploaded reference image."""
        if not self.key:
            raise RuntimeError("未配置 PET_AI_API_KEY")
        if not source.exists() or source.stat().st_size > MAX_IMAGE_BYTES:
            raise RuntimeError("参考图片为空或超过 10 MB 限制")
        reservation = self.store.reserve_generation()
        success = False
        boundary = f"----WorkHardPet{uuid.uuid4().hex}"
        fields = {
            "model": self.model,
            "prompt": (prompt or "根据这张参考图生成一个适合桌面显示的完整桌宠，透明背景，无文字和水印").strip(),
            "n": "1",
            "size": os.environ.get("PET_AI_SIZE", "1024x1024"),
        }
        body = bytearray()
        try:
            image_bytes = source.read_bytes()
            for name, value in fields.items():
                body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode())
            body.extend(f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"reference.png\"\r\nContent-Type: image/png\r\n\r\n".encode())
            body.extend(image_bytes)
            body.extend(f"\r\n--{boundary}--\r\n".encode())
            request = urllib.request.Request(
                f"{self.base_url}/images/edits",
                data=bytes(body),
                method="POST",
                headers={"Authorization": f"Bearer {self.key}", "Content-Type": f"multipart/form-data; boundary={boundary}"},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                response_body = json.loads(response.read().decode("utf-8"))
            item = (response_body.get("data") or [{}])[0]
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


def default_pet_image() -> Image.Image:
    image = Image.new("RGBA", (240, 280), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((50, 245, 190, 275), fill=(34, 55, 78, 42))
    draw.rounded_rectangle((55, 32, 185, 245), radius=58, fill=(135, 184, 235, 255), outline=(49, 84, 124, 255), width=6)
    draw.ellipse((78, 95, 105, 122), fill=(38, 56, 79, 255))
    draw.ellipse((135, 95, 162, 122), fill=(38, 56, 79, 255))
    draw.ellipse((87, 101, 94, 108), fill="white")
    draw.ellipse((144, 101, 151, 108), fill="white")
    draw.arc((99, 125, 141, 165), 10, 170, fill=(49, 84, 124, 255), width=5)
    draw.line((55, 160, 28, 160), fill=(49, 84, 124, 255), width=6)
    draw.line((185, 160, 212, 160), fill=(49, 84, 124, 255), width=6)
    draw.line((84, 232, 71, 267), fill=(49, 84, 124, 255), width=10)
    draw.line((156, 232, 169, 267), fill=(49, 84, 124, 255), width=10)
    return image


class DesktopPet:
    def __init__(self, root: tk.Tk, project_root: Path):
        self.root = root
        self.project_root = project_root
        self.store = PetStore()
        self.client = ActionClient(project_root)
        self.generator = ImageGenerator(self.store)
        self.image_refs: list[ImageTk.PhotoImage] = []
        self.selected_path: Path | None = None
        self.library_open = False
        self.drag_start: tuple[int, int] | None = None
        self.tray_icon = None
        self.click_through = False
        self.click_var = tk.BooleanVar(value=False)
        self._configure_window()
        self._build_ui()
        self._load_selected(default=True)
        self._start_tray()

    def _configure_window(self) -> None:
        self.root.title("效率工作桌宠")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.configure(bg=TRANSPARENT_KEY)
        try:
            self.root.attributes("-transparentcolor", TRANSPARENT_KEY)
        except tk.TclError:
            self.root.attributes("-alpha", 0.96)
        x = max(self.root.winfo_screenwidth() - 380, 20)
        y = max(self.root.winfo_screenheight() - 500, 20)
        self.root.geometry(f"340x430+{x}+{y}")
        self.root.protocol("WM_DELETE_WINDOW", self.quit)

    def _build_ui(self) -> None:
        shell = tk.Frame(self.root, bg=TRANSPARENT_KEY, highlightthickness=0)
        shell.pack(fill="both", expand=True)
        header = tk.Frame(shell, bg=TRANSPARENT_KEY, height=30)
        header.pack(fill="x", padx=10, pady=(7, 0))
        tk.Label(header, text="效率工作", bg="#f7fbff", fg="#52769d", font=("Segoe UI", 10, "bold")).pack(side="left")
        tk.Button(header, text="−", command=self.root.withdraw, relief="flat", bg="#f7fbff", fg="#60758a", width=2).pack(side="right")
        tk.Button(header, text="×", command=self.quit, relief="flat", bg="#f7fbff", fg="#60758a", width=2).pack(side="right")
        header.bind("<ButtonPress-1>", self._drag_start)
        header.bind("<B1-Motion>", self._drag_move)

        self.pet_label = tk.Label(shell, bg=TRANSPARENT_KEY, cursor="hand2")
        self.pet_label.pack(fill="both", expand=True, padx=35, pady=(3, 0))
        self.pet_label.bind("<Button-1>", lambda _event: self.run_action("start"))
        self.pet_label.bind("<ButtonPress-3>", self._show_menu)

        toolbar = tk.Frame(shell, bg=TRANSPARENT_KEY)
        toolbar.pack(fill="x", padx=10, pady=(0, 7))
        actions = [("▶", "start", "开始工作"), ("→", "next", "切换下一个任务"), ("♥", "like", "完成点赞"), ("★", "favorite", "完成收藏"), ("⌁", "mute", "静音")]
        for label, action, tooltip in actions:
            tk.Button(toolbar, text=label, command=lambda a=action: self.run_action(a), relief="flat", bg="#e7eff9", fg="#31587f", width=4, height=1).pack(side="left", padx=2)
        tk.Button(toolbar, text="✦", command=self.toggle_library, relief="flat", bg="#e7eff9", fg="#31587f", width=4).pack(side="left", padx=2)

        tk.Button(toolbar, text="←", command=lambda: self.run_action("prev"), relief="flat", bg="#e7eff9", fg="#31587f", width=4).pack(side="left", padx=2)

        search = tk.Frame(shell, bg=TRANSPARENT_KEY)
        search.pack(fill="x", padx=10)
        self.search_entry = tk.Entry(search, relief="flat", bg="white", fg="#1e2a38")
        self.search_entry.pack(side="left", fill="x", expand=True, ipady=5, padx=(0, 5))
        tk.Button(search, text="⌕", command=self.search, relief="flat", bg="#dbeaf8", fg="#31587f", width=4).pack(side="right")
        self.search_entry.bind("<Return>", lambda _event: self.search())
        self.status = tk.Label(shell, text="准备就绪", bg="#f7fbff", fg="#60758a", font=("Segoe UI", 9))
        self.status.pack(fill="x", padx=10, pady=(6, 5))

        self.library = tk.Frame(shell, bg=TRANSPARENT_KEY)
        self.library_heading = tk.Frame(self.library, bg=TRANSPARENT_KEY)
        self.library_heading.pack(fill="x")
        tk.Label(self.library_heading, text="素材库", bg="#f7fbff", fg="#1e2a38", font=("Segoe UI", 9, "bold")).pack(side="left")
        self.quota_label = tk.Label(self.library_heading, text="今日生成 0/3", bg="#f7fbff", fg="#71879b", font=("Segoe UI", 8))
        self.quota_label.pack(side="right")
        self.asset_frame = tk.Frame(self.library, bg=TRANSPARENT_KEY)
        self.asset_frame.pack(fill="x", pady=5)
        tk.Button(self.library, text="上传并生成桌宠", command=self.upload_and_generate, relief="flat", bg="#dbeaf8", fg="#31587f").pack(fill="x", pady=(0, 5))
        tk.Button(self.library, text="上传图片素材", command=self.upload, relief="flat", bg="#edf3fa", fg="#476b8f").pack(fill="x", pady=(0, 5))
        tk.Button(self.library, text="AI 生成素材", command=self.generate, relief="flat", bg="#dbeaf8", fg="#31587f").pack(fill="x")

    def _show_menu(self, _event=None):
        menu = tk.Menu(self.root, tearoff=False)
        menu.add_command(label="开始工作", command=lambda: self.run_action("start"))
        menu.add_command(label="切换下一个任务", command=lambda: self.run_action("next"))
        menu.add_command(label="管理素材", command=self.toggle_library)
        menu.add_checkbutton(label="点击穿透", onvalue=True, offvalue=False, variable=self.click_var, command=self.toggle_click_through)
        menu.add_separator()
        menu.add_command(label="隐藏", command=self.root.withdraw)
        menu.add_command(label="退出", command=self.quit)
        menu.tk_popup(self.root.winfo_pointerx(), self.root.winfo_pointery())

    def _start_tray(self):
        icon_image = default_pet_image().resize((64, 64))
        menu = pystray.Menu(
            pystray.MenuItem("显示桌宠", lambda _icon, _item: self.root.after(0, self.root.deiconify)),
            pystray.MenuItem("隐藏桌宠", lambda _icon, _item: self.root.after(0, self.root.withdraw)),
            pystray.MenuItem("退出", lambda _icon, _item: self.root.after(0, self.quit)),
        )
        self.tray_icon = pystray.Icon("work-hard-pet", icon_image, "效率工作桌宠", menu)
        threading.Thread(target=self.tray_icon.run, daemon=True).start()

    def quit(self):
        if self.tray_icon:
            self.tray_icon.stop()
            self.tray_icon = None
        self.root.destroy()

    def toggle_click_through(self):
        self.click_through = not self.click_through
        self.click_var.set(self.click_through)
        if sys.platform != "win32":
            self.set_status("点击穿透仅支持 Windows", True)
            self.click_through = False
            self.click_var.set(False)
            return
        try:
            import ctypes
            hwnd = self.root.winfo_id()
            get_style = ctypes.windll.user32.GetWindowLongW
            set_style = ctypes.windll.user32.SetWindowLongW
            style = get_style(hwnd, -20)
            flag = 0x20 | 0x80000
            set_style(hwnd, -20, style | flag if self.click_through else style & ~0x20)
            self.set_status("已开启点击穿透" if self.click_through else "已关闭点击穿透")
        except Exception:
            self.click_through = False
            self.click_var.set(False)
            self.set_status("无法切换点击穿透", True)

    def _drag_start(self, event):
        self.drag_start = (event.x_root - self.root.winfo_x(), event.y_root - self.root.winfo_y())

    def _drag_move(self, event):
        if self.drag_start:
            x, y = self.drag_start
            self.root.geometry(f"+{event.x_root - x}+{event.y_root - y}")

    def _load_selected(self, default=False):
        if default or not self.selected_path:
            image = default_pet_image()
        else:
            image = Image.open(self.selected_path).convert("RGBA")
            image.thumbnail((240, 280))
        image.thumbnail((240, 280))
        photo = ImageTk.PhotoImage(image)
        self.image_refs = [photo]
        self.pet_label.configure(image=photo)

    def set_status(self, text, error=False):
        self.status.configure(text=text, fg="#a74444" if error else "#60758a")

    def run_action(self, action, payload=""):
        self.set_status("正在处理…")
        def worker():
            try:
                result = self.client.action(action, payload)
                message = neutral_status(action, str(result.get("message", "")))
                self.root.after(0, lambda: self.set_status(message))
            except Exception:
                self.root.after(0, lambda: self.set_status("工作控制服务暂时不可用", True))
        threading.Thread(target=worker, daemon=True).start()

    def search(self):
        query = self.search_entry.get().strip()
        if not query:
            self.set_status("请输入处理关键词", True)
            return
        self.search_entry.delete(0, tk.END)
        self.run_action("search", query)

    def toggle_library(self):
        self.library_open = not self.library_open
        if self.library_open:
            self.root.geometry("340x590")
            self.library.pack(fill="x", padx=10, pady=(0, 8))
            self._render_assets()
            self._update_quota()
        else:
            self.library.pack_forget()
            self.root.geometry("340x430")

    def _render_assets(self):
        for child in self.asset_frame.winfo_children(): child.destroy()
        self.image_refs = []
        entries = [(None, "默认")]
        entries.extend((path, path.stem[:8]) for path in self.store.list_assets())
        for path, label in entries:
            frame = tk.Frame(self.asset_frame, bg="#ffffff", highlightbackground="#d7e3ef", highlightthickness=1)
            frame.pack(side="left", padx=2)
            try:
                image = default_pet_image() if path is None else Image.open(path).convert("RGBA")
                image.thumbnail((50, 50))
                photo = ImageTk.PhotoImage(image)
                self.image_refs.append(photo)
                button = tk.Button(frame, image=photo, text=label, compound="bottom", command=lambda p=path: self.select_asset(p), relief="flat", bg="#ffffff", fg="#476b8f", font=("Segoe UI", 7))
            except Exception:
                button = tk.Button(frame, text=label, command=lambda p=path: self.select_asset(p), relief="flat", bg="#ffffff")
            button.pack(padx=2, pady=2)

    def select_asset(self, path):
        self.selected_path = path
        self._load_selected(default=path is None)
        self._render_assets()
        self.set_status("已切换桌宠素材")

    def upload(self):
        source = filedialog.askopenfilename(title="选择图片素材", filetypes=[("图片", "*.png *.jpg *.jpeg *.webp *.gif")])
        if not source: return
        try:
            self.selected_path = self.store.save_uploaded(Path(source))
            self._load_selected()
            self._render_assets()
            self.set_status("素材已加入素材库")
        except Exception as exc:
            messagebox.showerror("素材上传失败", str(exc), parent=self.root)

    def _update_quota(self):
        current = self.store.quota()
        self.quota_label.configure(text=f"今日生成 {current['used']}/{current['limit']}")

    def upload_and_generate(self):
        source = filedialog.askopenfilename(title="选择参考图片", filetypes=[("图片", "*.png *.jpg *.jpeg *.webp *.gif")])
        if not source:
            return
        prompt = simpledialog.askstring("生成桌宠素材", "可选：补充形象描述", parent=self.root) or ""
        try:
            reference = self.store.save_uploaded(Path(source))
        except Exception as exc:
            messagebox.showerror("参考图片不可用", str(exc), parent=self.root)
            return
        self.set_status("正在根据参考图生成…")
        def worker():
            try:
                path, _quota = self.generator.generate_from_image(reference, prompt)
                def done():
                    self.selected_path = path
                    self._load_selected()
                    self._render_assets()
                    self._update_quota()
                    self.set_status("新素材已加入素材库")
                self.root.after(0, done)
            except Exception as exc:
                self.root.after(0, lambda: (self._update_quota(), self.set_status(str(exc), True)))
        threading.Thread(target=worker, daemon=True).start()

    def generate(self):
        prompt = simpledialog.askstring("生成桌宠素材", "描述你想要的桌宠形象：", parent=self.root)
        if not prompt: return
        self.set_status("正在生成素材…")
        def worker():
            try:
                path, current = self.generator.generate(prompt)
                def done():
                    self.selected_path = path
                    self._load_selected()
                    self._render_assets()
                    self._update_quota()
                    self.set_status("新素材已加入素材库")
                self.root.after(0, done)
            except Exception as exc:
                self.root.after(0, lambda: (self._update_quota(), self.set_status(str(exc), True)))
        threading.Thread(target=worker, daemon=True).start()


def find_project_root() -> Path:
    candidates = []
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


def main():
    project_root = find_project_root()
    root = tk.Tk()
    DesktopPet(root, project_root)
    root.mainloop()


if __name__ == "__main__":
    main()
