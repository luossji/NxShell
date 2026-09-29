/**
 * noVNC 1.7.0 补丁：core/util/browser.js 使用了 top-level await（WebCodecs H.264 探测）。
 * 本项目是 vue-cli 4 / webpack 4，不支持 TLA，babel 也无法降级转换 TLA，
 * 因此把它包进异步 IIFE（rfb 在协商阶段才读取该变量，异步赋值无碍）。
 * 幂等：已打补丁、文件不存在或 novnc 版本变化导致模式不匹配时直接跳过。
 */
const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', '@novnc', 'novnc', 'core', 'util', 'browser.js');
const TLA = 'supportsWebCodecsH264Decode = await _checkWebCodecsH264DecodeSupport();';
const PATCHED = [
    '// [NxShell patch] webpack 4 不支持 top-level await，将探测包进异步 IIFE（见 scripts/patch-novnc-tla.js）',
    '(async () => {',
    '    try {',
    '        supportsWebCodecsH264Decode = await _checkWebCodecsH264DecodeSupport();',
    '    } catch (e) {',
    '        Log.Warn("Failed to check WebCodecs H.264 decode support: " + e);',
    '    }',
    '})();'
].join('\n');

try {
    let code = fs.readFileSync(target, 'utf8');
    if (code.includes(PATCHED)) {
        console.log('[patch-novnc-tla] already patched, skip');
        process.exit(0);
    }
    if (!code.includes(TLA)) {
        console.log('[patch-novnc-tla] TLA pattern not found (novnc version changed?), skip');
        process.exit(0);
    }
    fs.writeFileSync(target, code.replace(TLA, PATCHED));
    console.log('[patch-novnc-tla] patched:', target);
} catch (e) {
    console.log('[patch-novnc-tla] skipped:', e.message);
}
