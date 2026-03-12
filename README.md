# Telegram Bot - 远程命令执行机器人

通过 Telegram 远程执行服务器命令，支持代理、用户白名单和命令别名。

> ⚠️ <span style="color: red">**安全警告：务必设置白名单！**</span>
> 
> 本 Bot 允许在服务器上执行任意命令，如不设置白名单，任何人都可能控制你的服务器！
> 
> 请在 `.env` 中配置 `WHITELIST_USER_IDS`，只允许你自己的 Telegram 账号访问。

## 核心功能

- **远程命令执行** - 通过 Telegram 在服务器上执行命令，实时返回结果
- **命令别名** - 为常用命令创建简短别名，提高效率
- **用户白名单** - 限制只有授权用户才能使用，保障安全
- **代理支持** - 支持 HTTP/HTTPS/SOCKS5 代理
- *文件收发* - 附带功能，支持收发图片和文件

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制配置文件模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Telegram Bot Token (从 @BotFather 获取)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# 代理设置 (可选)
PROXY_URL=http://127.0.0.1:7890

# ⚠️ 用户白名单 (必填！用逗号分隔的用户ID)
WHITELIST_USER_IDS=123456789
```

### 3. 获取 Bot Token

1. 在 Telegram 中搜索 `@BotFather`
2. 发送 `/newbot` 创建新 Bot
3. 按提示设置名称，获取 Token

### 4. 获取你的用户 ID

1. 先启动 Bot
2. 向 Bot 发送 `/info` 命令
3. 查看返回的 `用户ID`，填入 `.env` 的 `WHITELIST_USER_IDS`

### 5. 启动 Bot

```bash
npm start
# 或开发模式 (自动重启)
npm run dev
```

## 命令列表

| 命令 | 说明 |
|------|------|
| `/run <命令>` | 执行命令行 |
| `/alias add <别名> <命令>` | 添加命令别名 |
| `/alias list` | 列出所有别名 |
| `/alias delete <别名>` | 删除别名 |
| `/info` | 显示聊天信息 (获取用户ID) |
| `/start` | 开始使用 |
| `/help` | 显示帮助 |

## 使用示例

### 远程执行命令

```
/run ls -la
/run df -h
/run docker ps
/run systemctl status nginx
```

### 命令别名

创建别名简化常用命令：

```
/alias add ll ls -la
/alias add dc docker-compose
/alias add dps docker ps
/alias add status systemctl status
```

使用别名：

```
/run ll              # 执行 ls -la
/run dc up -d        # 执行 docker-compose up -d
/run dps             # 执行 docker ps
```

### 文件功能

- 发送图片/文件给 Bot 会自动保存
- `/list` 查看已保存文件
- `/file <文件名>` 获取文件

## 项目结构

```
telegram-bot/
├── src/
│   ├── index.js        # 主程序入口
│   ├── commands.js     # 命令处理模块
│   └── fileHandler.js  # 文件处理模块
├── data/aliases.json   # 别名存储
├── downloads/          # 文件存储目录
├── .env                # 环境配置
└── package.json
```

## 自定义命令

可在 `src/index.js` 中添加自定义命令：

```javascript
registerCommand('hello', '打招呼', async (msg, args, bot) => {
  return `Hello, ${msg.from.first_name}!`;
});
```

## 注意事项

- 命令执行超时限制：30 秒
- 输出长度限制：约 3800 字符（Telegram 消息限制）
- **务必配置白名单，防止未授权访问**

## License

MIT