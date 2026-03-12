/**
 * Mini App 服务器模块
 * 提供文件编辑器 Web 界面和 API
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 编辑会话存储 (token -> { filePath, createdAt, userId })
const editSessions = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 分钟超时

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
 * 创建编辑会话
 * @param {string} filePath - 文件路径
 * @param {number} userId - 用户ID
 * @returns {string} 会话 token
 */
function createSession(filePath, userId) {
  const token = crypto.randomBytes(16).toString('hex');
  editSessions.set(token, {
    filePath,
    userId,
    createdAt: Date.now()
  });
  return token;
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
 * 创建并返回 Express 应用
 */
function createMiniAppServer(bot) {
  const app = express();
  
  // 中间件
  app.use(express.json());
  
  // 静态文件
  app.use(express.static(path.join(__dirname, '../public')));
  
  // 获取文件内容 API
  app.get('/api/file', (req, res) => {
    const { token } = req.query;
    
    // 从 token 获取会话信息
    const session = editSessions.get(token);
    if (!session) {
      return res.status(401).json({ error: '会话无效或已过期' });
    }
    
    const filePath = path.resolve(session.filePath);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    // 检查是否是文件（不是目录）
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: '不是有效的文件' });
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
    const { token, content } = req.body;
    
    // 从 token 获取会话信息
    const session = editSessions.get(token);
    if (!session) {
      return res.status(401).json({ error: '会话无效或已过期' });
    }
    
    const filePath = path.resolve(session.filePath);
    
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
  validateSession
};