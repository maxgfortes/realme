import {
  renderUsername, renderName, renderVerified, renderPronouns, renderPfp, renderBanner, renderBio,
} from "./profileHeader.js";
import { renderLinks } from "./links.js";
import { renderAboutMenu } from "./aboutRender.js";
import { renderStats } from "./profileStats.js";

export function renderProfile(data) {
  renderUsername(data.user);
  renderName(data.user);
  renderVerified(data.user);
  renderPfp(data.media);
  renderBanner(data.media);
  renderPronouns(data.about);
  renderBio(data.moreInfos);
  renderLinks(data.links);
  renderAboutMenu();
  renderStats(data.stats);
}
