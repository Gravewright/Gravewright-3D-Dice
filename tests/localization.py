"""Exercise the built dice package and real Translator in an isolated host.

Run with the host virtualenv Python, --host-root, --package and --translator.
All fixture state, child caches and screenshots stay under host/data/runner.
No operator database, .env, installed module or language preference is reused.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import re
import secrets
import socket
import subprocess
import sys
import sysconfig
import time
import traceback
from urllib.request import urlopen
from zipfile import ZipFile

EDGE = Path('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
FONTS = ['Atkinson Hyperlegible', 'Noto Sans', 'Noto Serif', 'IBM Plex Mono', 'Montserrat']
PREVIEWS = {'en': 'Dice preview', 'pt-BR': 'Prévia dos dados', 'es': 'Vista previa de los dados'}
LABELS = {
    'en': ['Customize dice', 'Dice color', 'Text color', 'Font', 'Cancel', 'Save', 'Source', 'License'],
    'pt-BR': ['Personalizar dados', 'Cor do dado', 'Cor do texto', 'Fonte', 'Cancelar', 'Salvar', 'Código-fonte', 'Licença'],
    'es': ['Personalizar dados', 'Color del dado', 'Color del texto', 'Fuente', 'Cancelar', 'Guardar', 'Código fuente', 'Licencia'],
}
NOTICES = {
    'en': ['3D preview unavailable.', 'Changed in another tab. Review your choices and save again.', 'Could not save. Try again.'],
    'pt-BR': ['Prévia 3D indisponível.', 'Alterado em outra aba. Revise suas escolhas e salve novamente.', 'Não foi possível salvar. Tente novamente.'],
    'es': ['Vista previa 3D no disponible.', 'Cambió en otra pestaña. Revisa tus opciones y guarda de nuevo.', 'No se pudo guardar. Inténtalo de nuevo.'],
}


def environment(root, fixture, port):
    sys.path[:0] = [str(root), str(root / 'tests/e2e')]
    from map_builder import fixture_environment
    fixture_environment(fixture, port)
    for relative in ('extensions/api', 'extensions/django'):
        (fixture / relative).mkdir(parents=True, exist_ok=True)
    os.environ.update({
        'PYTHON_DOTENV_DISABLED': '1', 'PYTHONDONTWRITEBYTECODE': '1',
        'PYTHONPYCACHEPREFIX': str(fixture / 'tools/pycache'),
        'GRAVEWRIGHT_API_MODULES_ROOT': str(fixture / 'extensions/api'),
        'GRAVEWRIGHT_DJANGO_MODULES_ROOT': str(fixture / 'extensions/django'),
        'PLAYWRIGHT_BROWSERS_PATH': str(fixture / 'tools/browsers'),
        'PYTHONPATH': os.pathsep.join((sysconfig.get_path('purelib'), str(root))),
    })


def serve(fixture, port, package, translator):
    import django
    django.setup()
    from django.conf import settings
    from django.core.files.base import ContentFile
    from django.core.management import call_command
    from django.test import Client
    from django.utils import timezone
    from gravewright.accounts.models import User
    from gravewright.campaigns.models import Campaign, Membership, Onboarding
    from gravewright.maps.models import Broadcast, Scene, SceneState, Tile
    from gravewright.maps.services import DEFAULTS
    from gravewright.modules.packages import host
    from PIL import Image

    assert Path(settings.DATABASES['default']['NAME']).resolve() == fixture / 'review.sqlite3'
    assert Path(settings.MEDIA_ROOT).resolve() == fixture / 'media'
    settings.DATABASES['default']['TEST']['NAME'] = str(fixture / 'test.sqlite3')
    settings.PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
    call_command('migrate', verbosity=0, interactive=False)
    user = User.objects.create_user('gm@dice-localization.test', secrets.token_urlsafe(24), name='Synthetic GM', role='owner')
    campaign = Campaign.objects.create(owner=user, name='Synthetic dice localization', system='')
    member = Membership.objects.create(campaign=campaign, user=user, role='gm')
    Onboarding.objects.create(membership=member, dismissed=True, player_shown_at=timezone.now())
    client = Client(); client.force_login(user)
    packages = {}
    for archive_path in (translator, package):
        raw = archive_path.read_bytes()
        with ZipFile(BytesIO(raw)) as archive:
            manifest = json.loads(archive.read('manifest.json'))
        host().install_local(raw, expected_type='module')
        packages[manifest['id']] = {'id': manifest['id'], 'version': manifest['version'], 'sha256': hashlib.sha256(raw).hexdigest()}
        if manifest.get('locales'):
            result = client.post('/api/module-packages/activation', {
                'id': manifest['id'], 'version': manifest['version'], 'enabled': True,
            }, content_type='application/json')
            assert result.status_code == 200, result.content
    result = client.get(f'/api/tables/{campaign.pk}/modules')
    assert result.status_code == 200, result.content
    result = client.post(f'/api/tables/{campaign.pk}/modules', {
        'modules': {'gravewright-3d-dice': packages['gravewright-3d-dice']['version']},
        'replacements': {}, 'expectedRevision': result.json()['moduleSetRevision'],
    }, content_type='application/json')
    assert result.status_code == 200, result.content
    scene = Scene.objects.create(campaign=campaign, name='Synthetic authored scene', width=512, height=512,
        settings={**deepcopy(DEFAULTS), 'initialView': {'x': 0, 'y': 0, 'scale': 1}})
    image = BytesIO(); Image.new('RGB', (512, 512), '#3d5148').save(image, 'WEBP')
    tile = Tile(scene=scene, lod=0, x=0, y=0)
    tile.file.save('synthetic-scene.webp', ContentFile(image.getvalue()), save=True)
    SceneState.objects.create(scene=scene, lighting={'mode': 'none', 'darkness': .4})
    Broadcast.objects.create(campaign=campaign, scene=scene)
    seed = {'campaign': str(campaign.pk), 'packages': packages,
        'cookie': {'name': settings.SESSION_COOKIE_NAME, 'value': client.cookies[settings.SESSION_COOKIE_NAME].value}}
    (fixture / 'seed.json').write_text(json.dumps(seed, indent=2), encoding='utf-8')
    call_command('runserver', f'127.0.0.1:{port}', use_reloader=False, verbosity=0)


def check(base, seed, fixture, executable):
    from playwright.sync_api import expect, sync_playwright
    from map_builder import change_locale, MEASURE
    report = {'passed': False, 'cases': [], 'pageErrors': [], 'badResponses': [], 'expectedResponses': [], 'failedRequests': [],
        'dialogs': [], 'packages': seed['packages']}

    def record(case, **detail):
        row = {'case': case, **detail}; report['cases'].append(row)
        print(json.dumps(row, ensure_ascii=True), flush=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=str(executable),
            args=['--disk-cache-dir=' + str(fixture / 'tools/browser-cache')])
        context = browser.new_context(base_url=base, viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce')
        context.add_cookies([{**seed['cookie'], 'url': base}])
        page = context.new_page()
        page.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
        def response_event(response):
            if response.status < 400 or not response.url.startswith(base): return
            expected = response.url.endswith('/modules/gravewright-3d-dice/storage') and response.status in (409, 503)
            report['expectedResponses' if expected else 'badResponses'].append({'url': response.url, 'status': response.status})

        page.on('response', response_event)
        page.on('requestfailed', lambda request: report['failedRequests'].append({'url': request.url, 'failure': request.failure})
            if request.url.startswith(base) and 'ERR_ABORTED' not in (request.failure or '') else None)
        page.on('dialog', lambda dialog: (report['dialogs'].append(dialog.message), dialog.dismiss()))
        campaign = seed['campaign']; game = f'{base}/game/{campaign}'
        package_row = page.locator('[data-package-id="gravewright-3d-dice"]')
        opener = page.locator('[data-module-customize="gravewright-3d-dice"]')
        modal = page.locator('.gw3d-customize')

        def ready():
            expect(page.locator('.gw3d-layer')).to_have_count(1, timeout=30000)

        def open_customization():
            if not opener.is_visible():
                page.locator('.game-dock [aria-keyshortcuts="S"]:not([data-dock-tool])').click()
                page.locator('.house-menu__rail > button').nth(1).click()
            expect(opener).to_be_visible(timeout=30000); opener.click()
            expect(modal).to_be_visible(); expect(modal).to_have_attribute('role', 'dialog')
            expect(modal).to_have_attribute('aria-modal', 'true')
            expect(page.locator('dialog.gw3d-customize')).to_have_count(0)

        def translated(locale):
            title, dice, text, font, cancel, save, source, license_ = LABELS[locale]
            expect(modal.get_by_role('heading', name=title, exact=True)).to_be_visible()
            expect(modal).to_have_accessible_name(title)
            expect(modal.get_by_label(dice, exact=True)).to_have_attribute('name', 'diceColor')
            expect(modal.get_by_label(text, exact=True)).to_have_attribute('name', 'textColor')
            expect(modal.get_by_role('combobox', name=font, exact=True)).to_have_attribute('name', 'font')
            expect(modal.get_by_role('img', name=PREVIEWS[locale], exact=True)).to_be_visible()
            expect(modal.get_by_role('button', name=cancel, exact=True)).to_be_visible()
            expect(modal.get_by_role('button', name=save, exact=True)).to_be_visible()
            expect(modal.get_by_role('link', name=source, exact=True)).to_have_attribute('href', 'https://github.com/Gravewright/Gravewright-3D-Dice')
            expect(modal.get_by_role('link', name=license_, exact=True)).to_have_attribute('href', re.compile(r'/LICENSE\.md$'))
            assert modal.locator('select option').all_text_contents() == FONTS

        try:
            page.goto(game); ready()
            for locale in LABELS:
                change_locale(page, locale, campaign); page.goto(game); ready()
                expect(page.locator('html')).to_have_attribute('lang', locale)
                language = page.evaluate('JSON.parse(document.getElementById("gravewright-language").textContent)')
                assert language['id'] == locale
                (fixture / f'effective-catalog-{locale}.json').write_text(json.dumps(language, ensure_ascii=False), encoding='utf-8')
                open_customization(); translated(locale)
                page.wait_for_function('document.querySelector(".gw3d-preview canvas")?.width > 1')
                expect(modal.locator('[name=diceColor]')).to_be_focused()
                modal.locator('a').last.focus(); page.keyboard.press('Tab')
                expect(modal.locator('[name=diceColor]')).to_be_focused()
                page.keyboard.press('Shift+Tab'); expect(modal.locator('a').last).to_be_focused()
                for width in (1440, 768, 320):
                    page.set_viewport_size({'width': width, 'height': 1000 if width == 1440 else 844})
                    page.evaluate('async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)}')
                    metrics = modal.evaluate(MEASURE)
                    assert not metrics['tiny'] and not metrics['overflow'], (locale, width, metrics)
                    geometry = modal.evaluate('el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}}')
                    assert geometry['left'] >= -1 and geometry['right'] <= geometry['width'] + 1, geometry
                    assert geometry['top'] >= -1 and geometry['bottom'] <= geometry['height'] + 1, geometry
                    assert geometry['scrollWidth'] <= geometry['clientWidth'] + 1, geometry
                    page.screenshot(path=str(fixture / f'customize-{locale}-{width}.png'))
                    record('translated-layout-fonts-focus', locale=locale, **geometry)
                page.set_viewport_size({'width': 1440, 'height': 1000})
                modal.locator('[name=diceColor]').fill('#224488')
                modal.locator('[name=textColor]').fill('#ffffff')
                modal.locator('[name=font]').select_option('ibmplexmono')
                modal.get_by_role('button', name=LABELS[locale][5], exact=True).click()
                expect(modal).to_have_count(0); expect(opener).to_be_focused()
                open_customization(); expect(modal.locator('[name=diceColor]')).to_have_value('#224488')
                expect(modal.locator('[name=font]')).to_have_value('ibmplexmono')
                modal.locator('[name=diceColor]').fill('#778899')
                modal.get_by_role('button', name=LABELS[locale][4], exact=True).click()
                expect(modal).to_have_count(0); expect(opener).to_be_focused()
                open_customization(); expect(modal.locator('[name=diceColor]')).to_have_value('#224488')
                page.keyboard.press('Escape'); expect(modal).to_have_count(0)
                expect(opener).to_be_focused(); expect(package_row).to_be_visible()
                page.reload(); ready(); open_customization()
                expect(modal.locator('[name=diceColor]')).to_have_value('#224488')
                expect(modal.locator('[name=font]')).to_have_value('ibmplexmono')
                page.keyboard.press('Escape'); expect(modal).to_have_count(0)
                record('save-cancel-escape-and-reload', locale=locale)
            open_customization()
            # The original modal retains its loaded revision. A second real
            # client saves first, so the first save must hit the server's 409
            # path rather than silently overwriting another tab's preferences.
            second = context.new_page()
            second.on('pageerror', lambda error: report['pageErrors'].append(str(error)))
            second.goto(game)
            expect(second.locator('.gw3d-layer')).to_have_count(1, timeout=30000)
            second.locator('.game-dock [aria-keyshortcuts="S"]:not([data-dock-tool])').click()
            second.locator('.house-menu__rail > button').nth(1).click()
            second.locator('[data-module-customize="gravewright-3d-dice"]').click()
            second_modal = second.locator('.gw3d-customize')
            second_modal.locator('[name=diceColor]').fill('#335577')
            second_modal.get_by_role('button', name=LABELS['es'][5], exact=True).click()
            expect(second_modal).to_have_count(0)
            modal.get_by_role('button', name=LABELS['es'][5], exact=True).click()
            expect(modal.locator('.gw3d-notice')).to_have_text(NOTICES['es'][1])
            expect(modal.locator('[name=diceColor]')).to_have_value('#224488')
            expect(modal.get_by_role('button', name=LABELS['es'][5], exact=True)).to_be_enabled()
            second.close()
            record('real-two-tab-revision-conflict', locale='es')
            # Locale values come from actual authenticated host bootstraps. Only
            # native locale-event delivery is triggered here, never a translator
            # replacement or translated DOM injection.
            modal.evaluate('el=>{window.diceLocaleIdentity={modal:el,input:el.querySelector("[name=diceColor]")};el.querySelector("[name=diceColor]").focus()}')
            for locale in ('en', 'pt-BR', 'es'):
                change_locale(page, locale, campaign)
                language = page.evaluate('''async url=>{const html=await (await fetch(url)).text();
                    const doc=new DOMParser().parseFromString(html,"text/html");
                    const catalog=JSON.parse(doc.getElementById("gravewright-language").textContent);
                    window.gravewrightLocale={id:catalog.id,messages:catalog.messages};
                    window.dispatchEvent(new CustomEvent("gravewright:locale",{detail:window.gravewrightLocale}));
                    return {id:catalog.id,keys:Object.keys(catalog.messages).length};}''', game)
                assert language['id'] == locale
                translated(locale)
                expect(modal.locator('.gw3d-notice')).to_have_text(NOTICES[locale][1])
                assert modal.evaluate('el=>window.diceLocaleIdentity.modal===el&&window.diceLocaleIdentity.input===el.querySelector("[name=diceColor]")&&document.activeElement===window.diceLocaleIdentity.input')
                record('native-locale-event-preserves-modal-focus', locale=locale, catalogKeys=language['keys'])
            modal.get_by_role('button', name=LABELS['es'][5], exact=True).click()
            expect(modal).to_have_count(0)
            open_customization()
            # A transport/server failure must remain visible and translated,
            # preserving the editable draft and enabled retry button.
            storage_url = f'{base}/api/tables/{campaign}/modules/gravewright-3d-dice/storage'
            def fail_save(route):
                payload = route.request.post_data_json
                if payload.get('action') == 'set':
                    route.fulfill(status=503, content_type='application/json', body='{"error":"unavailable"}')
                else:
                    route.continue_()
            page.route(storage_url, fail_save)
            modal.get_by_role('button', name=LABELS['es'][5], exact=True).click()
            expect(modal.locator('.gw3d-notice')).to_have_text(NOTICES['es'][2])
            expect(modal.get_by_role('button', name=LABELS['es'][5], exact=True)).to_be_enabled()
            expect(modal.locator('[name=diceColor]')).to_have_value('#224488')
            page.unroute(storage_url, fail_save)
            record('translated-server-save-error-draft-preserved', locale='es')
            page.keyboard.press('Escape'); expect(modal).to_have_count(0)
            # A real authoritative roll must preserve the user's own English
            # label even under Spanish; only interface strings are translated.
            page.keyboard.press('Escape')
            page.evaluate("async()=>await gravewright.dice.roll('1d6',{visibility:'public',label:'Dice color'})")
            expect(page.locator('.gw3d-caption')).to_contain_text('Dice color', timeout=30000)
            page.wait_for_function('document.querySelector(".gw3d-layer")?.dataset.state==="settled"', timeout=30000)
            record('authored-roll-label-preserved', locale='es')
            expect(page.locator('.gw3d-layer')).to_be_hidden(timeout=15000)
            open_customization()
            page.evaluate('''async campaign=>{const csrf=await(await fetch('/__gravewright/csrf')).json();
                const path='/api/tables/'+campaign+'/modules';const state=await(await fetch(path)).json();
                const modules=Object.fromEntries(state.modules.filter(m=>m.id!=='gravewright-3d-dice').map(m=>[m.id,m.version]));
                const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',[csrf.header]:csrf.token},
                body:JSON.stringify({modules,replacements:state.replacements,expectedRevision:state.moduleSetRevision})});
                if(!response.ok)throw Error('deactivation '+response.status);}''', campaign)
            expect(modal).to_have_count(0, timeout=30000)
            expect(page.locator('.gw3d-layer')).to_have_count(0, timeout=30000)
            assert page.evaluate('document.querySelectorAll(".ownership-modal-overlay").length') <= 1
            assert page.evaluate('[...document.fonts].every(font=>!font.family.startsWith("gw3d-"))')
            record('deactivation-closes-modal-disposes-layer-fonts')
            assert not report['pageErrors'], report['pageErrors']
            assert not report['dialogs'], report['dialogs']
            assert not report['badResponses'], report['badResponses']
            assert not report['failedRequests'], report['failedRequests']
            report['passed'] = True
        except Exception as error:
            report['failure'] = {'message': str(error), 'traceback': traceback.format_exc()}
            page.screenshot(path=str(fixture / 'FAIL.png'))
            raise
        finally:
            (fixture / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            browser.close()
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host-root', type=Path, required=True)
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--translator', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--browser-executable', type=Path, default=EDGE)
    parser.add_argument('--serve', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--port', type=int, default=0, help=argparse.SUPPRESS)
    args = parser.parse_args()
    root, fixture = args.host_root.resolve(), args.output.resolve()
    assert (root / 'manage.py').is_file()
    assert fixture.is_relative_to(root / 'data/runner')
    if args.serve:
        environment(root, fixture, args.port)
        serve(fixture, args.port, args.package.resolve(), args.translator.resolve()); return
    if fixture.exists() and any(fixture.iterdir()):
        raise RuntimeError(f'Use a fresh empty fixture directory: {fixture}')
    assert args.package.is_file() and args.translator.is_file() and args.browser_executable.is_file()
    fixture.mkdir(parents=True, exist_ok=True)
    with socket.socket() as connection:
        connection.bind(('127.0.0.1', 0)); port = connection.getsockname()[1]
    environment(root, fixture, port)
    base = f'http://127.0.0.1:{port}'
    executable = sys._base_executable if os.name == 'nt' else sys.executable
    command = [executable, '-B', '-X', 'utf8', str(Path(__file__).resolve()), '--serve',
        '--host-root', str(root), '--package', str(args.package.resolve()), '--translator', str(args.translator.resolve()),
        '--output', str(fixture), '--port', str(port)]
    with (fixture / 'server.log').open('w', encoding='utf-8') as log:
        server = subprocess.Popen(command, cwd=root, env=os.environ.copy(), stdout=log, stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        try:
            for _ in range(300):
                if server.poll() is not None:
                    raise RuntimeError(f'Fixture server exited; inspect {fixture / "server.log"}')
                try:
                    with urlopen(base, timeout=1): break
                except OSError: time.sleep(.1)
            else: raise RuntimeError('Fixture server did not become ready')
            seed = json.loads((fixture / 'seed.json').read_text(encoding='utf-8'))
            result = check(base, seed, fixture, args.browser_executable)
            print(json.dumps({'passed': result['passed'], 'cases': len(result['cases']), 'report': str(fixture / 'report.json')}))
        finally:
            server.terminate()
            try: server.wait(timeout=10)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
            (fixture / 'server-exit.json').write_text(json.dumps({'pid': server.pid, 'exitCode': server.returncode}), encoding='utf-8')


if __name__ == '__main__':
    main()
