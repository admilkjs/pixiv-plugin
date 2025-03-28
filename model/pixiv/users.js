import { Request, Logger } from "#utils";
export async function usersInfo(uid) {
  let url = `https://www.pixiv.net/ajax/user/${uid}?full=1&lang=zh`;
  try {
    const response = await Request.request({ url });
    if (response.error) throw new Error(response);
    return response.body;
  } catch (error) {
    Logger.error("获取用户信息失败", error);
  }
}
