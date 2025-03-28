import { Request, Logger } from "#utils";

/**
 * 获取插画链接
 * @param {string} pid - ID
 * @returns {Promise<Object>} 包含链接的对象
 * @throws {Error} 如果获取数据失败，抛出错误
 */
export async function artworksUrl(pid) {
  let url = `https://www.pixiv.net/ajax/illust/${pid}/pages`;
  try {
    const response = await Request.request({ url });
    if (response.error) throw new Error(response);
    if (!Array.isArray(response.body)) {
      response.body = [response.body];
    }
    return response.body.map((item) => {
      return {
        thumb_mini: item.urls.thumb_mini
          .replace("\\/", "/")
          .replace("i.pximg.net", "i.pixiv.re"),
        small: item.urls.small
          .replace("\\/", "/")
          .replace("i.pximg.net", "i.pixiv.re"),
        regular: item.urls.regular
          .replace("\\/", "/")
          .replace("i.pximg.net", "i.pixiv.re"),
        original: item.urls.original
          .replace("\\/", "/")
          .replace("i.pximg.net", "i.pixiv.re"),
      };
    });
  } catch (error) {
    Logger.error("Error fetching data:", error);
  }
}
export async function artworksInfo(pid) {
  let url = `https://www.pixiv.net/ajax/illust/${pid}`;
  try {
    const response = await Request.request({ url });
    if (response.error) throw new Error(response);
    if (!Array.isArray(response.body.tags.tags)) {
      response.body.tags.tags = [response.body.tags.tags];
    }
    let title = response.body.title;
    let createDate = response.body.createDate;
    let authorid = response.body.tags.authorId;
    let tags = response.body.tags.tags.map((item) => {
      return { tag: item.tag, en: item.translation?.en || null };
    });
    return {
      title,
      createDate,
      authorid,
      tags,
    };
  } catch (error) {
    Logger.error("Error fetching data:", error);
  }
}
export async function relatedIllust(pid) {
  let url = `https://www.pixiv.net/ajax/illust/${pid}/recommend/init?limit=20&lang=zh`;
  try {
    const response = await Request.request({ url });
    if (response.error) throw new Error(response);
    return response.body.illusts.length != 0 ? response.body : null;
  } catch (error) {
    Logger.error("获取相关插画失败", error);
  }
}
