#!/usr/bin/env node

/**
 * Skills 安全安装工具
 * 
 * 整合完整安全检查流程：
 * 1. ClawHub 评分检查
 * 2. ThreatBook 沙箱扫描
 * 3. 自动决策或询问任务下达者
 * 4. 执行安装
 * 
 * 退出码:
 *   0 - 安装成功
 *   1 - 检测到恶意代码，禁止安装
 *   2 - 文件可疑，等待确认
 *   3 - API 调用失败
 *   4 - 评分过低，等待确认
 *   5 - 用户取消安装
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const THREATBOOK_API_BASE = 'https://api.threatbook.cn/v3';
const DEFAULT_TIMEOUT = 120000; // 120 秒
const SAFE_RATING_THRESHOLD = 3.5; // 安全评分阈值
const SAFE_MALICIOUS_RATE = 0.01; // 1% 恶意率阈值
const SUSPICIOUS_MALICIOUS_RATE = 0.10; // 10% 恶意率阈值

// 沙箱环境映射
const SANDBOX_TYPE_MAP = {
  'linux': 'ubuntu_1704_x64',
  'win32': 'win10_1903_enx64_office2016',
  'darwin': 'win10_1903_enx64_office2016'
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset', bold = false) {
  const prefix = bold ? colors.bold : '';
  console.log(`${prefix}${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log('\n' + '━'.repeat(50), 'cyan');
  log(title, 'cyan', true);
  log('━'.repeat(50), 'cyan');
}

// 解析命令行参数
function parseArgs(args) {
  const options = {
    force: args.includes('--force'),
    noScan: args.includes('--no-scan'),
    dryRun: args.includes('--dry-run'),
    timeout: parseInt(args.find(a => a.startsWith('--timeout='))?.split('=')[1] || '120') * 1000,
    help: args.includes('--help') || args.includes('-h')
  };
  
  const skillName = args.find(a => !a.startsWith('--'));
  
  return { options, skillName };
}

// 显示帮助
function showHelp() {
  console.log(`
🛡️  Skills 安全安装工具

用法:
  node safe-install.mjs <skill-name> [选项]

选项:
  --force         强制安装（跳过可疑警告）
  --no-scan       跳过沙箱扫描（不推荐）
  --dry-run       仅检查，不实际安装
  --timeout=<秒>  沙箱扫描超时时间（默认 120 秒）
  --help, -h      显示帮助

安全检查流程:
  1. ClawHub 评分检查 (≥3.5 分？)
  2. ThreatBook 沙箱扫描
  3. 自动决策或询问任务下达者
  4. 执行安装

示例:
  node safe-install.mjs tavily-search
  node safe-install.mjs some-skill --force
  node safe-install.mjs test-skill --dry-run
`);
}

// 获取 API Key
function getApiKey() {
  return process.env.THREATBOOK_API_KEY;
}

// 执行命令并返回输出
function execCommand(cmd, options = {}) {
  try {
    const result = execSync(cmd, { 
      encoding: 'utf8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options
    });
    return { success: true, output: result };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      status: error.status,
      output: error.stdout || ''
    };
  }
}

// 第一步：ClawHub 评分检查
async function checkRating(skillName) {
  logSection('第一步：ClawHub 评分检查');
  
  log(`📋 查询 Skill: ${skillName}...`, 'cyan');
  
  const result = execCommand(`clawhub search "${skillName}"`, { silent: true });
  
  if (!result.success) {
    log(`⚠️ 无法获取 Skill 信息：${result.error}`, 'yellow');
    return { 
      passed: false, 
      score: null, 
      reason: '无法获取评分',
      needsConfirm: true 
    };
  }
  
  // 解析评分（从输出中提取）
  const output = result.output;
  const scoreMatch = output.match(/(?:评分|Rating|Score)[:：]?\s*([\d.]+)/i);
  const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;
  
  if (score === null) {
    log(`⚠️ 无法解析评分信息`, 'yellow');
    return { 
      passed: false, 
      score: null, 
      reason: '无法解析评分',
      needsConfirm: true 
    };
  }
  
  const passed = score >= SAFE_RATING_THRESHOLD;
  
  if (passed) {
    log(`✅ 评分：${score}/5.0 (高评分，通过)`, 'green');
  } else {
    log(`⚠️ 评分：${score}/5.0 (低于安全阈值 ${SAFE_RATING_THRESHOLD})`, 'yellow');
  }
  
  return { 
    passed, 
    score, 
    reason: passed ? '高评分' : '低评分',
    needsConfirm: !passed 
  };
}

// 上传文件到沙箱
async function uploadFile(filePath, apiKey, sandboxType) {
  const fileSize = existsSync(filePath) ? 
    (await import('fs')).promises.stat(filePath).then(s => s.size).catch(() => 0) : 0;
  
  if (fileSize > 100 * 1024 * 1024) {
    throw new Error('文件大小超过 100MB 限制');
  }
  
  log(`📤 上传文件到沙箱...`, 'cyan');
  log(`🖥️ 沙箱环境：${sandboxType}`, 'cyan');
  
  const curlCmd = `curl -s -X POST "${THREATBOOK_API_BASE}/file/upload?apikey=${apiKey}" \\
    -F "file=@${filePath}" \\
    -F "sandbox_type=${sandboxType}"`;
  
  const result = execCommand(curlCmd, { silent: true, shell: true });
  
  if (!result.success) {
    throw new Error(`上传失败：${result.error}`);
  }
  
  const data = JSON.parse(result.output);
  
  if (data.response_code !== 0) {
    throw new Error(data.verbose_msg || '上传失败');
  }
  
  const sha256 = data.data.sha256 || data.data.sample_sha256;
  log(`✅ 上传成功，SHA256: ${sha256.substring(0, 16)}...`, 'green');
  
  return { sha256, sandbox_type: sandboxType };
}

// 获取沙箱报告
async function getReport(sha256, sandboxType, apiKey, timeout) {
  log(`⏳ 等待沙箱分析结果...`, 'yellow');
  
  const startTime = Date.now();
  const pollInterval = 10000;
  
  while (Date.now() - startTime < timeout) {
    const curlCmd = `curl -s -X GET "${THREATBOOK_API_BASE}/file/report?apikey=${apiKey}&sha256=${sha256}&sandbox_type=${sandboxType}"`;
    const result = execCommand(curlCmd, { silent: true, shell: true });
    
    if (result.success) {
      try {
        const data = JSON.parse(result.output);
        if (data.response_code === 0 && data.data) {
          const summary = data.data.summary;
          if (summary && summary.threat_level) {
            log(`✅ 分析完成`, 'green');
            return data.data;
          }
        }
      } catch (e) {
        // 继续等待
      }
    }
    
    log(`⏳ 等待分析结果...`, 'yellow');
    await sleep(pollInterval);
  }
  
  throw new Error('扫描超时');
}

// 分析沙箱结果
function analyzeResult(report) {
  const result = {
    verdict: 'safe',
    confidence: 0,
    threatLevel: 'unknown',
    engines: { total: 0, malicious: 0 },
    threatTypes: [],
    message: ''
  };
  
  if (report && report.summary) {
    const summary = report.summary;
    result.threatLevel = summary.threat_level;
    
    // 白名单检查
    if (summary.is_whitelist === true) {
      result.verdict = 'safe';
      result.confidence = 99;
      result.message = '✅ 白名单文件，安全';
      return result;
    }
    
    // 根据 threat_level 判定
    if (summary.threat_level === 'clean') {
      result.verdict = 'safe';
      result.confidence = 90;
    } else if (summary.threat_level === 'suspicious') {
      result.verdict = 'suspicious';
      result.confidence = 70;
    } else if (summary.threat_level === 'malicious') {
      result.verdict = 'malicious';
      result.confidence = 95;
    } else {
      result.verdict = 'suspicious';
      result.confidence = 50;
    }
    
    // 提取威胁类型
    if (summary.malware_type) {
      result.threatTypes.push(summary.malware_type);
    }
    
    // 多引擎信息
    if (summary.multi_engines) {
      const match = summary.multi_engines.match(/(\d+)\/(\d+)/);
      if (match) {
        result.engines.malicious = parseInt(match[1]);
        result.engines.total = parseInt(match[2]);
      }
    }
  }
  
  // 生成消息
  const engineInfo = result.engines.total > 0 ? 
    ` (${result.engines.malicious}/${result.engines.total} 引擎检出)` : '';
  const malwareInfo = result.threatTypes.length > 0 ? 
    ` [${result.threatTypes.join(', ')}]` : '';
  
  if (result.verdict === 'malicious') {
    result.message = `❌ 检测到恶意代码${malwareInfo}${engineInfo}`;
  } else if (result.verdict === 'suspicious') {
    result.message = `⚠️ 文件可疑${engineInfo}`;
  } else {
    result.message = `✅ 文件安全 (${result.confidence}% 可信度)`;
  }
  
  return result;
}

// 第二步：ThreatBook 沙箱扫描
async function scanSkill(skillName, options) {
  logSection('第二步：ThreatBook 沙箱扫描');
  
  const apiKey = getApiKey();
  if (!apiKey) {
    log(`⚠️ 未配置 THREATBOOK_API_KEY`, 'yellow');
    log(`   请在 ~/.openclaw/.env 中添加 API Key`, 'yellow');
    return { 
      passed: false, 
      apiFailed: true, 
      needsConfirm: true,
      reason: 'API Key 未配置'
    };
  }
  
  try {
    // 临时下载 Skill
    const tempDir = `/tmp/safe-install-${Date.now()}`;
    mkdirSync(tempDir, { recursive: true });
    
    try {
      log(`📥 下载 Skill 进行扫描...`, 'cyan');
      const downloadResult = execCommand(
        `clawhub install "${skillName}" --dir "${tempDir}"`, 
        { silent: true }
      );
      
      if (!downloadResult.success) {
        throw new Error('下载 Skill 失败');
      }
      
      const skillPath = path.join(tempDir, skillName);
      
      // 打包为 zip
      const zipPath = `/tmp/skill-${Date.now()}.zip`;
      execCommand(`cd "${skillPath}" && zip -r "${zipPath}" . -x "*.git*" -x "node_modules/*"`, { 
        silent: true, 
        shell: true 
      });
      
      // 上传并扫描
      const sandboxType = SANDBOX_TYPE_MAP[platform()] || 'ubuntu_1704_x64';
      const { sha256, sandbox_type } = await uploadFile(zipPath, apiKey, sandboxType);
      const report = await getReport(sha256, sandbox_type, apiKey, options.timeout);
      const result = analyzeResult(report);
      
      // 输出结果
      log(`\n📊 扫描结果:`, 'cyan');
      log(`  判定：${result.verdict.toUpperCase()}`, result.verdict === 'safe' ? 'green' : 
                                          result.verdict === 'malicious' ? 'red' : 'yellow');
      log(`  威胁等级：${result.threatLevel}`);
      log(`  可信度：${result.confidence}%`);
      if (result.engines.total > 0) {
        log(`  引擎检出：${result.engines.malicious}/${result.engines.total}`);
      }
      if (result.threatTypes.length > 0) {
        log(`  威胁类型：${result.threatTypes.join(', ')}`, 'red');
      }
      
      // 清理临时文件
      if (existsSync(zipPath)) rmSync(zipPath);
      
      return {
        passed: result.verdict === 'safe',
        apiFailed: false,
        needsConfirm: result.verdict !== 'safe',
        reason: result.verdict,
        confidence: result.confidence,
        engines: result.engines,
        threatTypes: result.threatTypes,
        message: result.message
      };
      
    } finally {
      if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
    }
    
  } catch (error) {
    log(`⚠️ 扫描失败：${error.message}`, 'yellow');
    return { 
      passed: false, 
      apiFailed: true, 
      needsConfirm: true,
      reason: `扫描失败：${error.message}`
    };
  }
}

// 询问任务下达者
function askForConfirmation(skillName, reason, details = {}) {
  logSection('需要确认');
  
  let message = '';
  
  if (reason === 'low_rating') {
    message = `⚠️ 此 Skill 评分低于安全阈值 (${details.score}/${SAFE_RATING_THRESHOLD})`;
  } else if (reason === 'suspicious') {
    message = `⚠️ 沙箱扫描发现可疑内容`;
    if (details.engines?.total > 0) {
      message += `\n   引擎检出：${details.engines.malicious}/${details.engines.total}`;
    }
  } else if (reason === 'api_failed') {
    message = `⚠️ 安全扫描服务暂时不可用`;
  } else if (reason === 'malicious') {
    message = `❌ 检测到恶意代码，禁止安装！`;
    if (details.threatTypes?.length > 0) {
      message += `\n   威胁类型：${details.threatTypes.join(', ')}`;
    }
    log(message, 'red');
    return false; // 恶意直接拒绝
  }
  
  log(message, 'yellow');
  
  if (details.skillInfo) {
    log(`\nSkill 信息:`, 'cyan');
    log(`  名称：${details.skillInfo.name || skillName}`);
    if (details.skillInfo.author) log(`  作者：${details.skillInfo.author}`);
    if (details.skillInfo.updated) log(`  更新时间：${details.skillInfo.updated}`);
  }
  
  log(`\n是否继续安装？(y/N): `, 'yellow');
  
  // 简单读取输入
  const answer = readFileSync(0, 'utf8').trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

// 执行安装
function installSkill(skillName, dryRun = false) {
  logSection('执行安装');
  
  if (dryRun) {
    log(`🔍 干运行模式，跳过实际安装`, 'yellow');
    return true;
  }
  
  log(`📥 开始安装 ${skillName}...`, 'cyan');
  
  const result = execCommand(`clawhub install "${skillName}"`);
  
  if (result.success) {
    log(`\n✅ ${skillName} 安装完成！`, 'green');
    return true;
  } else {
    log(`\n❌ 安装失败：${result.error}`, 'red');
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 主程序
async function main() {
  const args = process.argv.slice(2);
  const { options, skillName } = parseArgs(args);
  
  if (options.help || !skillName) {
    showHelp();
    process.exit(options.help ? 0 : 1);
  }
  
  log(`\n🛡️ 开始 Skills 安全安装流程`, 'cyan', true);
  log(`📋 检查 Skill: ${skillName}`, 'cyan');
  
  // 第一步：评分检查
  const ratingResult = await checkRating(skillName);
  
  if (ratingResult.needsConfirm) {
    const confirmed = askForConfirmation(skillName, 'low_rating', { 
      score: ratingResult.score,
      skillInfo: {}
    });
    
    if (!confirmed) {
      log(`\n❌ 安装已取消`, 'red');
      process.exit(5);
    }
  }
  
  // 第二步：沙箱扫描（除非 --no-scan）
  let scanResult = { passed: true, needsConfirm: false };
  
  if (!options.noScan) {
    scanResult = await scanSkill(skillName, options);
    
    if (scanResult.apiFailed) {
      const confirmed = askForConfirmation(skillName, 'api_failed', {
        reason: scanResult.reason
      });
      
      if (!confirmed) {
        log(`\n❌ 安装已取消`, 'red');
        process.exit(5);
      }
    } else if (scanResult.needsConfirm) {
      if (scanResult.reason === 'malicious') {
        log(`\n${scanResult.message}`, 'red');
        log(`\n❌ 禁止安装恶意软件！`, 'red', true);
        process.exit(1);
      }
      
      const confirmed = askForConfirmation(skillName, 'suspicious', {
        engines: scanResult.engines,
        threatTypes: scanResult.threatTypes,
        confidence: scanResult.confidence
      });
      
      if (!confirmed) {
        log(`\n❌ 安装已取消`, 'red');
        process.exit(5);
      }
    }
  }
  
  // 第三步：执行安装
  if (scanResult.passed || options.force) {
    const success = installSkill(skillName, options.dryRun);
    process.exit(success ? 0 : 3);
  } else {
    process.exit(2);
  }
}

main().catch(error => {
  log(`\n❌ 未捕获的错误：${error.message}`, 'red');
  process.exit(3);
});
