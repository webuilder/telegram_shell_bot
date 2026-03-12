/**
 * 自定义命令处理模块
 * 支持动态注册和执行命令
 */

// 命令注册表
const commands = new Map();

/**
 * 注册新命令
 * @param {string} name - 命令名称 (不含 /)
 * @param {string} description - 命令描述
 * @param {Function} handler - 命令处理函数 async (msg, args, bot) => string
 */
function registerCommand(name, description, handler) {
  commands.set(name, { description, handler });
  console.log(`命令已注册: /${name}`);
}

/**
 * 注销命令
 * @param {string} name - 命令名称
 */
function unregisterCommand(name) {
  return commands.delete(name);
}

/**
 * 获取所有已注册的命令
 */
function getCommands() {
  return Array.from(commands.entries()).map(([name, { description }]) => ({
    name,
    description
  }));
}

/**
 * 处理命令消息
 * @param {TelegramBot} bot - Bot 实例
 * @param {Object} msg - 消息对象
 */
async function handleCommands(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // 解析命令和参数
  const parts = text.split(/\s+/);
  const commandWithBot = parts[0]; // 如 /start@mybot
  const args = parts.slice(1).join(' ');
  
  // 提取命令名 (去掉 / 和 bot 名称)
  let commandName = commandWithBot.startsWith('/') 
    ? commandWithBot.slice(1) 
    : commandWithBot;
  
  // 处理 /command@botname 格式
  if (commandName.includes('@')) {
    commandName = commandName.split('@')[0];
  }
  
  // 查找命令
  const command = commands.get(commandName);
  
  if (!command) {
    bot.sendMessage(chatId, `❌ 未知命令: /${commandName}\n\n使用 /help 查看可用命令。`);
    return;
  }
  
  try {
    // 执行命令处理函数
    const result = await command.handler(msg, args, bot);
    
    // 如果返回文本，发送消息
    if (result) {
      await bot.sendMessage(chatId, result, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error(`命令 /${commandName} 执行错误:`, error);
    bot.sendMessage(chatId, `❌ 命令执行出错: ${error.message}`);
  }
}

module.exports = {
  registerCommand,
  unregisterCommand,
  getCommands,
  handleCommands
};
