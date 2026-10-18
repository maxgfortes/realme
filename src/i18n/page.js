import { translateDocument } from "./i18n.js";
import { mountLanguageSelect, bindLanguageTriggers } from "./languagePicker.js";

translateDocument();
bindLanguageTriggers();

if (document.documentElement.hasAttribute("data-language-select")) mountLanguageSelect();

document.getElementById("i18n-pending")?.remove();
