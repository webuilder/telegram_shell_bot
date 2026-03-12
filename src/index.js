require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { handleCommands, registerCommand } = require('./commands');
const { handleFileMessage, handlePhotoMessage, formatBytes } = require('./fileHandler');
const { createMiniAppServer, createSession } = require('./miniAppServer');

// 配置
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PROXY_URL = process.env.PROXY_URL;
const WHITELIST_USER_IDS = process.env.WHITELIST_USER_IDS
  ? process.env.WHITELIST_USER_IDS.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  : [];
const MAX_OUTPUT_FILE_SIZE = parseInt(process.env.MAX_OUTPUT_FILE_SIZE) || 102400; // 默认 100KB

// Mini App 配置
const MINI_APP_PORT = parseInt(process.env.MINI_APP_PORT) || 3000;
const MINI_APP_URL = process.env.MINI_APP_URL || `http://localhost:${MINI_APP_PORT}`;

// 别名存储
const ALIAS_FILE = path.join(__dirname, '../data/aliases.json');
let aliases = {};

// 加载别名
function loadAliases() {
  try {
    const dir = path.dirname(ALIAS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(ALIAS_FILE)) {
      aliases = JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('加载别名失败:', err);
    aliases = {};
  }
}

// 保存别名
function saveAliases() {
  try {
    const dir = path.dirname(ALIAS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(ALIAS_FILE, JSON.stringify(aliases, null, 2));
  } catch (err) {
    console.error('保存别名失败:', err);
  }
}

// 加载别名
loadAliases();

// 白名单检查函数
function isUserAllowed(userId) {
  // 如果白名单为空，允许所有用户
  if (WHITELIST_USER_IDS.length === 0) {
    return true;
  }
  return WHITELIST_USER_IDS.includes(userId);
}

// 拒绝消息处理
function handleUnauthorizedUser(bot, chatId, userId) {
  console.log(`拒绝未授权用户: ${userId}`);
  bot.sendMessage(chatId, '⛔ 抱歉，你没有权限使用此 Bot。');
}

if (!TOKEN) {
  console.error('错误: 请在 .env 文件中设置 TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

// 创建 Bot 实例，支持代理
let bot;
const botOptions = { polling: true };

if (PROXY_URL) {
  console.log(`使用代理: ${PROXY_URL}`);
  const agent = new HttpsProxyAgent(PROXY_URL);
  botOptions.request = { agent };
}

bot = new TelegramBot(TOKEN, botOptions);

console.log('Telegram Bot 已启动!');

// 启动 Mini App 服务器
const miniApp = createMiniAppServer(bot);
miniApp.listen(MINI_APP_PORT, () => {
  console.log(`Mini App 服务器已启动: ${MINI_APP_URL}`);
});

// 白名单状态
if (WHITELIST_USER_IDS.length > 0) {
  console.log(`白名单模式已启用，允许的用户ID: ${WHITELIST_USER_IDS.join(', ')}`);
} else {
  console.log('白名单未配置，允许所有用户访问');
}

// 注册默认命令
registerCommand('start', '开始使用机器人', async (msg, args) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || '用户';
  return `你好 ${userName}! 我是 Telegram Bot。\n\n使用 /help 查看可用命令。`;
});

registerCommand('help', '显示帮助信息', async (msg, args) => {
  return `🤖 *Bot 功能列表*\n\n` +
    `📝 *消息功能*\n` +
    `• 直接发送消息与我对话\n` +
    `• 我会回复你的每条消息\n\n` +
    `📷 *文件功能*\n` +
    `• 发送图片/文件，我会保存并回复\n` +
    `• 发送 /file <文件名> 获取已保存的文件\n` +
    `• 发送 /edit <文件名> 编辑文件\n\n` +
    `⚡ *命令列表*\n` +
    `• /start - 开始使用\n` +
    `• /help - 显示帮助\n` +
    `• /echo <文本> - 回显文本\n` +
    `• /run <命令> - 执行命令行 (支持别名)\n` +
    `• /alias add <别名> <命令> - 添加别名\n` +
    `• /alias list - 列出所有别名\n` +
    `• /alias delete <别名> - 删除别名\n` +
    `• /edit <文件名> - 编辑文件\n` +
    `• /file <文件名> - 获取文件\n` +
    `• /list - 列出已保存文件\n` +
    `• /info - 显示聊天信息 (用于获取用户ID)`;
});

registerCommand('echo', '回显文本 (用法: /echo <文本>)', async (msg, args) => {
  if (!args) return '请输入要回显的内容，例如: /echo 你好';
  return `📢 ${args}`;
});

registerCommand('file', '获取保存的文件 (用法: /file <文件名>)', async (msg, args, bot) => {
  const chatId = msg.chat.id;
  if (!args) return '请指定文件名，例如: /file document.pdf';
  
  const filePath = path.join(__dirname, '../downloads', args);
  if (!fs.existsSync(filePath)) {
    return `❌ 文件 "${args}" 不存在`;
  }
  
  try {
    await bot.sendDocument(chatId, filePath);
    return null; // 不发送额外文本
  } catch (err) {
    return `❌ 发送文件失败: ${err.message}`;
  }
});

registerCommand('list', '列出已保存的文件', async (msg, args) => {
  const downloadsDir = path.join(__dirname, '../downloads');
  const files = fs.readdirSync(downloadsDir).filter(f => f !== '.gitkeep');
  
  if (files.length === 0) {
    return '📁 暂无保存的文件';
  }
  
  return `📁 *已保存的文件 (${files.length} 个)*\n\n` + 
    files.map(f => `• ${f}`).join('\n');
});

registerCommand('info', '显示当前聊天信息', async (msg, args) => {
  const chat = msg.chat;
  const user = msg.from;
  
  let info = `📊 *聊天信息*\n\n`;
  info += `👤 用户: ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}\n`;
  info += `🆔 用户ID: \`${user.id}\`\n`;
  info += `💬 聊天ID: \`${chat.id}\`\n`;
  info += `📝 聊天类型: ${chat.type}\n`;
  if (user.username) info += `📧 用户名: @${user.username}\n`;
  if (user.language_code) info += `🌐 语言: ${user.language_code}\n`;
  
  return info;
});

registerCommand('edit', '编辑文件 (用法: /edit <文件名>)', async (msg, args, bot) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!args) {
    return '请指定要编辑的文件名，例如: /edit config.json\n\n使用 /list 查看可用文件。';
  }
  
  // 构建文件路径
  const fileName = args.trim();
  let filePath = path.join(__dirname, '../downloads', fileName);
  
  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    // 尝试在 data 目录中查找
    const dataFilePath = path.join(__dirname, '../data', fileName);
    if (fs.existsSync(dataFilePath)) {
      filePath = dataFilePath;
    } else {
      return `❌ 文件 "${fileName}" 不存在\n\n使用 /list 查看可用文件。`;
    }
  }
  
  // 创建编辑会话
  const token = createSession(filePath, userId);
  
  // 构建 Mini App URL
  const editorUrl = `${MINI_APP_URL}/editor.html?file=${encodeURIComponent(fileName)}&token=${token}&api=${MINI_APP_URL}`;
  
  try {
    // 发送带 Web App 按钮的消息
    await bot.sendMessage(chatId, `📝 编辑文件: ${fileName}`, {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '📝 打开编辑器',
            web_app: { url: editorUrl }
          }
        ]]
      }
    });
    return null;
  } catch (err) {
    return `❌ 打开编辑器失败: ${err.message}`;
  }
});

registerCommand('run', '执行命令行 (用法: /run <命令>)', async (msg, args, bot) => {
  const chatId = msg.chat.id;
  
  if (!args) {
    return '请输入要执行的命令，例如: /run ls -la';
  }
  
  // 检查是否是别名
  let actualCommand = args;
  if (aliases[args]) {
    actualCommand = aliases[args];
  }
  
  // 发送执行中提示
  const displayCmd = actualCommand === args ? args : `${args} → ${actualCommand}`;
  const waitingMsg = await bot.sendMessage(chatId, `⏳ 正在执行: \`${displayCmd}\``, { parse_mode: 'Markdown' });
  
  return new Promise((resolve) => {
    exec(actualCommand, { 
      timeout: 30000,  // 30秒超时
      maxBuffer: 10 * 1024 * 1024  // 10MB 输出缓冲
    }, async (error, stdout, stderr) => {
      // 删除等待消息
      bot.deleteMessage(chatId, waitingMsg.message_id).catch(() => {});
      
      if (error) {
        if (error.killed) {
          resolve(`❌ 命令执行超时 (30秒)`);
        } else {
          resolve(`❌ 执行失败:\n\`\`\`\n${error.message}\n\`\`\``);
        }
        return;
      }
      
      // 合并 stdout 和 stderr
      let output = '';
      if (stdout && stderr) {
        output = `=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}`;
      } else {
        output = stdout || stderr || '(无输出)';
      }
      const outputBytes = Buffer.byteLength(output, 'utf8');
      
      // Telegram 消息长度限制约 4096 字节
      if (outputBytes > 3500) {
        // 输出太长，保存为文件发送
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const fileName = `output_${timestamp}.txt`;
          const outputDir = path.join(__dirname, '../downloads');
          
          // 确保目录存在
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          const filePath = path.join(outputDir, fileName);
          
          // 限制文件大小
          let outputToSave = output;
          if (outputBytes > MAX_OUTPUT_FILE_SIZE) {
            // 需要截断到指定字节数
            outputToSave = Buffer.from(output, 'utf8').slice(0, MAX_OUTPUT_FILE_SIZE).toString('utf8');
            outputToSave += '\n\n... (输出已截断，达到文件大小限制)';
          }
          
          fs.writeFileSync(filePath, outputToSave, 'utf8');
          
          // 发送文件
          await bot.sendDocument(chatId, filePath, {
            caption: `✅ 执行成功，输出过长已保存为文件\n📊 大小: ${formatBytes(Buffer.byteLength(outputToSave, 'utf8'))}`
          });
          
          resolve(null); // 不发送额外文本
        } catch (err) {
          console.error('保存输出文件失败:', err);
          resolve(`❌ 保存输出文件失败: ${err.message}`);
        }
      } else {
        let prefix = '✅ 执行成功';
        if (stdout && stderr) {
          prefix = '✅ 执行成功 (含 stderr)';
        } else if (stderr && !stdout) {
          prefix = '⚠️ 命令输出 (stderr)';
        }
        resolve(`${prefix}:\n\`\`\`\n${output}\n\`\`\``);
      }
    });
  });
});

registerCommand('alias', '管理命令别名 (用法: /alias add|list|delete)', async (msg, args, bot) => {
  if (!args) {
    return `📋 *别名命令用法*\n\n` +
      `• /alias add <别名> <命令> - 添加别名\n` +
      `• /alias list - 列出所有别名\n` +
      `• /alias delete <别名> - 删除别名\n\n` +
      `示例:\n` +
      `/alias add ll ls -la\n` +
      `/alias add dc docker-compose`;
  }
  
  const parts = args.split(/\s+/);
  const subCommand = parts[0].toLowerCase();
  
  switch (subCommand) {
    case 'add': {
      if (parts.length < 3) {
        return '❌ 用法: /alias add <别名> <命令>\n示例: /alias add ll ls -la';
      }
      const aliasName = parts[1];
      const aliasCommand = parts.slice(2).join(' ');
      aliases[aliasName] = aliasCommand;
      saveAliases();
      return `✅ 别名已添加: \`${aliasName}\` → \`${aliasCommand}\``;
    }
    
    case 'list': {
      const aliasNames = Object.keys(aliases);
      if (aliasNames.length === 0) {
        return '📋 暂无别名';
      }
      let list = `📋 *别名列表 (${aliasNames.length} 个)*\n\n`;
      for (const [name, cmd] of Object.entries(aliases)) {
        list += `• \`${name}\` → \`${cmd}\`\n`;
      }
      return list;
    }
    
    case 'delete':
    case 'del':
    case 'remove':
    case 'rm': {
      if (parts.length < 2) {
        return '❌ 用法: /alias delete <别名>';
      }
      const aliasName = parts[1];
      if (!aliases[aliasName]) {
        return `❌ 别名 "${aliasName}" 不存在`;
      }
      const deletedCmd = aliases[aliasName];
      delete aliases[aliasName];
      saveAliases();
      return `✅ 别名已删除: \`${aliasName}\` (\`${deletedCmd}\`)`;
    }
    
    default:
      return `❌ 未知子命令: ${subCommand}\n可用: add, list, delete`;
  }
});

// 处理命令消息
bot.onText(/^\//, async (msg) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  // 白名单检查
  if (!isUserAllowed(userId)) {
    handleUnauthorizedUser(bot, chatId, userId);
    return;
  }
  
  await handleCommands(bot, msg);
});

// 处理普通文本消息
bot.on('message', async (msg) => {
  // 跳过命令消息
  if (msg.text && msg.text.startsWith('/')) return;
  
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // 白名单检查
  if (!isUserAllowed(userId)) {
    handleUnauthorizedUser(bot, chatId, userId);
    return;
  }
  
  // 处理图片
  if (msg.photo) {
    await handlePhotoMessage(bot, msg);
    return;
  }
  
  // 处理文件/文档
  if (msg.document) {
    await handleFileMessage(bot, msg);
    return;
  }
  
  // 处理其他文本消息
  if (msg.text) {
    const reply = `💬 收到你的消息: "${msg.text}"\n\n使用 /help 查看可用命令。`;
    bot.sendMessage(chatId, reply);
  }
});

// 错误处理
bot.on('polling_error', (error) => {
  console.error('Polling 错误:', error);
});

bot.on('error', (error) => {
  console.error('Bot 错误:', error);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n正在停止 Bot...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n正在停止 Bot...');
  bot.stopPolling();
  process.exit(0);
});

module.exports = bot;
