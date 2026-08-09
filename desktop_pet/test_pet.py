import tempfile
import unittest
import base64
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from desktop_pet.pet import ImageGenerator, PetStore, default_pet_image, neutral_status


class PetStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory(prefix="work-hard-pet-test-")
        self.store = PetStore(Path(self.temp_dir.name))

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_failed_generation_releases_daily_quota(self):
        reservation = self.store.reserve_generation()
        self.assertEqual(self.store.quota()["used"], 1)
        self.store.release_generation(reservation, False)
        self.assertEqual(self.store.quota()["used"], 0)

    def test_daily_limit_is_three(self):
        reservations = [self.store.reserve_generation() for _ in range(3)]
        self.assertEqual(self.store.quota()["remaining"], 0)
        with self.assertRaises(RuntimeError):
            self.store.reserve_generation()
        for reservation in reservations:
            self.store.release_generation(reservation, True)

    def test_default_pet_and_neutral_status(self):
        self.assertEqual(default_pet_image().size, (240, 280))
        self.assertEqual(neutral_status("start", "启动抖音"), "开始工作")

    def test_reference_image_generation_uses_edits_endpoint(self):
        received = {}
        image_buffer = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
        image_buffer.close()
        default_pet_image().save(image_buffer.name, "PNG")
        image_data = Path(image_buffer.name).read_bytes()

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                received["path"] = self.path
                received["content_type"] = self.headers.get("Content-Type", "")
                length = int(self.headers.get("Content-Length", "0"))
                received["body"] = self.rfile.read(length)
                payload = {"data": [{"b64_json": base64.b64encode(image_data).decode("ascii")}]}
                encoded = json.dumps(payload).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def log_message(self, *_args):
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        root = Path(self.temp_dir.name)
        reference = root / "reference.png"
        reference.write_bytes(image_data)
        generator = ImageGenerator(self.store)
        generator.key = "test-key"
        generator.base_url = f"http://127.0.0.1:{server.server_port}/v1"
        try:
            result, quota = generator.generate_from_image(reference, "blue companion")
            self.assertTrue(result.exists())
            self.assertEqual(quota["used"], 1)
            self.assertEqual(received["path"], "/v1/images/edits")
            self.assertIn("multipart/form-data", received["content_type"])
            self.assertIn(b"blue companion", received["body"])
        finally:
            server.shutdown()
            server.server_close()
            Path(image_buffer.name).unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
