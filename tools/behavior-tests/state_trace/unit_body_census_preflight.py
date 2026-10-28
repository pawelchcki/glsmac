"""Portable preflight successor; NEVER game-executed.

Prepare only: no browser/game/native runtime launch. Refuse existing outputs."""
from pathlib import Path
import hashlib,json,subprocess,sys,shutil

SOURCE='23e54d08b7dbb00f6b42d325c180a8c868b30ee2'
DEFAULT='a69dd4e0a9620f90bd12c8eb8636ca22e24ed47c'
RUNTIME_HASHES={'GLSMAC.js':'32446906441924bb1b1ad7a505682757c590ef8ebdcacd186a0e3fd259d8bea1',
                'GLSMAC.wasm':'cdc6d8f29400451fdca33a60909a24ad62b3c04b5bacbb2123006ca619177a22'}
EXECUTOR_PURE_CHECKS=7

SHARED_HASHES={
    'browser-log-cursor.mjs':'959cd36fec3d798f889a9de6d8889d23808195a2a2cfc37830497c061cc1eed3',
    'browser-native-log-hook.mjs':'4c2db225508623cdbfa9a5e9b03b7e16100dabeb598899b6e4f14978af2b24b1',
    'runtime-fetch-barrier.mjs':'b4344d20102ae78bda621cea22f4cbae23fc9606962403507e91f505b5bb8e74',
    'terraform-browser-inputs.mjs':'80171fb84092c3f9fb1c0cff4aef213f2f0674f06c3496ed0f1c7838fd3ac8e3',
}

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    return h.hexdigest()


def dependency_contents(root):
    """Future profiles pin both executable packages; never follow symlinks.

    The historical capture pinned only package manifests and the browser.
    This regular-file map does not retroactively bind that capture's code.
    """
    result={}
    for name in ('playwright','playwright-core'):
        package=Path(root)/name
        assert package.is_dir() and not package.is_symlink(), 'Actual package directory required'
        files={}
        directories=[package]
        while directories:
            # Unlike rglob, iterdir propagates nested scan failures: an omitted
            # directory must never become a successful partial content binding.
            for path in sorted(directories.pop().iterdir()):
                assert not path.is_symlink(), 'Symlinked package content is unsupported'
                if path.is_file():files[str(path.relative_to(package))]=sha(path)
                else:
                    assert path.is_dir(), 'Unsupported package content type'
                    directories.append(path)
        assert 'package.json' in files and files, 'Missing package content'
        result[name]={relative:files[relative] for relative in sorted(files)}
    return result


def dependency_binding(root):
    contents=dependency_contents(root)
    return {'dependency_contents_sha256':contents,
            'dependency_package_sha256':{name:files['package.json'] for name,files in contents.items()},
            'dependency_content_scope':'Future unexecuted profile: every regular file in playwright and playwright-core; symlinks rejected. Historical capture pinned only manifests/browser, not package contents.'}


def add_arguments(parser):
    for name in ('source-root','web','runtime-provenance','assets','artifacts','dependencies','browser','fontconfig','playwright-browsers-path'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--expected-head',required=True)
    parser.add_argument('--node',type=Path,default=Path(shutil.which('node') or 'node'))


def prepare(args,driver):
    ROOT=args.source_root.resolve();OUT=args.artifacts.resolve();WEB=args.web.resolve()
    PROVENANCE=args.runtime_provenance.resolve();RUNTIME=PROVENANCE.parent
    DRIVER=driver.resolve();ASSETS=args.assets.resolve();DEPS=args.dependencies.resolve();HEAD=args.expected_head
    assert DRIVER==ROOT/'tools/behavior-tests/state_trace/unit_body_census_runner.py','Run the portable boundary from the declared source checkout'
    assert len(HEAD)==40 and all(char in '0123456789abcdef' for char in HEAD),'Full expected source SHA required'
    def git(*argv):return subprocess.check_output(['git',*argv],cwd=ROOT,text=True).strip()
    assert not OUT.exists(),'Fresh artifact directory required; preserve any old result'
    assert OUT!=ROOT and ROOT not in OUT.parents,'Keep capture artifacts outside the immutable source checkout'
    assert git('rev-parse','HEAD')==HEAD
    assert git('rev-parse','HEAD:src')==SOURCE and git('rev-parse','HEAD:GLSMAC_data/default')==DEFAULT
    assert git('status','--porcelain','--untracked-files=no')==''
    assert set(git('ls-files','--others','--exclude-standard').splitlines()) <= {'tools/wasm-tests/node_modules'}
    assert (ROOT/'tools/wasm-tests/node_modules').is_dir()
    assert (ROOT/'tools/wasm-tests/node_modules').resolve()==DEPS
    prov=PROVENANCE; provenance=json.loads(prov.read_text())
    assert sha(prov)=='5c847aaf39f28b2eec66970f9122ecca4ef33e58d7ed6b558701c8de32181619'
    assert provenance['source_tree']==SOURCE and provenance['default_tree']==DEFAULT
    assert provenance['runtime']==RUNTIME_HASHES and provenance['owned_build_workers_reaped'] is True
    assert all(sha(RUNTIME/name)==value and sha(WEB/name)==value for name,value in RUNTIME_HASHES.items())
    assert all(sha(WEB/name)==value for name,value in provenance['web_static_sha256'].items())
    assert sha(WEB/'provenance.json')==sha(prov)
    files=['tools/behavior-tests/state_trace/unit_body_census_runner.py','tools/behavior-tests/state_trace/unit_body_census_preflight.py','tools/behavior-tests/test_unit_body_census_runner.py',
           'tools/wasm-tests/unit-body-census-browser.test.mjs','tools/wasm-tests/unit-body-census-browser-fixture.mjs',
           'tools/wasm-tests/unit-stack-order-browser-fixture.mjs','tools/wasm-tests/unit-workshop-browser-fixture.mjs',
           'tools/behavior-tests/state_trace/unit_body_census.py','tools/behavior-tests/state_trace/unit_body_census_proof.py',
           'tools/behavior-tests/test_unit_body_census.py','tools/behavior-tests/test_unit_body_census_proof.py',
           'tools/behavior-tests/protocol.py','tools/behavior-tests/state_trace/terrain_observation.py',
           'tools/behavior-tests/state_trace/schema.py','tools/behavior-tests/fast.py','tools/serve-wasm.py','tools/wasm_assets.py',
           'GLSMAC_data/tests/_state_trace_observer.gls.js','GLSMAC_data/tests/_terrain_trace_observer.gls.js',
           'GLSMAC_data/tests/_terraform_cooperation_observer.gls.js',
           'src/GLSMAC.cpp','src/game/frontend/Game.h','src/game/frontend/unit/UnitManager.h','src/game/frontend/unit/Unit.h',
           'src/game/frontend/unit/Unit.cpp','src/game/frontend/unit/UnitDef.h','src/scene/actor/Instanced.h']
    shared=['browser-log-cursor.mjs','browser-native-log-hook.mjs','runtime-fetch-barrier.mjs','terraform-browser-inputs.mjs']
    for name in shared:
        relative='tools/wasm-tests/'+name;files.append(relative)
        assert sha(ROOT/relative)==SHARED_HASHES[name]
    node=args.node.resolve();browser=args.browser.resolve()
    fixture_script="import{createHash}from'node:crypto';import{bodyCensusMain,bodyCensusWorld}from'./tools/wasm-tests/unit-body-census-browser-fixture.mjs';const h=v=>createHash('sha256').update(v).digest('hex');console.log(JSON.stringify({main:h(bodyCensusMain),world:h(bodyCensusWorld)}));"
    fixture=json.loads(subprocess.check_output([str(node),'--input-type=module','-e',fixture_script],cwd=ROOT,text=True))
    assert fixture['world']=='614964b356e649998aea9cd72cbef780f3aa087cc220117c585976d59e4df27d'
    sys.path.insert(0,str(ROOT/'tools'));from wasm_assets import build_manifest,manifest_bytes
    manifest=build_manifest(ASSETS);assert manifest['id']=='12743b42e275842a7ae3862572ec769c6d86f647394f0edb1ff9db6d104888e3'
    pre={'version':1,'status':'preflight only; zero candidate engines/browser launches',
         'host':str(ROOT),'head':HEAD,'native_tree':SOURCE,'default_tree':DEFAULT,
         'source_files_sha256':{name:sha(ROOT/name) for name in files},
         'runtime':RUNTIME_HASHES,'runtime_provenance':str(prov),'runtime_provenance_sha256':sha(prov),
         'web_shell':str(WEB),'web_files_sha256':{str(path.relative_to(WEB)):sha(path) for path in sorted(WEB.rglob('*')) if path.is_file()},
         'assets':str(ASSETS),'asset_manifest_id':manifest['id'],'asset_manifest_sha256':hashlib.sha256(manifest_bytes(manifest)).hexdigest(),
         'dependency_symlink':str(DEPS),**dependency_binding(DEPS),
         'node':str(node),'node_sha256':sha(node),'node_version':subprocess.check_output([str(node),'--version'],text=True).strip(),
         'browser':str(browser),'browser_sha256':sha(browser),'fontconfig':str(args.fontconfig.resolve()),'fontconfig_sha256':sha(args.fontconfig.resolve()),'playwright_browsers_path':str(args.playwright_browsers_path.resolve()),
         'fixture_sha256':fixture,'driver':str(DRIVER),'driver_sha256':sha(DRIVER),
         'preflight_builder':str(Path(__file__).resolve()),'preflight_builder_sha256':sha(Path(__file__)),
         'executor_pure_tests':str(ROOT/'tools/behavior-tests/test_unit_body_census_runner.py'),'executor_pure_tests_sha256':sha(ROOT/'tools/behavior-tests/test_unit_body_census_runner.py'),'executor_pure_checks':EXECUTOR_PURE_CHECKS,
         'executor_pure_checks_scope':'Declared methods in the pinned executor test module; inventory only, not evidence those checks executed during prepare',
         'source_review':'Portable successor source; NEVER game-executed. Separate final-source review and exclusive run authorization required',
         'node_test_budget_seconds':180,'native_observation_seconds':120,'outer_timeout_seconds':190,'cleanup_seconds':8,
         'command':[str(node),'--test','--test-concurrency=1','tools/wasm-tests/unit-body-census-browser.test.mjs'],
         'declared_input':{'players':7,'bases':7,'units':9,'tiles':128,'stack_tile':[8,8],'census_reads':2,'physical_game_inputs':0,'movement_actions':0},
         'original_passing_cases':0,'candidate_engines_started':0,
         'namespace_scope':'OS Popen child/wait and owned process group plus visible /proc observed descendants only; not exhaustive host inventory'}
    OUT.mkdir();(OUT/'asset-manifest.json').write_bytes(manifest_bytes(manifest))
    (OUT/'preflight.json').write_text(json.dumps(pre,indent=2)+'\n')
    print(json.dumps({'head':HEAD,'preflight_sha256':sha(OUT/'preflight.json'),'driver_sha256':pre['driver_sha256'],
                      'native_tree':SOURCE,'fixture_sha256':fixture,'candidate_engines_started':0},indent=2))


