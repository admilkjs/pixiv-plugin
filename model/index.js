import Request from "./utils/request.js";
import {
  novelsDetail as Novel,
  seriesDetail as Novels,
} from "./novel/novels.js";
import {
  refreshPixivToken as Token,
} from "./utils/getCookie.js";
export { Request, Novel, Novels, Token };
