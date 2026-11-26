"""Local-only pilot server. Uploaded PDFs are processed in a bounded worker
through stdin; neither raw files nor extracted records are saved by the server.
"""
from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import secrets
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from credit_report import MAX_BYTES, ReportError, demo_pdf, extract_report, summarize, validate_loans

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
TOKEN = secrets.token_urlsafe(32)
WORKERS = threading.BoundedSemaphore(2)
PAGES = {
    "/": ("Загрузка отчёта", "Загрузите кредитный отчёт", "Начните с PDF ПКБ или ГКБ, затем проверьте распознанные сведения."),
    "/overview": ("Кредитный обзор", "Кредитный обзор", "Обязательства, платежи и сведения текущего разбора."),
    "/loans": ("Обязательства", "Обязательства", "Договоры, роли и известные суммы с доступными ссылками на PDF."),
    "/simulator": ("Симулятор", "Сценарий закрытия", "Сравните известные платежи при полном закрытии выбранных договоров."),
    "/review": ("Проверка данных", "Проверка данных", "Сверьте распознанные сведения с PDF и сохраните исправления."),
    "/method": ("Как это считается", "Как это считается", "Правила расчёта, допущения и границы этого пилота."),
}


class Handler(BaseHTTPRequestHandler):
    server_version = "CreditPilot/0.1"

    def log_message(self, fmt, *args):
        # Filenames and credit data must never enter request logs.
        pass

    def send(self, status, body, content_type="application/json; charset=utf-8", extra=None):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def host_allowed(self):
        hostname = self.headers.get("Host", "").split(":")[0].lower()
        return hostname in {"127.0.0.1", "localhost"}

    def do_GET(self):
        if not self.host_allowed():
            return self.send(403, {"error": "Доступен только локальный адрес."})
        path = urlsplit(self.path).path
        canonical = "/" if path in {"/index.html", "/upload"} else path.rstrip("/")
        if path not in PAGES and canonical in PAGES:
            return self.send(308, b"", "text/plain", {"Location": canonical})
        if path == "/api/config":
            return self.send(200, {"token": TOKEN, "max_bytes": MAX_BYTES, "mode": "local"})
        if path == "/api/health":
            return self.send(200, {"status": "ok", "version": "0.1.0", "external_ai": False, "stores_uploads": False})
        if path == "/demo.pdf":
            try:
                return self.send(200, demo_pdf(), "application/pdf", {"Content-Disposition": 'attachment; filename="pkb-demo.pdf"'})
            except Exception:
                return self.send(500, {"error": "Не удалось создать демонстрационный PDF. Проверьте установку reportlab."})
        files = {"/": "index.html", "/index.html": "index.html", "/styles.css": "styles.css", "/scenario.js": "scenario.js", "/app.js": "app.js", "/favicon.svg": "favicon.svg", "/favicon.png": "favicon.png", "/forte-logo.png": "forte-logo.png"}
        name = "index.html" if path in PAGES else files.get(path)
        if not name:
            if not path.startswith("/api/"):
                return self.send(404, (WEB / "404.html").read_bytes(), "text/html; charset=utf-8")
            return self.send(404, {"error": "Страница не найдена."})
        file = WEB / name
        try:
            data = file.read_bytes()
        except OSError:
            return self.send(404, {"error": "Файл интерфейса не найден."})
        if path in PAGES:
            title, heading, subtitle = PAGES[path]
            data = data.decode("utf-8").replace("Кредитный обзор · Forte Pilot", title + " · Forte Pilot")
            data = data.replace("Ваша кредитная картина</h1>", heading + "</h1>")
            data = data.replace("Разберите обязательства и посмотрите, из чего складываются платежи.</p>", subtitle + "</p>")
            data = data.encode("utf-8")
        content_type = {".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png"}[file.suffix]
        return self.send(200, data, content_type + ("; charset=utf-8" if file.suffix not in {".svg", ".png"} else ""))

    def do_POST(self):
        if not self.host_allowed():
            return self.send(403, {"error": "Доступен только локальный адрес."})
        origin = self.headers.get("Origin")
        if origin and origin not in {f"http://127.0.0.1:{self.server.server_port}", f"http://localhost:{self.server.server_port}"}:
            return self.send(403, {"error": "Запрос с другого сайта запрещён."})
        if not secrets.compare_digest(self.headers.get("X-Pilot-Token", ""), TOKEN):
            return self.send(403, {"error": "Обновите страницу и повторите запрос."})
        path = urlsplit(self.path).path
        if path not in {"/api/analyze", "/api/recalculate"}:
            return self.send(404, {"error": "Метод не найден."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send(400, {"error": "Некорректный размер запроса."})
        limit = MAX_BYTES if path == "/api/analyze" else 1024 * 1024
        if not 0 < length <= limit:
            return self.send(413, {"error": "Слишком большой или пустой файл. Максимум — 20 МБ."})
        if not WORKERS.acquire(blocking=False):
            return self.send(429, {"error": "Уже обрабатываются два запроса. Повторите через несколько секунд."})
        try:
            self.connection.settimeout(30)
            data = self.rfile.read(length)
            if len(data) != length:
                return self.send(400, {"error": "Файл загружен не полностью. Повторите загрузку."})
            if path == "/api/recalculate":
                try:
                    obj = json.loads(data, parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Некорректное число.")))
                    loans = validate_loans(obj.get("loans"))
                    return self.send(200, {"loans": loans, "summary": summarize(loans)})
                except (ValueError, TypeError, AttributeError) as exc:
                    return self.send(400, {"error": str(exc) or "Проверьте введённые сведения."})
            if self.headers.get("Content-Type", "").split(";")[0] not in {"application/pdf", "application/octet-stream"}:
                return self.send(415, {"error": "Поддерживаются только PDF-файлы."})
            start = time.monotonic()
            try:
                process = subprocess.run([sys.executable, str(ROOT / "app.py"), "--parse-worker"], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=35, cwd=ROOT)
            except subprocess.TimeoutExpired:
                return self.send(422, {"error": "Обработка заняла больше 35 секунд. Попробуйте исходный текстовый PDF без сканированных страниц."})
            try:
                result = json.loads(process.stdout)
            except (ValueError, UnicodeDecodeError):
                return self.send(422, {"error": "Не удалось разобрать документ. Проверьте PDF или попробуйте полный отчёт ПКБ."})
            if "error" in result:
                return self.send(422, result)
            filename = unquote(self.headers.get("X-Filename", "report.pdf"))
            result["report"]["filename"] = Path(filename.replace("\\", "/")).name[:180]
            result["processing_seconds"] = round(time.monotonic() - start, 2)
            return self.send(200, result)
        except (OSError, TimeoutError):
            return self.send(400, {"error": "Соединение прервалось. Попробуйте загрузить файл ещё раз."})
        finally:
            WORKERS.release()


def main():
    parser = argparse.ArgumentParser(description="Локальный разбор кредитных отчётов")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--parse-worker", action="store_true")
    args = parser.parse_args()
    if args.parse_worker:
        logging.getLogger("pypdf").setLevel(logging.CRITICAL)
        try:
            result = extract_report(sys.stdin.buffer.read(MAX_BYTES + 1))
        except ReportError as exc:
            result = {"error": str(exc)}
        except Exception:
            result = {"error": "Не удалось прочитать сведения в PDF."}
        sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False, allow_nan=False).encode("utf-8"))
        return
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    print(f"Credit report pilot: http://127.0.0.1:{args.port}", flush=True)
    print("Local processing. Uploaded reports are not saved. Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
