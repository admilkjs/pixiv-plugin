import Request from "./utils/request.js";
import {
  novelsDetail as Novel,
  seriesDetail as Novels,
} from "./pixiv/novels.js";
import {
  artworksUrl as ArtWorks,
  artworksInfo as ArtWorksInfo,
  relatedIllust as Related,
} from "./pixiv/artworks.js";
import getCookie from "./utils/getCookie.js";
import { usersInfo as User } from "./pixiv/users.js";
export {
  Request,
  Novel,
  Novels,
  getCookie,
  ArtWorks,
  ArtWorksInfo,
  User,
  Related,
};
