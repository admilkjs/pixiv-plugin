import { Request } from '#utils'

/**
 * 刷新 Pixiv 的 access_token
 * @param {string} refreshToken - 使用的刷新令牌
 * @returns {Promise<Object>} 包含新的 access_token、refresh_token 和 expires_in 的对象
 * @throws {Error} 如果刷新 token 失败，抛出错误
 */
export async function refreshPixivToken (refreshToken) {
  try {
    const { data } = await Request.request({
      method: 'POST',
      url: 'https://oauth.secure.pixiv.net/auth/token',
      data: new URLSearchParams({
        client_id: 'MOBrBDS8blbauoSck0ZfDbtuzpyT',
        client_secret: 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj',
        grant_type: 'refresh_token',
        include_policy: 'true',
        refresh_token: refreshToken
      })
    })

    const { access_token: accessToken, refresh_token: newRefreshToken, expires_in: expiresIn } = data

    // 返回新的 token 信息
    return { accessToken, refreshToken: newRefreshToken, expiresIn }
  } catch (error) {
    logger.error('Error refreshing Pixiv token:', error.response ? error.response.data : error.message)
    throw error
  }
}
