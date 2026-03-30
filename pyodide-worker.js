// pyodide-worker.js — Pyodide 在 Web Worker 中运行
// 与主线程通过 postMessage 通信
// stdin 通过 Service Worker 的 fetch 拦截桥接（兼容 GitHub Pages）

importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js');

let pyodide = null;
let stdinBuffer = null; // SharedArrayBuffer（可用时）

// ── 发消息给主线程 ──
function send(type, payload) {
  self.postMessage({ type, ...payload });
}

// ── 初始化 ──
async function initPyodide() {
  send('status', { kind: 'loading', text: '加载中' });
  send('loader', { msg: '正在建立与 Python 的连接...', pct: 5 });

  pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/' });

  send('loader', { msg: '加载数值计算库 (numpy, scipy)...', pct: 45 });
  await pyodide.loadPackage(['numpy', 'scipy', 'micropip']);

  send('loader', { msg: '加载数据分析库 (pandas, statsmodels)...', pct: 55 });
  await pyodide.loadPackage(['pandas', 'statsmodels']);

  send('loader', { msg: '加载可视化库 (matplotlib, Pillow)...', pct: 65 });
  await pyodide.loadPackage(['matplotlib', 'Pillow']);

  send('loader', { msg: '加载机器学习库 (sklearn, sympy)...', pct: 75 });
  await pyodide.loadPackage(['scikit-learn', 'sympy']);

  send('loader', { msg: '加载网络架构库 (networkx)...', pct: 80 });
  await pyodide.loadPackage(['networkx', 'pyodide-http']);

  send('loader', { msg: '安装高级扩展图表库 (seaborn, plotly)...', pct: 85 });
  try {
    await pyodide.runPythonAsync("import micropip; await micropip.install(['seaborn', 'plotly'])");
  } catch (_) {}

  send('loader', { msg: '正在加载中文字体...', pct: 92 });
  try {
    const fontUrl = 'https://cdn.jsdelivr.net/gh/googlefonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf';
    const fontResp = await fetch(fontUrl);
    if (!fontResp.ok) throw new Error('font fetch ' + fontResp.status);
    const fontBytes = new Uint8Array(await fontResp.arrayBuffer());
    pyodide.FS.writeFile('/tmp/NotoSansSC.otf', fontBytes);
    pyodide.runPython(`
import matplotlib.font_manager as fm, matplotlib as mpl
fe = fm.FontEntry(fname='/tmp/NotoSansSC.otf', name='Noto Sans SC')
fm.fontManager.ttflist.insert(0, fe)
mpl.rcParams['font.family'] = 'Noto Sans SC'
mpl.rcParams['axes.unicode_minus'] = False
`);
    send('toast', { msg: 'Python 3.11 已就绪，中文字体已加载 ✓' });
  } catch (_) {
    try {
      pyodide.runPython(`import matplotlib as mpl\nmpl.rcParams['axes.unicode_minus'] = False`);
    } catch (__) {}
    send('toast', { msg: 'Python 3.11 已就绪（中文字体加载失败）' });
  }

  // 安装 stdout/stderr 捕获
  pyodide.runPython(`
import sys, io, js as _js_mod

class _Capture(io.TextIOBase):
    def __init__(self, kind):
        self.kind = kind
    def write(self, s):
        _js_mod.postWorkerMsg(self.kind, s)
        return len(s)
    def flush(self): pass

sys.stdout = _Capture('stdout')
sys.stderr = _Capture('stderr')
`);

  // 将 postWorkerMsg 暴露给 Python
  pyodide.globals.set('postWorkerMsg', (kind, s) => {
    send('output', { cls: kind === 'stderr' ? 'stderr' : null, text: s });
  });

  // 安装 input() 桥接
  pyodide.runPython(`
import builtins, js as _js_mod

def _custom_input(prompt=""):
    result = _js_mod.workerRequestInput(str(prompt))
    return result

builtins.input = _custom_input
`);

  pyodide.globals.set('workerRequestInput', (prompt) => {
    // 同步等待：通过 Service Worker fetch 拦截桥实现
    send('stdin_request', { prompt });
    // 使用 Atomics.wait 在 SharedArrayBuffer 上阻塞（若可用）
    if (stdinBuffer) {
      const arr = new Int32Array(stdinBuffer);
      Atomics.store(arr, 0, 0); // reset
      Atomics.wait(arr, 0, 0);  // 阻塞直到主线程写入
      const len = Atomics.load(arr, 1);
      const bytes = new Uint8Array(stdinBuffer, 8, len);
      return new TextDecoder().decode(bytes);
    }
    // fallback: 不支持 SAB 时返回空字符串（此分支在实践中不会到达）
    return '';
  });

  send('loader', { msg: '一切就绪！', pct: 100 });
  send('ready', {});
}

// ── 运行代码 ──
let _stopRequested = false;

async function runCode(code) {
  _stopRequested = false;
  send('status', { kind: 'loading', text: '运行中' });
  send('run_started', {});

  const t0 = Date.now();

  // 自动安装缺失的包
  const importLines = code.match(/^\s*(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm) || [];
  const pkgSet = new Set();
  importLines.forEach(line => {
    const m = line.match(/^\s*(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (m) pkgSet.add(m[1]);
  });
  const BUILTINS = new Set([
    'sys','os','io','re','math','time','json','random','datetime','collections',
    'itertools','functools','pathlib','string','struct','hashlib','base64',
    'copy','types','abc','enum','typing','dataclasses','contextlib','warnings',
    'traceback','inspect','gc','weakref','threading','queue','subprocess',
    'builtins','importlib','unittest','doctest','pprint','textwrap','shutil',
    'tempfile','glob','fnmatch','stat','errno','signal','platform','sysconfig',
    'asyncio','concurrent','multiprocessing','socket','ssl','http','urllib',
    'email','html','xml','csv','sqlite3','decimal','fractions','statistics',
    'array','bisect','heapq','operator','cmath','numbers','codecs','unicodedata',
    'locale','gettext','argparse','logging','difflib','zipfile','tarfile',
    'gzip','bz2','lzma','zlib','pickle','shelve','marshal','dbm',
    'tokenize','token','ast','dis','compileall','py_compile','keyword',
    'numpy','pandas','matplotlib','scipy','sklearn','scikit_learn',
    'sympy','PIL','Pillow','statsmodels','micropip',
    'js','pyodide','_pyodide','pyodide_http',
    'cv2','skimage','plotly','bokeh','altair','seaborn','networkx',
    'xgboost','lightgbm','requests','pyodide_http',
    'np','pd','plt','sp','sns',
  ]);
  const toInstall = [...pkgSet].filter(p => !BUILTINS.has(p));
  if (toInstall.length > 0) {
    send('output', { cls: 'info', text: `📦 检测到未预装的包，正在自动安装: ${toInstall.join(', ')}...\n` });
    for (const pkg of toInstall) {
      let installed = false;
      try {
        await pyodide.loadPackage(pkg);
        send('output', { cls: 'success', text: `  ✓ ${pkg} 安装成功\n` });
        installed = true;
      } catch (_) {}
      if (!installed) {
        try {
          await pyodide.runPythonAsync(`import micropip as _mp, sys as _sys\nif '${pkg}' not in _sys.modules:\n    await _mp.install('${pkg}')\n`);
          send('output', { cls: 'success', text: `  ✓ ${pkg} 安装成功 (PyPI)\n` });
        } catch (err2) {
          send('output', { cls: 'stderr', text: `  ✗ ${pkg} 安装失败\n` });
        }
      }
    }
    send('refresh_pkgs', {});
  }

  // matplotlib 配置
  if (code.includes('matplotlib') || code.includes('plt.')) {
    pyodide.runPython(`
import matplotlib
matplotlib.use('Agg')
import matplotlib as mpl, matplotlib.font_manager as fm
import os
if os.path.exists('/tmp/NotoSansSC.otf'):
    _registered = [f.name for f in fm.fontManager.ttflist if 'Noto Sans SC' in f.name]
    if not _registered:
        fe = fm.FontEntry(fname='/tmp/NotoSansSC.otf', name='Noto Sans SC')
        fm.fontManager.ttflist.insert(0, fe)
    mpl.rcParams['font.family'] = 'Noto Sans SC'
mpl.rcParams['axes.unicode_minus'] = False
`);
  }

  try {
    const preRunKeys = new Set(
      pyodide.runPython("import __main__; list(vars(__main__).keys())").toJs()
    );

    const userResult = await pyodide.runPythonAsync(code);

    // 图像/DataFrame 收集
    pyodide.runPython([
      "import sys as _sys, io as _io, base64 as _b64",
      "_PNG_SIG = bytes([137,80,78,71,13,10,26,10])",
      "_JPG_SIG = bytes([255,216,255])",
      "_GIF_SIG = bytes([71,73,70,56])",
      "_BMP_SIG = bytes([66,77])",
      "_WEBP_SIG = bytes([82,73,70,70])",
      "def _to_png_b64(img_obj):",
      "    _b = _io.BytesIO()",
      "    img_obj.save(_b, format='PNG')",
      "    _b.seek(0)",
      "    return _b64.b64encode(_b.read()).decode()",
      "def _bytes_to_b64(raw):",
      "    raw = bytes(raw)",
      "    if raw[:8] == _PNG_SIG: mime='png'",
      "    elif raw[:3] == _JPG_SIG: mime='jpeg'",
      "    elif raw[:4] == _GIF_SIG: mime='gif'",
      "    elif raw[:2] == _BMP_SIG: mime='bmp'",
      "    elif raw[:4] == _WEBP_SIG and raw[8:12]==b'WEBP': mime='webp'",
      "    else: return None, None",
      "    return _b64.b64encode(raw).decode(), mime",
      "def _pyrunner_collect(extra=None):",
      "    _images = []",
      "    _plotlys = []",
      "    _seen = set()",
      "    import __main__",
      "    _ns = dict(vars(__main__))",
      "    def _absorb(v):",
      "        if id(v) in _seen: return",
      "        _seen.add(id(v))",
      "        try:",
      "            from plotly.basedatatypes import BaseFigure as _BF",
      "            if isinstance(v, _BF): _plotlys.append(v.to_json()); return",
      "        except Exception: pass",
      "        try:",
      "            import matplotlib.figure as _mf",
      "            if isinstance(v, _mf.Figure):",
      "                _buf = _io.BytesIO()",
      "                v.savefig(_buf, format='png', dpi=130, bbox_inches='tight')",
      "                _buf.seek(0)",
      "                _images.append((_b64.b64encode(_buf.read()).decode(), 'png')); return",
      "        except Exception: pass",
      "        try:",
      "            from PIL.Image import Image as _PI",
      "            if isinstance(v, _PI): _images.append((_to_png_b64(v), 'png')); return",
      "        except Exception: pass",
      "        try:",
      "            import pandas as _pd",
      "            if isinstance(v, _pd.DataFrame) and len(v) > 0:",
      "                _html = v.to_html(max_rows=50, max_cols=20, border=0, classes='pr-table', justify='left')",
      "                _images.append(('__html__:' + _html, 'html')); return",
      "        except Exception: pass",
      "        try:",
      "            import pandas as _pd",
      "            if isinstance(v, _pd.Series) and len(v) > 0:",
      "                _dfs = v.reset_index()",
      "                _dfs.columns = [str(c) for c in _dfs.columns]",
      "                _html = _dfs.to_html(max_rows=50, border=0, classes='pr-table')",
      "                _images.append(('__html__:' + _html, 'html')); return",
      "        except Exception: pass",
      "        try:",
      "            import numpy as _np",
      "            if isinstance(v, _np.ndarray) and v.dtype in (_np.uint8, _np.float32, _np.float64):",
      "                if v.ndim == 2 or (v.ndim == 3 and v.shape[2] in (3,4)):",
      "                    from PIL import Image as _PILMod",
      "                    if v.dtype != _np.uint8:",
      "                        _mn,_mx = v.min(), v.max()",
      "                        if _mx > _mn: v = ((v-_mn)/(_mx-_mn)*255).astype(_np.uint8)",
      "                        else: v = _np.zeros_like(v, dtype=_np.uint8)",
      "                    _img = _PILMod.fromarray(v)",
      "                    _images.append((_to_png_b64(_img), 'png')); return",
      "        except Exception: pass",
      "        try:",
      "            if isinstance(v, (bytes, bytearray)) and len(v) > 100:",
      "                _b64s, _mime = _bytes_to_b64(v)",
      "                if _b64s: _images.append((_b64s, _mime))",
      "        except Exception: pass",
      "        try:",
      "            if isinstance(v, _io.BytesIO):",
      "                v.seek(0); raw = v.read()",
      "                if len(raw) > 100:",
      "                    _b64s, _mime = _bytes_to_b64(raw)",
      "                    if _b64s: _images.append((_b64s, _mime))",
      "        except Exception: pass",
      "        try:",
      "            if isinstance(v, (list, tuple)) and 1 <= len(v) <= 64:",
      "                from PIL.Image import Image as _PI2",
      "                import numpy as _np2",
      "                if all(isinstance(x, (_PI2, _np2.ndarray)) for x in v):",
      "                    for _sub in v: _absorb(_sub)",
      "        except Exception: pass",
      "    if extra is not None: _absorb(extra)",
      "    try:",
      "        import matplotlib.pyplot as _plt",
      "        for _fn in list(_plt.get_fignums()):",
      "            _fig_obj = _plt.figure(_fn)",
      "            if id(_fig_obj) not in _seen:",
      "                _seen.add(id(_fig_obj))",
      "                _buf = _io.BytesIO()",
      "                _fig_obj.savefig(_buf, format='png', dpi=130, bbox_inches='tight')",
      "                _buf.seek(0)",
      "                _images.append((_b64.b64encode(_buf.read()).decode(), 'png'))",
      "        _plt.close('all')",
      "    except Exception: pass",
      "    for _v in list(_ns.values()): _absorb(_v)",
      "    return [_images, _plotlys]",
    ].join("\n"));

    pyodide.globals.set("_pyrunner_retval", userResult ?? null);
    const raw = pyodide.runPython("_pyrunner_collect(extra=_pyrunner_retval)");
    const imgPairs = raw.get(0).toJs();
    const plotlyJsons = raw.get(1).toJs();
    raw.destroy();

    if (plotlyJsons && plotlyJsons.length > 0) {
      send('plotly', { jsons: plotlyJsons });
    }
    if (imgPairs && imgPairs.length > 0) {
      const b64List = imgPairs.map(p => Array.isArray(p) ? p[0] : p);
      const mimeList = imgPairs.map(p => Array.isArray(p) ? p[1] : 'png');
      send('images', { b64List, mimeList });
    }

    // 清理用户新增的全局变量
    const INTERNAL = ['_pyrunner_', '_PNG_SIG', '_JPG_SIG', '_GIF_SIG',
      '_BMP_SIG', '_WEBP_SIG', '_to_png_b64', '_bytes_to_b64', '_b64', '_io', '_sys',
      '_orig_input', '_custom_input', '_Capture', '_pr_'];
    const postRunKeys = pyodide.runPython("list(vars(__main__).keys())").toJs();
    const newKeys = postRunKeys.filter(k =>
      !preRunKeys.has(k) && !INTERNAL.some(p => k.startsWith(p)) && k !== '_pr_del'
    );
    if (newKeys.length > 0) {
      pyodide.globals.set("_pr_del", pyodide.toPy(newKeys));
      pyodide.runPython(
        "import __main__\n" +
        "(lambda keys:[delattr(__main__, k) for k in keys if hasattr(__main__, k)])(_pr_del)\n" +
        "del _pr_del"
      );
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(3);
    send('output', { cls: 'success', text: `\n✓ 运行完成，耗时 ${elapsed}s` });
    send('status', { kind: 'ready', text: '就绪' });
    send('run_done', { success: true });
  } catch (e) {
    if (_stopRequested) {
      send('output', { cls: 'info', text: '\n⏹ 已手动停止执行' });
      send('status', { kind: 'ready', text: '就绪' });
    } else {
      const raw = e.message || String(e);
      const lines = raw.split('\n');
      const execIdx = lines.findIndex(l => l.includes('<exec>'));
      const relevant = execIdx >= 0 ? lines.slice(execIdx) : lines.slice(-8);
      send('output', { cls: 'stderr', text: '\n' + relevant.join('\n') });
      const lineMatch = raw.match(/line (\d+)/);
      send('run_done', { success: false, errorLine: lineMatch ? parseInt(lineMatch[1]) : null });
      send('status', { kind: 'error', text: '出错' });
    }
  }
}

// ── 包管理 ──
async function installPackage(pkgName) {
  send('pkg_install_progress', { msg: `📦 正在安装库: ${pkgName}...\n`, cls: 'info' });
  try {
    try {
      await pyodide.loadPackage(pkgName);
      send('pkg_install_progress', { msg: `✓ ${pkgName} 官方库安装成功\n`, cls: 'success' });
    } catch (_) {
      await pyodide.runPythonAsync(`import micropip; await micropip.install('${pkgName}')`);
      send('pkg_install_progress', { msg: `✓ ${pkgName} 已从 PyPI 成功安装\n`, cls: 'success' });
    }
    send('pkg_install_done', { success: true, pkgName });
  } catch (err) {
    send('pkg_install_progress', { msg: `✗ 安装失败: ${err.message}\n`, cls: 'stderr' });
    send('pkg_install_done', { success: false, pkgName });
  }
}

async function getInstalledPkgs() {
  try {
    const pkgsStr = await pyodide.runPythonAsync(`
def _get_pkgs():
    import sys
    try:
        import micropip
        p_names = [p.name for p in micropip.list()]
    except:
        p_names = []
    m_names = [m for m in sys.modules.keys() if not m.startswith('_') and '.' not in m]
    all_pkgs = sorted(list(set(p_names + m_names)))
    ignore = {'sys', 'builtins', 'pyodide', 'js', 'importlib', 'readline', 'pyodide_js', 'shutil', 'os', 'io', 're'}
    final = [p for p in all_pkgs if p not in ignore and len(p) > 1]
    return ','.join(final)
_get_pkgs()
`);
    send('pkgs_list', { pkgs: pkgsStr.split(',').filter(p => p) });
  } catch (err) {
    send('pkgs_list', { pkgs: [], error: true });
  }
}

// ── 消息处理 ──
self.onmessage = async (e) => {
  const { type, ...data } = e.data;
  if (type === 'init') {
    if (data.sharedBuffer) stdinBuffer = data.sharedBuffer;
    await initPyodide();
  } else if (type === 'run') {
    await runCode(data.code);
  } else if (type === 'stop') {
    _stopRequested = true;
  } else if (type === 'install_pkg') {
    await installPackage(data.pkgName);
  } else if (type === 'get_pkgs') {
    await getInstalledPkgs();
  } else if (type === 'stdin_response') {
    // SharedArrayBuffer 方式：主线程写入数据，唤醒 Atomics.wait
    if (stdinBuffer) {
      const arr = new Int32Array(stdinBuffer);
      const bytes = new TextEncoder().encode(data.value || '');
      const byteArr = new Uint8Array(stdinBuffer, 8, bytes.length);
      byteArr.set(bytes);
      Atomics.store(arr, 1, bytes.length);
      Atomics.store(arr, 0, 1);
      Atomics.notify(arr, 0);
    }
  }
};
