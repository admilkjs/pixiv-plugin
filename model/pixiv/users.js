import { Request, Logger } from "#utils";

/**
 * 获取用户信息
 * @param {string} uid - 用户ID
 * @returns {Promise<Object>} 用户信息对象
 * @throws {Error} 如果获取数据失败，抛出错误
 */
export async function usersInfo(uid) {
  const url = `https://www.pixiv.net/ajax/user/${uid}?full=1&lang=zh`;
  try {
    const response = await Request.request({ url });
    if (response.error) {
      throw new Error(response.message || '获取用户信息失败');
    }
    return response.body;
  } catch (error) {
    Logger.error("获取用户信息失败:", error);
    throw error;
  }
}
