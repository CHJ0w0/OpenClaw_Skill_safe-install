---
name: skill-safe-install
description: Skills 安全安装工具 - 自动执行 ClawHub 评分检查 + ThreatBook 沙箱扫描双层验证
homepage: https://github.com/CHJ0w0/OpenClaw_Skill_safe-install
metadata: {"clawdbot":{"emoji":"🛡️","requires":{"bins":["node","curl","tar"],"env":["THREATBOOK_API_KEY"]},"primaryEnv":"THREATBOOK_API_KEY"}}
---

# Skills 安全安装工具

在安装任何 Skill 前自动执行完整的安全检查流程，包括 **ClawHub 评分检查** 和 **ThreatBook 沙箱扫描**。

## 快速开始

### 1. 配置 API Key

```bash
# 获取微步在线 API Key: https://s.threatbook.com
echo 'THREATBOOK_API_KEY=your_api_key_here' >> ~/.openclaw/.env
```

### 2. 使用安全安装

```bash
# 替代 clawhub install，自动执行完整检查
node ~/.openclaw/workspace/skills/skill-safe-install/scripts/safe-install.mjs skill-name

# 或添加别名
alias clawhub-safe='node ~/.openclaw/workspace/skills/skill-safe-install/scripts/safe-install.mjs'
clawhub-safe skill-name
```

## 安全检查流程

```
┌─────────────────────────────────────────────────────────┐
│              Skills 安全安装流程                         │
├─────────────────────────────────────────────────────────┤
│  1. ClawHub 评分检查 (≥3.5 分？)                        │
│     ├─ 否 → ❓ 询问任务下达者                            │
│     └─ 是 → 继续                                        │
│                                                         │
│  2. ThreatBook 沙箱扫描                                 │
│     ├─ 安全 → ✅ 安装                                   │
│     ├─ 可疑 → ❓ 询问任务下达者                          │
│     ├─ 恶意 → ❌ 禁止安装                               │
│     └─ API 失败 → ❓ 询问任务下达者                      │
│                                                         │
│  3. 执行安装                                            │
└─────────────────────────────────────────────────────────┘
```

## 判定标准

### 第一层：ClawHub 评分检查

| 评分 | 判定 | 操作 |
|-----|------|------|
| **≥3.5 分** | ✅ 高评分 | 进入沙箱扫描 |
| **<3.5 分** | ⚠️ 低评分 | ❓ 必须询问任务下达者确认 |

### 第二层：ThreatBook 沙箱扫描

| 结果 | 含义 | 操作 |
|-----|------|------|
| **safe** | 安全 | ✅ 允许安装 |
| **suspicious** | 可疑 | ❓ 必须询问任务下达者确认 |
| **malicious** | 恶意 | ❌ 禁止安装 |
| **API 失败** | 无法访问 | ❓ 必须询问任务下达者是否继续 |

### 决策矩阵

| 评分 | 沙箱 | 最终决策 |
|-----|------|---------|
| ≥3.5 | safe | ✅ **直接安装** |
| ≥3.5 | suspicious | ❓ **询问确认** |
| ≥3.5 | API 失败 | ❓ **询问确认** |
| ≥3.5 | malicious | ❌ **禁止安装** |
| <3.5 | 任意 | ❓ **询问确认** |

## 选项

| 选项 | 说明 |
|-----|------|
| `--force` | 强制安装（跳过可疑警告，需任务下达者确认） |
| `--no-scan` | 跳过沙箱扫描（不推荐） |
| `--dry-run` | 仅检查，不实际安装 |
| `--timeout=<秒>` | 沙箱扫描超时时间（默认 120 秒） |
| `--help` | 显示帮助 |

## 退出码

| 退出码 | 含义 |
|-------|------|
| `0` | 安装成功 |
| `1` | 检测到恶意代码，禁止安装 |
| `2` | 文件可疑，等待确认 |
| `3` | API 调用失败 |
| `4` | 评分过低，等待确认 |
| `5` | 用户取消安装 |

## 环境变量

| 变量 | 必需 | 说明 |
|-----|------|------|
| `THREATBOOK_API_KEY` | ✅ | 微步在线沙箱 API Key |
| `CLAWHUB_TOKEN` | ❌ | ClawHub 认证 Token（如需要） |

## 集成到工作流

### 方式 1：直接使用
```bash
node ~/.openclaw/workspace/skills/skill-safe-install/scripts/safe-install.mjs tavily-search
```

### 方式 2：添加 Shell 别名
```bash
# 添加到 ~/.bashrc
alias clawhub-safe='node ~/.openclaw/workspace/skills/skill-safe-install/scripts/safe-install.mjs'

# 使用
clawhub-safe skill-name
```

### 方式 3：覆盖 clawhub install（高级）
```bash
# 在 ~/.bashrc 中添加
clawhub() {
  if [ "$1" = "install" ]; then
    node ~/.openclaw/workspace/skills/skill-safe-install/scripts/safe-install.mjs "$2"
  else
    command clawhub "$@"
  fi
}
```

## 输出示例

### 成功安装
```
🛡️ 开始 Skills 安全安装流程
📋 检查 Skill: tavily-search

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第一步：ClawHub 评分检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 评分：4.2/5.0 (高评分，通过)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第二步：ThreatBook 沙箱扫描
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📤 上传文件到沙箱...
🖥️ 沙箱环境：ubuntu_1704_x64
⏳ 等待分析结果...
✅ 分析完成

📊 扫描结果:
  判定：SAFE
  威胁等级：clean
  可信度：98%
  引擎检出：0/7

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
安全检查通过，开始安装...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ tavily-search 安装完成！
```

### 检测到恶意
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第二步：ThreatBook 沙箱扫描
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ 等待分析结果...
✅ 分析完成

📊 扫描结果:
  判定：MALICIOUS
  威胁等级：malicious
  引擎检出：5/8
  威胁类型：Trojan.Generic

❌ 检测到恶意代码，禁止安装！
```

### 需要确认
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第一步：ClawHub 评分检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 评分：2.8/5.0 (低评分)

此 Skill 评分低于安全阈值 (3.5)，可能存在风险。

Skill 信息:
  名称：unknown-skill
  作者：anonymous
  更新时间：2025-01-01

是否继续安装？(y/N):
```

## 相关文件

- `scripts/safe-install.mjs` - 主安装脚本（整合评分 + 沙箱）
- `scripts/scan.mjs` - 沙箱扫描脚本（复用 threatbook-scan）
- `SECURITY_PROCESS.md` - 完整安全流程文档

## 注意事项

1. **API 配额**: 免费账户有每日扫描次数限制
2. **分析时间**: 沙箱动态分析需要 1-2 分钟
3. **隐私**: 上传的文件会被微步在线分析，不要上传敏感文件
4. **网络**: 需要能访问 `api.threatbook.cn` 和 ClawHub API

## 许可证

MIT License
