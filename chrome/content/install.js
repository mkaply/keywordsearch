const {
  classes: Cc,
  interfaces: Ci,
  utils: Cu
} = Components;
Cu.import("resource://gre/modules/Services.jsm");

function onLoad() {
  var doc = document;
  var menupopup = doc.getElementById("keywordsearch-searchengine");
  var engines = Services.search.getEngines();
  var menuitem = doc.createElement("menuitem");
  menuitem.setAttribute("label", "Choose a search engine");
  menuitem.setAttribute("value", "noengine");
  menuitem.setAttribute("class", "menuitem-iconic");
  menupopup.appendChild(menuitem);
  var menuitem = doc.createElement("menuitem");
  menuitem.setAttribute("label", "DuckDuckGo (Recommended)");
  menuitem.setAttribute("value", "DuckDuckGo");
  menuitem.setAttribute("image", "chrome://keywordsearch/skin/duckduckgo.png");
  menuitem.setAttribute("class", "menuitem-iconic");
  menupopup.appendChild(menuitem);
  for (var i = 0; i < engines.length; i++) {
    if (engines[i].name == "DuckDuckGo") {
      continue;
    }
    var menuitem = doc.createElement("menuitem");
    menuitem.setAttribute("label", engines[i].name);
    menuitem.setAttribute("value", engines[i].name);
    menuitem.setAttribute("image", engines[i].iconURI.spec);
    menuitem.setAttribute("class", "menuitem-iconic");
    menupopup.appendChild(menuitem);
  }
  var menuitem = doc.createElement("menuitem");
  menuitem.setAttribute("label", "DuckDuckGo (Recommended)");
  menuitem.setAttribute("value", "DuckDuckGo");
  menuitem.setAttribute("image", "chrome://keywordsearch/skin/duckduckgo.png");
  menuitem.setAttribute("class", "menuitem-iconic");
  menupopup.appendChild(menuitem);
  try {
    menupopup.parentNode.value = Services.prefs.getCharPref("extensions.keywordsearch.searchengine");
  } catch (ex) {
    menupopup.parentNode.value = "noengine";
  }
  menupopup.parentNode.addEventListener("command", function(event) {
    if (event.target.value == "noengine") {
      Services.prefs.clearUserPref("extensions.keywordsearch.searchengine");
    } else {
      Services.prefs.setCharPref("extensions.keywordsearch.searchengine", event.target.value);
    }
  }, false);
}