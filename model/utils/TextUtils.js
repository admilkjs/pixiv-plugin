/**
 * 文本分段函数
 * @param {string} text - 待分段文本
 * @param {number} maxLength - 每段最大长度
 * @returns {Array<string>}
 */
export function splitText(text, maxLength = 1000) {
  if (!text || text.length <= maxLength) return [text];
  
  const segments = [];
  let currentSegment = '';
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (currentSegment.length + line.length + 1 > maxLength) {
      if (currentSegment) {
        segments.push(currentSegment.trim());
        currentSegment = '';
      }
      // 如果单行就超过最大长度，则按字符分割
      if (line.length > maxLength) {
        for (let i = 0; i < line.length; i += maxLength) {
          segments.push(line.slice(i, i + maxLength));
        }
      } else {
        currentSegment = line;
      }
    } else {
      if (currentSegment) currentSegment += '\n';
      currentSegment += line;
    }
  }
  
  if (currentSegment) {
    segments.push(currentSegment.trim());
  }
  
  return segments;
}

/**
 * 创建转发消息
 * @param {Object} e - 事件对象
 * @param {Array} messages - 消息列表
 * @param {string} title - 标题
 * @returns {Promise<any>}
 */
async function makeForwardMsg(e, messages, title) {
  const forwardMsg = messages.map(msg => ({
    message: msg,
    nickname: Bot?.nickname || "Pixiv-Plugin",
    user_id: Bot?.uin || e.self_id
  }));
  
  // 尝试多种转发消息方式
  if (global.common?.makeForwardMsg) {
    return await global.common.makeForwardMsg(e, forwardMsg, title);
  }
  if (typeof Bot?.makeForwardMsg === 'function') {
    return await Bot.makeForwardMsg(forwardMsg);
  }
  if (e.group?.makeForwardMsg) {
    return await e.group.makeForwardMsg(forwardMsg);
  }
  if (e.friend?.makeForwardMsg) {
    return await e.friend.makeForwardMsg(forwardMsg);
  }
  if (typeof segment !== 'undefined' && segment?.forward) {
    return segment.forward(forwardMsg);
  }
  
  // 回退：直接返回拼接的文本
  return `${title}\n${messages.join('\n')}`;
}

/**
 * 消息分段发送函数
 * @param {Object} e - 事件对象
 * @param {Array} messages - 消息列表
 * @param {string} title - 标题
 * @param {number} maxSegments - 每次最大发送数量
 */
export async function sendSegmentedMessages(e, messages, title, maxSegments = 5) {
  const totalMessages = messages.length;
  const numForwards = Math.ceil(totalMessages / maxSegments);
  
  for (let i = 0; i < numForwards; i++) {
    const start = i * maxSegments;
    const end = Math.min(start + maxSegments, totalMessages);
    const currentMessages = messages.slice(start, end);
    
    const msgx = await makeForwardMsg(e, currentMessages, `${title} (${i + 1}/${numForwards})`);
    await e.reply(msgx);
    
    // 如果不是最后一条消息，等待一下再发送下一条
    if (i < numForwards - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

export default { splitText, sendSegmentedMessages };
