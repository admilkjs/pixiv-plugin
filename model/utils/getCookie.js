import { Request } from "#utils";
/**
 * 刷新 Pixiv 的 access_token
 * @param {string} refreshToken - 使用的刷新令牌
 * @returns {Promise<Object>} - 包含 access_token, refresh_token, expires_in, newCookie
 */
export async function refreshPixivToken(refreshToken) {
  try {
    // 发起请求来刷新 token
    const { data, headers } = await Request.request({
      method: "POST",
      url: "https://oauth.secure.pixiv.net/auth/token",
      data: new URLSearchParams({
        client_id: "MOBrBDS8blbauoSck0ZfDbtuzpyT",
        client_secret: "lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj",
        grant_type: "refresh_token",
        include_policy: "true",
        refresh_token: refreshToken,
      }),
    });

    const {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_in: expiresIn,
    } = data;

    const newCookie = headers["set-cookie"]
      ? headers["set-cookie"].join("; ")
      : null;

    return { accessToken, refreshToken: newRefreshToken, expiresIn, newCookie };
  } catch (error) {
    logger.error(
      "Error refreshing Pixiv token:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}
