import Request from "./utils/request.js";
import {
  novelsDetail as Novel,
  seriesDetail as Novels,
} from "./pixiv/novels.js";
import { artworksDetail as ArtWorks } from "./pixiv/artworks.js";
import { refreshPixivToken as Token } from "./utils/getCookie.js";
export { Request, Novel, Novels, Token, ArtWorks };
