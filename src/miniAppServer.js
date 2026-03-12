/**
 * Mini App 服务器模块
 * 提供文件编辑器 Web 界面和 API
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 编辑会话存储 (token -> { filePath, createdAt, userId, initDataHash })
const editSessions = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 分钟超时

// 禁止访问的敏感路径（可通过环境变量配置）
const FORBIDDEN_PATHS = (process.env.FORBIDDEN_EDIT_PATHS || '')
  .split(',')
  .map(p => p.trim())
  .filter(p => p);

// 默认禁止的敏感文件
const DEFAULT_FORBIDDEN = [
  '/etc/shadow',
  '/etc/passwd',
  '/etc/sudoers',
  '.ssh/id_rsa',
  '.ssh/id_ed25519',
  '.env',
];

// 文件大小限制 (默认 10MB)
const MAX_FILE_SIZE = parseInt(process.env.MAX_EDIT_FILE_SIZE) || 10 * 1024 * 1024;

// 清理过期会话
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of editSessions) {
    if (now - session.createdAt > SESSION_TIMEOUT) {
      editSessions.delete(token);
    }
  }
}, 60000); // 每分钟清理一次

/**
 * 检查文件路径是否安全
 */
function isPathSafe(filePath) {
  const resolved = path.resolve(filePath);
  const normalized = resolved.toLowerCase();
  
  // 检查默认禁止列表
  for (const forbidden of DEFAULT_FORBIDDEN) {
    if (normalized.includes(forbidden.toLowerCase())) {
      return { safe: false, reason: `禁止访问敏感文件: ${forbidden}` };
    }
  }
  
  // 检查用户配置的禁止列表
  for (const forbidden of FORBIDDEN_PATHS) {
    if (normalized.includes(forbidden.toLowerCase())) {
      return { safe: false, reason: `禁止访问: ${forbidden}` };
    }
  }
  
  return { safe: true };
}

/**
 * 检查是否为文本文件
 */
function isTextFile(filePath) {
  const binaryExtensions = [
    '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp',
    '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.wav', '.flac',
    '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.sqlite', '.db', '.mdb',
  ];
  
  const ext = path.extname(filePath).toLowerCase();
  return !binaryExtensions.includes(ext);
}

/**
 * 创建编辑会话
 * @param {string} filePath - 文件路径
 * @param {number} userId - 用户ID
 * @returns {object} 会话信息 { token, initDataHash }
 */
function createSession(filePath, userId) {
  const token = crypto.randomBytes(32).toString('hex'); // 增加到 32 字节
  const initDataHash = crypto.randomBytes(16).toString('hex');
  
  editSessions.set(token, {
    filePath,
    userId,
    createdAt: Date.now(),
    initDataHash,
    used: false
  });
  
  return { token, initDataHash };
}

/**
 * 验证会话
 * @param {string} token - 会话 token
 * @param {number} userId - 用户ID
 * @returns {object|null} 会话信息或 null
 */
function validateSession(token, userId) {
  const session = editSessions.get(token);
  if (!session) return null;
  if (session.userId !== userId) return null;
  if (Date.now() - session.createdAt > SESSION_TIMEOUT) {
    editSessions.delete(token);
    return null;
  }
  return session;
}

/**
 * 验证 Telegram Mini App 初始化数据
 * 简化版本：验证 initDataHash 是否匹配
 */
function validateInitData(token, initDataHash) {
  const session = editSessions.get(token);
  if (!session) return false;
  return session.initDataHash === initDataHash;
}

/**
 * 创建并返回 Express 应用
 */
function createMiniAppServer(bot) {
  const app = express();
  
  // 中间件
  app.use(express.json({ limit: '50mb' }));
  
  // 安全头
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });
  
  // 静态文件
  app.use(express.static(path.join(__dirname, '../public')));
  
  // 获取文件内容 API
  app.get('/api/file', (req, res) => {
    const { token, hash } = req.query;
    
    // 验证 hash
    if (!hash || !validateInitData(token, hash)) {
      return res.status(401).json({ error: '请求验证失败' });
    }
    
    // 从 token 获取会话信息
    const session = editSessions.get(token);
    if (!session) {
      return res.status(401).json({ error: '会话无效或已过期' });
    }
    
    const filePath = path.resolve(session.filePath);
    
    // 检查路径安全性
    const pathCheck = isPathSafe(filePath);
    if (!pathCheck.safe) {
      return res.status(403).json({ error: pathCheck.reason });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    // 检查是否是文件
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: '不是有效的文件' });
    }
    
    // 检查文件大小
    if (stats.size > MAX_FILE_SIZE) {
      return res.status(413).json({ error: `文件过大，最大支持 ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB` });
    }
    
    // 检查是否为文本文件
    if (!isTextFile(filePath)) {
      return res.status(400).json({ error: '不支持编辑二进制文件' });
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      res.json({
        content,
        size: stats.size,
        modified: stats.mtime
      });
    } catch (err) {
      res.status(500).json({ error: '读取文件失败: ' + err.message });
    }
  });
  
  // 保存文件内容 API
  app.post('/api/file', (req, res) => {
    const { token, hash, content } = req.body;
    
    // 验证 hash
    if (!hash || !validateInitData(token, hash)) {
      return res.status(401).json({ error: '请求验证失败' });
    }
    
    // 从 token 获取会话信息
    const session = editSessions.get(token);
    if (!session) {
      return res.status(401).json({ error: '会话无效或已过期' });
    }
    
    const filePath = path.resolve(session.filePath);
    
    // 检查路径安全性
    const pathCheck = isPathSafe(filePath);
    if (!pathCheck.safe) {
      return res.status(403).json({ error: pathCheck.reason });
    }
    
    // 检查内容大小
    const contentSize = Buffer.byteLength(content, 'utf8');
    if (contentSize > MAX_FILE_SIZE) {
      return res.status(413).json({ error: `内容过大，最大支持 ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB` });
    }
    
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, content, 'utf8');
      const stats = fs.statSync(filePath);
      
      res.json({
        success: true,
        size: stats.size,
        modified: stats.mtime
      });
    } catch (err) {
      res.status(500).json({ error: '保存文件失败: ' + err.message });
    }
  });
  
  return app;
}

module.exports = {
  createMiniAppServer,
  createSession,
  validateSession,
  isPathSafe,
  isTextFile
};
