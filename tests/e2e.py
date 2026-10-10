"""Signed package against isolated native Gravewright GM/player browsers."""
import os,sys
from pathlib import Path
ROOT=Path(os.environ.get('GRAVEWRIGHT_ROOT',Path(__file__).resolve().parents[2]/'gravewright'))
sys.path.insert(0,str(ROOT/'tests/e2e'))
from migration_closure import main
from playwright.sync_api import expect
ARCHIVE=Path(__file__).resolve().parents[1]/'dist/gravewright-3d-dice-0.1.1.zip'
SEED=r'''
import base64,hashlib
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from gravewright.modules.packages import ModulePackages,canonical
key=Ed25519PrivateKey.generate()
keys={'test':base64.b64encode(key.public_key().public_bytes_raw()).decode()}
Path(os.environ['GRAVEWRIGHT_MARKETPLACE_KEYS_FILE']).write_text(json.dumps(keys))
raw=Path(os.environ['DICE_TEST_ARCHIVE']).read_bytes()
record={'id':'gravewright-3d-dice','version':'0.1.1','sdk':'>=1.0.0 <2.0.0','download':'https://example.test/dice.zip','sha256':hashlib.sha256(raw).hexdigest(),'keyId':'test'}
record['signature']=base64.b64encode(key.sign(canonical(record))).decode()
ModulePackages(Path(settings.MEDIA_ROOT)/'modules',keys).install(record,raw)
'''
def check(gm,player,data,output):
 errors=[]
 for p in [gm,player]:
  p.on('pageerror',lambda e:errors.append(str(e)))
  p.on('console',lambda m:print('CONSOLE',m.text,flush=True) if m.type=='error' else None)
 gm.get_by_role('button',name='Settings',exact=True).click()
 gm.get_by_role('button',name='Extensions',exact=True).click()
 gm.get_by_role('button',name='Activate',exact=True).click()
 button=gm.locator('[data-module-customize="gravewright-3d-dice"]')
 expect(button).to_be_visible(timeout=30000)
 expect(player.locator('.gw3d-layer')).to_have_count(1,timeout=30000)
 assert button.evaluate("e=>e.nextElementSibling.textContent")=='Deactivate'
 button.click();modal=gm.locator('.gw3d-customize');expect(modal).to_be_visible()
 expect(modal.locator('select option')).to_have_count(5)
 gm.wait_for_function("document.querySelector('.gw3d-preview canvas')?.width>1")
 gm.wait_for_timeout(500)
 modal.locator('[name=diceColor]').fill('#224488');modal.locator('[name=textColor]').fill('#ffffff');modal.locator('[name=font]').select_option('ibmplexmono')
 gm.wait_for_timeout(600);gm.screenshot(path=str(output/'3d-dice-customize.png'))
 modal.get_by_role('button',name='Save',exact=True).click();expect(modal).to_have_count(0)
 button.click();expect(gm.locator('[name=diceColor]')).to_have_value('#224488');expect(gm.locator('[name=font]')).to_have_value('ibmplexmono');gm.locator('.gw3d-customize').get_by_role('button',name='Cancel',exact=True).click()
 gm.keyboard.press('Escape')
 # Real server dice event, real worker, real WebGL renderer, both clients.
 result=gm.evaluate("async()=>await gravewright.dice.roll('1d4+1d6+1d8+1d10+1d12+1d20+1d100',{visibility:'public'})")
 for p in [gm,player]:
  p.wait_for_function("document.querySelector('.gw3d-layer')?.dataset.state==='settled'",timeout=30000)
  assert len(p.locator('.gw3d-layer').get_attribute('data-values'))>0
 gm.screenshot(path=str(output/'3d-dice-roll.png'))
 for p in [gm,player]:expect(p.locator('.gw3d-layer')).to_be_hidden(timeout=15000)
 player_values=player.locator('.gw3d-layer').get_attribute('data-values')
 gm.evaluate("async()=>await gravewright.dice.roll('2d6',{visibility:'gm'})")
 gm.wait_for_function("document.querySelector('.gw3d-layer')?.dataset.state==='settled'",timeout=30000)
 expect(player.locator('.gw3d-layer')).to_be_hidden();assert player.locator('.gw3d-layer').get_attribute('data-values')==player_values
 expect(gm.locator('.gw3d-layer')).to_be_hidden(timeout=15000)
 # Reload does not replay chat history; preferences survive a new module lifetime.
 gm.reload();expect(gm.locator('.gw3d-layer')).to_have_count(1,timeout=30000);expect(gm.locator('.gw3d-layer')).to_be_hidden()
 gm.get_by_role('button',name='Settings',exact=True).click();gm.get_by_role('button',name='Extensions',exact=True).click();gm.locator('[data-module-customize]').click()
 expect(gm.locator('[name=font]')).to_have_value('ibmplexmono');gm.keyboard.press('Escape')
 gm.get_by_role('button',name='Deactivate',exact=True).click()
 expect(gm.locator('.gw3d-layer')).to_have_count(0);expect(player.locator('.gw3d-layer')).to_have_count(0,timeout=20000)
 assert not errors,errors
 print('PASS: signed install, activation, customization persistence, physics, two-client public rolls, private audience, reload and disposal.',flush=True)
if __name__=='__main__':main(check,seed_extra=SEED,environment=lambda temp:{'GRAVEWRIGHT_MARKETPLACE_KEYS_FILE':temp+'/keys.json','DICE_TEST_ARCHIVE':str(ARCHIVE)})
