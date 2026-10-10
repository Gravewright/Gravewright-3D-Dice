"""Exercise real Three.js materials and shadows in Chromium without a host DB."""
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            errors, warnings = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('console', lambda message: warnings.append(message.text) if message.type == 'warning' else None)
            page.goto(f'http://127.0.0.1:{server.server_port}/')
            result = page.evaluate("""async () => {
                const imports = document.createElement('script'); imports.type = 'importmap';
                imports.textContent = JSON.stringify({imports: {three: '/node_modules/three/build/three.module.js'}});
                document.head.append(imports);
                const {DiceRenderer} = await import('/src/renderer.js');
                const host = document.createElement('div');
                host.style.cssText = 'width:800px;height:600px'; document.body.append(host);
                const renderer = new DiceRenderer(host);
                const dice = [{sides: 6, value: 3}, {sides: 20, value: 17, discarded: false},
                    {sides: 4, value: 2, discarded: true}];
                renderer.set(dice, [0, 0, 0], {diceColor: '#224488', textColor: '#ffffff', font: 'atkinsonhyperlegible'});
                const materials = renderer.meshes.map(mesh => mesh.material.map(m => ({transparent: m.transparent, opacity: m.opacity})));
                const shadowType = renderer.renderer.shadowMap.type;
                const frame = new Float32Array([-3, 2, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 1, 3, 2, 0, 0, 0, 0, 1]);
                for (let i = 0; i < 5; i++) renderer.frame(frame);
                const context = renderer.renderer.getContext();
                const glError = context.getError();
                renderer.dispose();
                return {materials, shadowType, glError, canvases: host.querySelectorAll('canvas').length};
            }""")
            assert result['shadowType'] == 1, result
            assert all(not material['transparent'] and material['opacity'] == 1
                       for die in result['materials'][:2] for material in die)
            assert all(material['transparent'] and material['opacity'] == 0.48 for material in result['materials'][2])
            assert result['glError'] == 0 and result['canvases'] == 0, result
            assert not errors, errors
            assert not [warning for warning in warnings if 'THREE.' in warning], warnings
            browser.close()
            print('PASS: materials, discarded dice, supported shadows and WebGL rendering without Three.js warnings.')
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


if __name__ == '__main__':
    main()
