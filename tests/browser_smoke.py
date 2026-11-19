"""Exercise the built starter at a project subpath in Chromium."""
from functools import partial
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    screenshots = ROOT / "browser-checks"
    screenshots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        shutil.copytree(ROOT / "dist", Path(temporary) / "example-tool")
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=temporary))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH"))
                page = browser.new_page(viewport={"width": 1280, "height": 1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto(f"http://127.0.0.1:{server.server_port}/example-tool/")
                stamp="2026-10-10T09:00:"
                lte="deviceTime,eci,rsrp,servingCell,latitude,deviceSerialNumber\n"+stamp+"00Z,12345678,-95,true,10.123,privateDevice\n"+stamp+"30Z,12345679,-101,true,10.123,privateDevice"
                phone="deviceTime,simState,networkRegistrationInfo\n"+stamp+'21Z,READY,"[{""domain"":""PS"",""reject_cause"":8}]"'
                nr="deviceTime,nci,ssRsrp,csiRsrp,connectionStatus\n"+stamp+"01Z,87654321,-98,-100,SECONDARY_SERVING"
                files=[{"name":n+".csv","mimeType":"text/csv","buffer":v.encode()} for n,v in [("lte",lte),("nr",nr),("phone",phone)]]
                for input_id in ["#walk0","#walk1"]:
                    page.locator(input_id).set_input_files(files)
                page.locator("#add").wait_for()
                page.fill("#name","Private landmark"); page.fill("#aTime","20"); page.fill("#bTime","22")
                page.click("#add")
                assert "Private landmark" in page.locator("#axisHelp").inner_text()
                assert "reject cause 8" in page.locator("#near").inner_text()
                assert "serving cell changed" in page.locator("#records").inner_text()
                with page.expect_download() as download:
                    page.click("#export")
                out=download.value.path().read_text()
                for private in ["Private landmark","privateDevice","10.123","12345678","87654321",stamp]:
                    assert private not in out
                assert json.loads(out)["walks"][0][0]["seconds"] == -20
                page.screenshot(path=str(screenshots / "desktop.png"), full_page=True)
                page.set_viewport_size({"width": 390, "height": 844})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
                page.screenshot(path=str(screenshots / "mobile.png"), full_page=True)
                assert not errors, errors
                browser.close()
            print("Browser checks passed for imports, alignment, redaction and mobile layout")
        finally:
            server.shutdown()


if __name__ == "__main__":
    main()
