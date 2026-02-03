import { Request, Logger } from "#utils";

/**
 * 获取小说详情
 * @param {string} pid - 小说的ID
 * @returns {Promise<Object>} 包含小说标题和内容的对象
 * @throws {Error} 如果获取数据失败，抛出错误
 */
export async function novelsDetail(pid) {
  const url = `https://www.pixiv.net/ajax/novel/${pid}?lang=zh`;
  try {
    const response = await Request.request({ url });
    if (response.error) {
      throw new Error(response.message || '获取小说信息失败');
    }
    return { 
      title: response.body.title, 
      content: response.body.content,
      userName: response.body.userName
    };
  } catch (error) {
    Logger.error("获取小说信息失败:", error);
    throw error;
  }
}

/**
 * 获取小说系列详情
 * @param {string} pid - 小说系列的ID
 * @returns {Promise<Array>} 包含小说系列中每部小说的ID、标题和系列标题的数组
 * @throws {Error} 如果获取数据失败，抛出错误
 */
export async function seriesDetail(pid) {
  const url = `https://www.pixiv.net/ajax/novel/series_content/${pid}?lang=zh`;
  try {
    const response = await Request.request({ url });
    if (response.error) {
      throw new Error(response.message || '获取小说系列信息失败');
    }
    if (!Array.isArray(response.body.thumbnails.novel)) {
      response.body.thumbnails.novel = [response.body.thumbnails.novel];
    }
    return response.body.thumbnails.novel.map((item) => ({
      id: item.id,
      title: item.title,
      seriesTitle: item.seriesTitle,
    }));
  } catch (error) {
    Logger.error("获取小说系列信息失败:", error);
    throw error;
  }
}
