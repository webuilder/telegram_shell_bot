/**
 * 文件和图片处理模块
 */

const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

const downloadsDir = path.join(__dirname, '../downloads');

// 代理配置
const PROXY_URL = process.env.PROXY_URL;
const proxyAgent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : null;

// 确保下载目录存在
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

/**
 * 处理图片消息
 * @param {TelegramBot} bot - Bot 实例
 * @param {Object} msg - 消息对象
 */
async function handlePhotoMessage(bot, msg) {
  const chatId = msg.chat.id;
  
  try {
    // 获取最大尺寸的图片 (数组最后一个)
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    
    bot.sendMessage(chatId, '📷 正在下载图片...');
    
    // 获取文件链接
    const fileLink = await bot.getFileLink(fileId);
    
    // 下载文件
    const fileName = `photo_${Date.now()}.jpg`;
    const filePath = path.join(downloadsDir, fileName);
    
    await downloadFile(fileLink, filePath);
    
    bot.sendMessage(chatId, `✅ 图片已保存!\n📁 文件名: ${fileName}\n📊 大小: ${formatBytes(photo.file_size || 0)}`);
    
    // 回复相同的图片
    await bot.sendPhoto(chatId, filePath, { 
      caption: '🖼️ 这是你发送的图片' 
    });
    
  } catch (error) {
    console.error('处理图片错误:', error);
    bot.sendMessage(chatId, `❌ 处理图片失败: ${error.message}`);
  }
}

/**
 * 处理文件/文档消息
 * @param {TelegramBot} bot - Bot 实例
 * @param {Object} msg - 消息对象
 */
async function handleFileMessage(bot, msg) {
  const chatId = msg.chat.id;
  const document = msg.document;
  
  try {
    const fileId = document.file_id;
    const fileName = document.file_name || `file_${Date.now()}`;
    
    bot.sendMessage(chatId, `📎 正在下载文件: ${fileName}...`);
    
    // 获取文件链接
    const fileLink = await bot.getFileLink(fileId);
    
    // 下载文件
    const filePath = path.join(downloadsDir, fileName);
    await downloadFile(fileLink, filePath);
    
    bot.sendMessage(chatId, 
      `✅ 文件已保存!\n` +
      `📁 文件名: ${fileName}\n` +
      `📊 大小: ${formatBytes(document.file_size || 0)}\n` +
      `📝 MIME类型: ${document.mime_type || '未知'}\n\n` +
      `使用 /file ${fileName} 可再次获取此文件。`
    );
    
  } catch (error) {
    console.error('处理文件错误:', error);
    bot.sendMessage(chatId, `❌ 处理文件失败: ${error.message}`);
  }
}

/**
 * 下载文件
 * @param {string} url - 文件 URL
 * @param {string} destPath - 目标路径
 */
async function downloadFile(url, destPath) {
  const https = require('https');
  const http = require('http');
  
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const file = fs.createWriteStream(destPath);
    
    // 使用代理请求选项
    const options = proxyAgent ? { agent: proxyAgent } : {};
    
    protocol.get(url, options, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // 处理重定向
        const redirectUrl = response.headers.location;
        file.close();
        fs.unlink(destPath, () => {});
        downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * 格式化字节数
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  handlePhotoMessage,
  handleFileMessage,
  downloadFile,
  formatBytes
};
