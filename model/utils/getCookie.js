import { Request } from '#utils'
import moment from 'moment';
import md5 from 'md5';
import qs from 'qs';

const CLIENT_ID = 'MOBrBDS8blbauoSck0ZfDbtuzpyT';
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj';
const HASH_SECRET = '28c1fdd170a5204386cb1313c7077b34f83e4aaf4aa829ce78c231e05b0bae2c';

function getDefaultHeaders() {
  const datetime = moment().format();
  return {
    'X-Client-Time': datetime,
    'X-Client-Hash': md5(`${datetime}${HASH_SECRET}`),
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

/**
 * 通过 refreshToken 获取新的 cookie
 * @param {string} refreshToken - 刷新令牌
 * @returns {Promise<string>} 返回新的 cookie 字符串
 */
async function getCookie(refreshToken) {
  const data = qs.stringify({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    get_secure_url: true,
    include_policy: true,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  try {
    const response = await Request.request({
      method: 'POST',
      url: 'https://oauth.secure.pixiv.net/auth/token',
      data: data,
      headers: getDefaultHeaders()
    });

    const { access_token, refresh_token } = response;
    const cookie = `PHPSESSID=${access_token}; refresh_token=${refresh_token}`;

    logger.info('获取 Cookie 成功');
    return cookie;
  } catch (error) {
    logger.error('获取 Cookie 失败:', error.message);
    throw error;
  }
}

export default getCookie