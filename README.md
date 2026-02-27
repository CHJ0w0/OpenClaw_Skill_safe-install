# 🛡️ Skills 安全安装工具

在安装任何 Skill 前自动执行完整的**双层安全检查**，确保安装的 Skills 安全可靠。

## 核心特性

- ✅ **自动触发** - 安装前自动执行检查，无需手动操作
- ✅ **双层验证** - ClawHub 评分 + ThreatBook 沙箱扫描
- ✅ **智能决策** - 根据决策矩阵自动判断或询问任务下达者
- ✅ **完整流程** - 整合所有检查步骤于单一工具
- ✅ **详细报告** - 清晰的检查结果和判定依据

## 安装与配置

### 1. 获取微步在线 API Key

访问 [微步云沙箱](https://s.threatbook.com) 注册账号并获取 API Key。

### 2. 配置环境变量

```bash
# 添加到 ~/.openclaw/.env
echo 'THREATBOOK_API_KEY=your_api_key_here' >> ~/.openclaw/.env
```

### 3. 添加 Shell 别名（推荐）

```bash
# 添加到 ~/.bashrc
alias clawhub-safe='node ~/.openclaw/workspace/skills/skill-safe-install/scripts/safe-install.mjs'

# 使别名生效
source ~/.bashrc
```

## 使用方法

### 基本用法

```bash
# 使用脚本路径
node ~/.openclaw/workspace/skills/skill-safe-install/scripts/safe-install.mjs tavily-search

# 使用别名（配置后）
clawhub-safe tavily-search
```

### 选项

| 选项 | 说明 |
|-----|------|
| `--force` | 强制安装（跳过可疑警告） |
| `--no-scan` | 跳过沙箱扫描（不推荐） |
| `--dry-run` | 仅检查，不实际安装 |
| `--timeout=<秒>` | 沙箱扫描超时时间（默认 120 秒） |
| `--help` | 显示帮助 |

### 示例

```bash
# 标准安装（自动检查）
clawhub-safe tavily-search

# 仅检查不安装
clawhub-safe some-skill --dry-run

# 强制安装（跳过警告）
clawhub-safe risky-skill --force

# 延长超时时间
clawhub-safe large-skill --timeout=180
```

## 安全检查流程

```
┌─────────────────────────────────────────────────────────┐
│              Skills 安全安装流程                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1️⃣  ClawHub 评分检查                                    │
│      ├─ 评分 ≥ 3.5 → ✅ 通过，继续                       │
│      └─ 评分 < 3.5 → ❓ 询问任务下达者                    │
│                                                         │
│  2️⃣  ThreatBook 沙箱扫描                                 │
│      ├─ safe → ✅ 允许安装                              │
│      ├─ suspicious → ❓ 询问任务下达者                   │
│      ├─ malicious → ❌ 禁止安装                         │
│      └─ API 失败 → ❓ 询问任务下达者                     │
│                                                         │
│  3️⃣  执行安装                                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 判定标准

### 第一层：ClawHub 评分检查

| 评分 | 判定 | 操作 |
|-----|------|------|
| **≥ 3.5 分** | ✅ 高评分 | 进入沙箱扫描 |
| **< 3.5 分** | ⚠️ 低评分 | ❓ 必须询问任务下达者确认 |

### 第二层：ThreatBook 沙箱扫描

| 结果 | 含义 | 恶意率参考 | 操作 |
|-----|------|-----------|------|
| **safe** | 安全 | - | ✅ 允许安装 |
| **suspicious** | 可疑 | - | ❓ 必须询问任务下达者确认 |
| **malicious** | 恶意 | - | ❌ 禁止安装 |
| **API 失败** | 无法访问 | - | ❓ 必须询问任务下达者是否继续 |

### 决策矩阵

| 评分检查 | 沙箱扫描 | 最终决策 |
|---------|---------|---------|
| ✅ ≥3.5 | ✅ safe | ✅ **直接安装** |
| ✅ ≥3.5 | ⚠️ suspicious | ❓ **询问确认** |
| ✅ ≥3.5 | ⚠️ API 失败 | ❓ **询问确认** |
| ✅ ≥3.5 | ❌ malicious | ❌ **禁止安装** |
| ⚠️ <3.5 | 任意 | ❓ **询问确认** |

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
📥 开始安装 tavily-search...
✅ tavily-search 安装完成！
```

### 检测到低评分

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第一步：ClawHub 评分检查
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 评分：2.8/5.0 (低于安全阈值 3.5)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
需要确认
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 此 Skill 评分低于安全阈值 (2.8/3.5)

Skill 信息:
  名称：unknown-skill
  作者：anonymous

是否继续安装？(y/N):
```

### 检测到恶意代码

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

❌ 禁止安装恶意软件！
```

## 退出码

| 退出码 | 含义 |
|-------|------|
| `0` | 安装成功 |
| `1` | 检测到恶意代码，禁止安装 |
| `2` | 文件可疑，等待确认 |
| `3` | API 调用失败 |
| `4` | 评分过低，等待确认 |
| `5` | 用户取消安装 |

## 集成到工作流

### 方式 1：覆盖 clawhub install

在 `~/.bashrc` 中添加：

```bash
clawhub() {
  if [ "$1" = "install" ] && [ -n "$2" ]; then
    node ~/.openclaw/workspace/skills/skill-safe-install/scripts/safe-install.mjs "$2" "${@:3}"
  else
    command clawhub "$@"
  fi
}
```

这样所有 `clawhub install` 命令都会自动执行安全检查。

### 方式 2：在 OpenClaw 中配置

在 OpenClaw 的技能安装流程中调用此工具作为前置钩子。

### 方式 3：CI/CD 集成

在自动化部署流程中使用 `--dry-run` 模式进行预检。

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|-----|------|--------|------|
| `THREATBOOK_API_KEY` | ✅ | - | 微步在线沙箱 API Key |
| `CLAWHUB_TOKEN` | ❌ | - | ClawHub 认证 Token |

## 注意事项

1. **API 配额**: 免费账户有每日扫描次数限制，请合理使用
2. **分析时间**: 沙箱动态分析需要 1-2 分钟，默认超时 120 秒
3. **文件大小**: 单文件最大 100MB
4. **隐私**: 上传的文件会被微步在线分析，不要上传敏感/机密文件
5. **网络**: 需要能访问 `api.threatbook.cn` 和 ClawHub API

## 故障排除

### 问题：API Key 无效

```
⚠️ 扫描失败：Required:apikey.
```

**解决**: 检查 `THREATBOOK_API_KEY` 是否正确配置到 `~/.openclaw/.env`

### 问题：扫描超时

```
⚠️ 扫描失败：扫描超时
```

**解决**: 使用 `--timeout=180` 延长超时时间

### 问题：clawhub 命令不存在

```
/bin/sh: clawhub: command not found
```

**解决**: 确保已安装 ClawHub CLI：
```bash
npm install -g clawhub
```

## 相关文件

- `SKILL.md` - Skill 元数据和使用说明
- `scripts/safe-install.mjs` - 主安装脚本
- `SECURITY_PROCESS.md` - 完整安全流程文档

## 更新日志

### v1.0.0 (2026-02-27)
- 🎉 初始版本
- ✅ 整合 ClawHub 评分检查和 ThreatBook 沙箱扫描
- ✅ 实现完整决策矩阵
- ✅ 支持自动询问任务下达者
- ✅ 添加 --force、--no-scan、--dry-run 选项

## 许可证

MIT License

## 相关链接

- [微步在线云沙箱](https://s.threatbook.com)
- [ClawHub](https://clawhub.com)
- [OpenClaw 文档](https://docs.openclaw.ai)
