# Telegram Bot - Remote Command Execution

Execute commands on your server remotely via Telegram. Supports proxy, user whitelist, and command aliases.

> ⚠️ <span style="color: red">**SECURITY WARNING: You MUST set up the whitelist!**</span>
> 
> This Bot allows executing arbitrary commands on your server. Without a whitelist, anyone could control your server!
> 
> Please configure `WHITELIST_USER_IDS` in `.env` to only allow your own Telegram account.

## Core Features

- **Remote Command Execution** - Execute commands on server via Telegram, get real-time results
- **Command Aliases** - Create short aliases for frequently used commands
- **User Whitelist** - Restrict access to authorized users only for security
- **Proxy Support** - HTTP/HTTPS/SOCKS5 proxy support
- *File Transfer* - Secondary feature for sending/receiving images and files

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the configuration template:

```bash
cp .env.example .env
```

Edit `.env` file:

```env
# Telegram Bot Token (Get from @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Proxy settings (optional)
PROXY_URL=http://127.0.0.1:7890

# ⚠️ User whitelist (REQUIRED! Comma-separated user IDs)
WHITELIST_USER_IDS=123456789

# Maximum output file size (bytes), default 100KB
# When command output exceeds Telegram message limit, it will be saved as a file
MAX_OUTPUT_FILE_SIZE=102400
```

### 3. Get Bot Token

1. Search `@BotFather` in Telegram
2. Send `/newbot` to create a new Bot
3. Follow the prompts to set the name and get the Token

### 4. Get Your User ID

1. Start the Bot first
2. Send `/info` command to the Bot
3. Check the returned `User ID` and add it to `WHITELIST_USER_IDS` in `.env`

### 5. Start Bot

```bash
npm start
# Or development mode (auto-restart)
npm run dev
```

## Commands

| Command | Description |
|---------|-------------|
| `/run <command>` | Execute command |
| `/alias add <alias> <command>` | Add command alias |
| `/alias list` | List all aliases |
| `/alias delete <alias>` | Delete alias |
| `/info` | Show chat info (get User ID) |
| `/start` | Start using |
| `/help` | Show help |

## Usage Examples

### Remote Command Execution

```
/run ls -la
/run df -h
/run docker ps
/run systemctl status nginx
```

### Command Aliases

Create aliases to simplify frequently used commands:

```
/alias add ll ls -la
/alias add dc docker-compose
/alias add dps docker ps
/alias add status systemctl status
```

Use aliases:

```
/run ll              # Executes ls -la
/run dc up -d        # Executes docker-compose up -d
/run dps             # Executes docker ps
```

### File Feature

- Send images/files to the Bot and they will be saved automatically
- `/list` to view saved files
- `/file <filename>` to retrieve a file

## Project Structure

```
telegram-bot/
├── src/
│   ├── index.js        # Main entry point
│   ├── commands.js     # Command handler module
│   └── fileHandler.js  # File handler module
├── data/aliases.json   # Alias storage
├── downloads/          # File storage directory
├── .env                # Environment configuration
└── package.json
```

## Custom Commands

Add custom commands in `src/index.js`:

```javascript
registerCommand('hello', 'Say hello', async (msg, args, bot) => {
  return `Hello, ${msg.from.first_name}!`;
});
```

## Notes

- Command execution timeout: 30 seconds
- Long output is automatically saved as a file (configurable via `MAX_OUTPUT_FILE_SIZE`)
- Both stdout and stderr are displayed
- **Always configure whitelist to prevent unauthorized access**

## License

MIT