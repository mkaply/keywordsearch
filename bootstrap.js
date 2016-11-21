const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");

const XMLHttpRequest = Components.Constructor("@mozilla.org/xmlextras/xmlhttprequest;1");

var newAboutHome = true;
try {
  Cu.import("resource:///modules/AboutHome.jsm");
} catch (e) {
  newAboutHome = false;
}

var debug = false;

// This is required because addEngineWithDetails does not support chrome URLs for the icon
const ddgIcon = "data:image/x-icon;base64," +
"iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAABGdBTUEAALGPC/xhBQAAACBjSFJN" +
"AAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAB8lBMVEUAAADkRQzjPwPjQQXk" +
"RQ3iPwTiQQXgPQPeQgrcOwPVNgDVNQDWOgbTMwDRMgDQMwDSMwDRNwTQLgDRJgDSJwDSLgDSNwTj" +
"OgDiOADjOQDkPADhQAXzs5v+/fv////0vKbiRQvgPQHpdUr85NzuknPdKgDcIwDnZzj2w7HqeU/g" +
"PQLsimb/+PftjWn97Obpb0LdJQDeLQDtjmvsi2jgSBDnbULgOQD/39HgLQDeMgDpeFLgSBH0v670" +
"uqbaJQD2qImWvP/G1Ob5+/3u//+fvvXyp47dMwDaLwD0u6v0v6/aNQDiXi/aKQD3qozU7/8gSY2v" +
"vtg0ZK/OqLDaKQHYKgLgWTfaNADZMgDZMADZLADzqpD7//+xwdz//9H/5Bn/7Bn//ADofADYMADY" +
"MQDZOgPXLgDiZDj//97/0AD3tQDvlgHZOgbXLATXMADWMgDfXjLVLQD///z+0AD/3Rn/yRnwnQDc" +
"VjbVMQDyv67wuKTSJwDRHQD+8O/tg3/iQQDwhAHnawHWMADvtKfyva7XQxHga0bQGQD2vbH/u8LX" +
"IQCmPQzja07XQxLliGn99fPkcVHvhnGZ5VguvUU5wktBwCcAgxzydVv/8/XmiGngdlL+ysi3+I8L" +
"tCE80V6P3YmX4sDleljSNQLzr6D7sKPXNQTSIwAEAbMrAAAAF3RSTlMARqSkRvPz80PTpKRG3fPe" +
"3hio9/eoGP50jNsAAAABYktHRB5yCiArAAAAyElEQVQYGQXBvUqCYRiA4fu2V9Tn+UQddI3aCpxa" +
"OoU6iU4gcqqpoYbALXBuCuoYmttamqJDiEoh4YP+MOi6BNCh+uYKEGiOVNCXXxA2XDVV/UyfKbRC" +
"XTLQWAxbP2vt8Ue/uYDvfim91615sb2um6rqtrr/NFb1cUf1Ybd06areU6lSlYpK79jzK1SyJOkf" +
"hOl8JGEcqV5zoKrTRqO6yUzIzNu46ijdM1VV9bhuUJ/nZURExLRzUiPQm3kKXHi4BAEGOmOi78A/" +
"L1QoU/VHoTsAAAAldEVYdGRhdGU6Y3JlYXRlADIwMTQtMDEtMTlUMjA6MDE6MTEtMDU6MDAuET6c" +
"AAAAJXRFWHRkYXRlOm1vZGlmeQAyMDE0LTAxLTE5VDIwOjAxOjExLTA1OjAwX0yGIAAAAABJRU5E" +
"rkJggg==";

function errorCritical(error) {
  Components.utils.reportError(error.toString() + "\n\n" + error.stack);
  if (debug) {
    Services.prompt.alert(null, "", error.toString() + "\n\n" + error.stack);
  }
}

function generateSearchPluginsMenu(menupopup) {
  var doc = menupopup.ownerDocument;
  var engines = Services.search.getEngines();
  var menuitem = doc.createElement("menuitem");
  menuitem.setAttribute("label", "Default behavior");
  menuitem.setAttribute("value", "noengine");
  menuitem.setAttribute("class", "menuitem-iconic");
  menupopup.appendChild(menuitem);
  // Put DuckDuckGo as first in the list
  var menuitem = doc.createElement("menuitem");
  menuitem.setAttribute("label", "DuckDuckGo");
  menuitem.setAttribute("value", "DuckDuckGo");
  menuitem.setAttribute("image", "chrome://keywordsearch/skin/duckduckgo.png");
  menuitem.setAttribute("class", "menuitem-iconic");
  menupopup.appendChild(menuitem);
  for (var i=0; i < engines.length; i++) {
    if (engines[i].name == "DuckDuckGo") {
      continue;
    }
    var menuitem = doc.createElement("menuitem");
    menuitem.setAttribute("label", engines[i].name);
    menuitem.setAttribute("value", engines[i].name);
    if (engines[i].iconURI) {
      menuitem.setAttribute("image", engines[i].iconURI.spec);
    }
    menuitem.setAttribute("class", "menuitem-iconic");
    menupopup.appendChild(menuitem);
  }
  return menupopup;
}

var lastWebNav = null;
var lastWebNavFlags = 0;

var KeywordSearch = {
  observe: function observe(subject, topic, data) {
    switch (topic) {
      case "nsPref:changed":
        if (data == "extensions.keywordsearch.debug") {
          try {
            debug = Services.prefs.getBoolPref("extensions.keywordsearch.debug");
          } catch (ex) {
            debug = false;
          }
        }
        break;
      case "addon-options-displayed":
        try {
          // Refresh our engine list
          releaseSearchEngines();
          grabSearchEngines();
          var doc = subject;
          var menupopup = doc.getElementById("keywordsearch-searchengine");
          generateSearchPluginsMenu(menupopup);
          var menuitem = doc.createElement("menuitem");
          menuitem.setAttribute("label", "Custom...");
          menuitem.setAttribute("value", "custom");
          menuitem.setAttribute("class", "menuitem-iconic");
          menupopup.appendChild(menuitem);
          try {
            menupopup.parentNode.value = Services.prefs.getComplexValue("extensions.keywordsearch.searchengine",
                                                                        Ci.nsISupportsString).data;
          } catch (ex) {
            menupopup.parentNode.value = "noengine";
          }
          // Work around bug #903854
          menupopup.addEventListener("command", function(event) {
            var previousSearchEngine = null;
            try {
              previousSearchEngine = Services.prefs.getComplexValue("extensions.keywordsearch.searchengine",
                                                                    Ci.nsISupportsString).data;
            } catch (e) {}
            Services.tm.mainThread.dispatch(function() {
              if (event.originalTarget.value == "custom") {
                var input = {value: ""};
                try {
                  var url = Services.prefs.getCharPref("extensions.keywordsearch.url");
                  input.value = url;
                } catch (ex) {}
                var result = Services.prompt.prompt(doc.defaultView, "Custom search engine URL", "%s will be replaced by the serach term. Otherwise, the search term will be added at the end:", input, null, {});
                if (result && input.value) {
                  Services.prefs.setCharPref("extensions.keywordsearch.url", input.value);
                } else {
                  if (previousSearchEngine) {
                    var str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
                    str.data = previousSearchEngine;
                    Services.prefs.setComplexValue("extensions.keywordsearch.searchengine",
                                                   Components.interfaces.nsISupportsString,
                                                   str);
                    event.target.parentNode.parentNode.value = previousSearchEngine;
                  }
                }
              } else {
                var str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
                str.data = event.originalTarget.value;
                Services.prefs.setComplexValue("extensions.keywordsearch.searchengine",
                                               Components.interfaces.nsISupportsString,
                                               str);
              }
            }, Ci.nsIThread.DISPATCH_NORMAL);
          }, false);
          menupopup = doc.getElementById("keywordsearch-searchengine-abouthome");
          if (Services.appinfo.ID == "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}") {
            doc.querySelector("setting[pref='extensions.keywordsearch.searchengine.abouthome']").style.display = "none";
          } else {
            generateSearchPluginsMenu(menupopup);
            try {
              menupopup.parentNode.value = Services.prefs.getComplexValue("extensions.keywordsearch.searchengine.abouthome",
                                                                          Ci.nsISupportsString).data;
            } catch (ex) {
              menupopup.parentNode.value = "noengine";
            }
            // Work around bug #903854
            menupopup.addEventListener("command", function(event) {
              Services.tm.mainThread.dispatch(function() {
                var str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
                str.data = event.originalTarget.value;
                Services.prefs.setComplexValue("extensions.keywordsearch.searchengine.abouthome",
                                               Components.interfaces.nsISupportsString,
                                               str);
              }, Ci.nsIThread.DISPATCH_NORMAL);
            }, false);
          }
          menupopup = doc.getElementById("keywordsearch-searchengine-newtab");
          if (Services.appinfo.ID == "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}") {
            doc.querySelector("setting[pref='extensions.keywordsearch.searchengine.newtab']").style.display = "none";
          } else {
            generateSearchPluginsMenu(menupopup);
            try {
              menupopup.parentNode.value = Services.prefs.getComplexValue("extensions.keywordsearch.searchengine.newtab",
                                                                          Ci.nsISupportsString).data;
            } catch (ex) {
              menupopup.parentNode.value = "noengine";
            }
            // Work around bug #903854
            menupopup.addEventListener("command", function(event) {
              Services.tm.mainThread.dispatch(function() {
                var str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
                str.data = event.originalTarget.value;
                Services.prefs.setComplexValue("extensions.keywordsearch.searchengine.newtab",
                                               Components.interfaces.nsISupportsString,
                                               str);
              }, Ci.nsIThread.DISPATCH_NORMAL);
            }, false);
          }
          menupopup = doc.getElementById("keywordsearch-searchengine-contextmenu");
          generateSearchPluginsMenu(menupopup);
          try {
            menupopup.parentNode.value = Services.prefs.getComplexValue("extensions.keywordsearch.searchengine.contextmenu",
                                                                        Ci.nsISupportsString).data;
          } catch (ex) {
            menupopup.parentNode.value = "noengine";
          }
          // Work around bug #903854
          menupopup.addEventListener("command", function(event) {
            Services.tm.mainThread.dispatch(function() {
              var str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
              str.data = event.originalTarget.value;
              Services.prefs.setComplexValue("extensions.keywordsearch.searchengine.contextmenu",
                                             Components.interfaces.nsISupportsString,
                                             str);
            }, Ci.nsIThread.DISPATCH_NORMAL);
          }, false);
        } catch(e) {
          errorCritical(e);
        }
        break;
    }
  }
}

function onPageLoad(event) {
  var doc = event.target;
  if (!/about:home/.test(doc.location.href) && !/about:newtab/.test(doc.location.href))
    return;
  if (/about:home/.test(doc.location.href)) {
    var observer = new doc.defaultView.MutationObserver(function (mutations) {
      for (let mutation of mutations) {
        if (mutation.attributeName != "searchEngineURL" &&
            mutation.attributeName != "searchEngineName") {
          continue;
        }
        doc.defaultView.addEventListener("pagehide", function() {
          observer.disconnect();
        });
        var engine;
        try {
          var enginename = Services.prefs.getComplexValue("extensions.keywordsearch.searchengine.abouthome",
                                                              Ci.nsISupportsString).data;
          engine = Services.search.getEngineByName(enginename);
          // If the engine is set to DuckDuckGo, but it isn't installed, still use it
          if (!engine && enginename != "DuckDuckGo") {
            throw "";
          }
        } catch (ex) {
          // If we didn't get an engine, use the default behavior
          return;
        };
        var win = doc.defaultView;
        doc.getElementById("searchText").setAttribute("placeholder", enginename);
        doc.getElementById("searchLogoContainer").removeAttribute("hidden");
        if (engine) {
          if (engine.getIconURLBySize) {
            var logoURI = engine.getIconURLBySize(65, 26);
            var logoWidth = 65;
            var logoHeight = 26;
          } else {
            var logoURI = engine.iconURI.spec;
            var logoWidth = 16;
            var logoHeight = 16;
          }
        } else {
          var logoURI = ddgIcon;
          var logoWidth = 16;
          var logoHeight = 16;
        }
        var searchEngineLogo = doc.getElementById("searchIcon");
        if (!searchEngineLogo) {
          searchEngineLogo = doc.getElementById("searchEngineLogo");
          if (logoURI) {
            searchEngineLogo.setAttribute("src", logoURI);
          }
          if (logoWidth == 16) {
            searchEngineLogo.style.height = "16px";
            searchEngineLogo.style.width = "16px";
            searchEngineLogo.style.minWidth = "16px";
          }
        } else {
          searchEngineLogo.style.borderRadius = "0px";
          searchEngineLogo.style.borderColor = "transparent";
          searchEngineLogo.style.outline = "none";
          searchEngineLogo.setAttribute("title", engine.name);
          searchEngineLogo.setAttribute("onclick", "return false;");
          if (logoWidth == 65) {
            searchEngineLogo.style.backgroundImage = "url('" + logoURI + "')";
            searchEngineLogo.style.width = logoWidth + "px";
            searchEngineLogo.style.height = logoHeight + "px";
            searchEngineLogo.style.backgroundSize = logoWidth + "px " + logoHeight + "px";
          } else {
            searchEngineLogo.style.backgroundImage = "url('" + logoURI + "')";
            searchEngineLogo.style.height = "16px";
            searchEngineLogo.style.width = "16px";
            searchEngineLogo.style.minWidth = "16px";
            searchEngineLogo.style.backgroundSize = "16px 16px";
          }
        }
        style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
        style.setAttribute("type", "text/css");
        doc.getElementById("searchForm").appendChild(style);
        style.textContent = "#searchIcon:hover { background-color: inherit;}" +
                            "#searchIcon:focus { outline: 0;}";
      }
    });

    observer.observe(doc.documentElement, { attributes: true });
  }
  if (/about:newtab/.test(doc.location.href)) {
    var win = doc.defaultView;
    if (!win.gSearch) {
      return;
    }
    var engine;
    try {
      var enginename = Services.prefs.getComplexValue("extensions.keywordsearch.searchengine.newtab",
                                                          Ci.nsISupportsString).data;
      engine = Services.search.getEngineByName(enginename);
      // If the engine is set to DuckDuckGo, but it isn't installed, still use it
      if (!engine && enginename != "DuckDuckGo") {
        throw "";
      }
    } catch (ex) {
      // If we didn't get an engine, bail.
      return;
    };
    win.gSearch.onState = function() {
      this._initWhenInitalStateReceived();
    },
    win.gSearch.showPanel = function() {};
    win.gSearch.onCurrentState = function() {};
    win.gSearch.onCurrentEngine = function() {};
    var searchEngineLogo = doc.getElementById("newtab-search-logo");
    if (searchEngineLogo) {
      if (engine) {
        if (engine.getIconURLBySize) {
          var logoURI = engine.getIconURLBySize(65, 26);
          var logoWidth = 65;
        } else {
          var logoURI = engine.iconURI.spec;
          var logoWidth = 16;
        }
      } else {
        var logoURI = ddgIcon;
        var logoWidth = 16;
      }
      searchEngineLogo.setAttribute("title", enginename);
      searchEngineLogo.removeAttribute("hidden");
      if (logoWidth == 65) {
        searchEngineLogo.style.backgroundImage = "url('" + logoURI + "')";
        searchEngineLogo.style.width = logoWidth + "px";
        searchEngineLogo.style.backgroundSize = "auto";
      } else {
        searchEngineLogo.removeAttribute("style");
        if (logoURI) {
          searchEngineLogo.style.backgroundImage = "url('" + logoURI + "')";
          searchEngineLogo.style.height = "16px";
          searchEngineLogo.style.width = "16px";
          searchEngineLogo.style.minWidth = "16px";
          searchEngineLogo.style.backgroundSize = "16px 16px";
        }
      }
      style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
      style.setAttribute("type", "text/css");
      doc.getElementById("newtab-window").appendChild(style);
      style.textContent = "#newtab-search-logo:hover { border: inherit; background-color: inherit;}"
    }
    var engine;
    try {
      var enginename = Services.prefs.getComplexValue("extensions.keywordsearch.searchengine.newtab", Ci.nsISupportsString).data;
      engine = Services.search.getEngineByName(enginename);
    } catch(e) {
    }
    if (engine) {
      win.gSearch._setCurrentEngine(engine);
    } else {
      win.gSearch._setCurrentEngine(Services.search.currentEngine);
    }
  }
}

function contentAreaContextMenuShowing(event) {
  try {
    var enginename = Services.prefs.getComplexValue("extensions.keywordsearch.searchengine.contextmenu",
                                                    Ci.nsISupportsString).data;
    var engine = Services.search.getEngineByName(enginename);
    // If the engine is set to DuckDuckGo, but it isn't installed, still use it
    if (!engine && enginename != "DuckDuckGo") {
      return;
    }
    var doc = event.target.ownerDocument;
    var gContextMenu = doc.defaultView.gContextMenu;
    var gNavigatorBundle = doc.defaultView.gNavigatorBundle;
    var showSearchSelect = (gContextMenu.isTextSelected || gContextMenu.onLink) && !gContextMenu.onImage;
    if (showSearchSelect) {
      var menuItem = doc.getElementById("context-searchselect");
      var selectedText = gContextMenu.isTextSelected ? gContextMenu.textSelected : gContextMenu.linkText();

      // Store searchTerms in context menu item so we know what to search onclick
      menuItem.searchTerms = selectedText;

      // If the JS character after our truncation point is a trail surrogate,
      // include it in the truncated string to avoid splitting a surrogate pair.
      if (selectedText.length > 15) {
        let truncLength = 15;
        let truncChar = selectedText[15].charCodeAt(0);
        if (truncChar >= 0xDC00 && truncChar <= 0xDFFF)
          truncLength++;
        selectedText = selectedText.substr(0,truncLength) + gContextMenu.ellipsis;
      }

      // format "Search <engine> for <selection>" string to show in menu
      var menuLabel = gNavigatorBundle.getFormattedString("contextMenuSearch",
                                                          [enginename,
                                                           selectedText]);
      menuItem.label = menuLabel;
      menuItem.accessKey = gNavigatorBundle.getString("contextMenuSearch.accesskey");
    }
  } catch (e) {}
}

function loadIntoWindow(window) {
  if (!window || window.document.documentElement.getAttribute("windowtype") != "navigator:browser")
    return;

  let doc = window.document;
  var appcontent = doc.getElementById("appcontent");
  if (appcontent) {
    appcontent.addEventListener("pageshow", onPageLoad, false);
  }
  doc.getElementById("contentAreaContextMenu").addEventListener("popupshowing", contentAreaContextMenuShowing, false);
}
 
function unloadFromWindow(window) {
  if (!window || window.document.documentElement.getAttribute("windowtype") != "navigator:browser")
    return;

  var doc = window.document;
  var appcontent = doc.getElementById("appcontent");
  if (appcontent) {
    appcontent.removeEventListener("DOMContentLoaded", onPageLoad, false);
  }
  doc.getElementById("contentAreaContextMenu").addEventListener("popupshowing", contentAreaContextMenuShowing, false);
}
 
var windowListener = {
  onOpenWindow: function(aWindow) {
    // Wait for the window to finish loading
    let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);
    domWindow.addEventListener("load", function() {
      domWindow.removeEventListener("load", arguments.callee, false);
      loadIntoWindow(domWindow);
    }, false);
  },
  
  onCloseWindow: function(aWindow) {},
  onWindowTitleChange: function(aWindow, aTitle) {}
};


function startup(data, reason) {
  let globalMM = Cc["@mozilla.org/globalmessagemanager;1"].getService(Ci.nsIMessageListenerManager);
  globalMM.loadFrameScript("chrome://keywordsearch/content/framescript.js", true);
  try {
    debug = Services.prefs.getBoolPref("extensions.keywordsearch.debug");
  } catch (ex) {}
  Services.obs.addObserver(KeywordSearch, "addon-options-displayed", false);
  // Doing this at install is too early
  if (reason == 5) { // ADDON_INSTALL
    var win = Services.wm.getMostRecentWindow("navigator:browser");
    if (win) {
      win.openUILinkIn("chrome://keywordsearch/content/install.xul", "tab");
    }
  }

  // Load into any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    loadIntoWindow(domWindow);
  }
 
  // Load into any new windows
  Services.wm.addListener(windowListener);
  Services.prefs.addObserver("extensions.keywordsearch", KeywordSearch, false);
  var googleNCR = false;
  try {
    googleNCR  = Services.prefs.getBoolPref("extensions.keywordsearch.google.ncr");
  } catch (ex) {}
  if (googleNCR) {
    var request = new XMLHttpRequest();
    request.mozBackgroundRequest = true;
    request.open("GET", "https://www.google.com/ncr");
    request.send();
  }
  if (newAboutHome && !AboutHome.origReceiveMessage) {
    AboutHome.origReceiveMessage = AboutHome.receiveMessage;
    AboutHome.receiveMessage = function(aMessage) {
      if (aMessage.name != "AboutHome:OpenSearchPanel") {
        AboutHome.origReceiveMessage(aMessage);
        return;
      }
      try {
        var enginename = Services.prefs.getComplexValue("extensions.keywordsearch.searchengine.abouthome",
                                                        Ci.nsISupportsString).data;
        if (enginename == "noengine") {
          AboutHome.origReceiveMessage(aMessage);
        }
      } catch (e) {
        AboutHome.origReceiveMessage(aMessage);
      }
    };
  }

  if (Services.search.init && !Services.search.isInitialized) {
    Services.search.init(grabSearchEngines);
  } else {
    grabSearchEngines();
  }
}

// nsISearchSubmission
function Submission(aURI, aPostData = null) {
  this._uri = aURI;
  this._postData = aPostData;
}
Submission.prototype = {
  get uri() {
    return this._uri;
  },
  get postData() {
    return this._postData;
  },
  QueryInterface: function SRCH_SUBM_QI(aIID) {
    if (aIID.equals(Ci.nsISearchSubmission) ||
        aIID.equals(Ci.nsISupports))
      return this;
    throw Cr.NS_ERROR_NO_INTERFACE;
  }
}

/**
 * Wrapper function for nsIIOService::newURI.
 * @param aURLSpec
 *        The URL string from which to create an nsIURI.
 * @returns an nsIURI object, or null if the creation of the URI failed.
 */
function makeURI(aURLSpec, aCharset) {
  try {
    return NetUtil.newURI(aURLSpec, aCharset);
  } catch (ex) { }

  return null;
}

function grabSearchEngines() {
  var engines = Services.search.getEngines();
  for (var i=0; i < engines.length; i++) {
    // Work around bug where we didn't release search engines
    if (engines[i].wrappedJSObject._getSubmission) {
      engines[i].wrappedJSObject.getSubmission = engines[i].wrappedJSObject._getSubmission;
      delete(engines[i].wrappedJSObject._getSubmission);
    }
    engines[i].wrappedJSObject._getSubmission = engines[i].wrappedJSObject.getSubmission;
    engines[i].wrappedJSObject.getSubmission = function(aData, aResponseType, aPurpose) {
      if (aPurpose == "keyword") {
        // Hacky code to detect search keywords
        var win = Services.wm.getMostRecentWindow("navigator:browser");
        var value = win.document.getElementById("urlbar").value;
        if (value.startsWith("moz-action:searchengine")) {
          value = value.replace("moz-action:searchengine,", "");
          var searchInfo = '';
          try {
            searchInfo = JSON.parse(value);
          } catch(e) {}
          input = decodeURIComponent(searchInfo.input);
          let offset = input.indexOf(" ");
          if (offset > 0) {
            keyword = input.substr(0, offset);
            let engine = Services.search.getEngineByAlias(keyword);
            if (engine) {
              return this._getSubmission(aData, aResponseType, aPurpose);
            }
          }
        } else {
          if (aResponseType == null) {
            return this._getSubmission(aData, aResponseType, aPurpose);
          }
        }
      }
      switch (aPurpose) {
        case "keyword":
        case "contextmenu":
        case "homepage":
        case "newtab":
          var engine;
          var enginename;
          var preference = "extensions.keywordsearch.searchengine";
          if (aPurpose == "contextmenu") {
            preference = "extensions.keywordsearch.searchengine.contextmenu";
          } else if (aPurpose == "homepage") {
            preference = "extensions.keywordsearch.searchengine.abouthome";
          } else if (aPurpose == "newtab") {
            preference = "extensions.keywordsearch.searchengine.newtab";
          }
          try {
            enginename = Services.prefs.getComplexValue(preference, Ci.nsISupportsString).data;
            if (aPurpose == "keyword" && enginename == "custom") {
              var url = Services.prefs.getCharPref("extensions.keywordsearch.url");
              if (url.indexOf("%s") > -1) {
                url = url.replace("%s", aData);
              } else {
                url = url + aData;
              }
              return new Submission(makeURI(url), null);
            } else {
              engine = Services.search.getEngineByName(enginename);
              if (!engine && enginename != "DuckDuckGo") {
                engine = Services.search.currentEngine;
              }
            }
          } catch(e) {
            // Only use the default if they haven't selected DuckDuckGo in the extension
            if (enginename != "DuckDuckGo") {
              engine = Services.search.currentEngine;
            }
          }
          if (engine) {
            var submission = engine.wrappedJSObject._getSubmission(aData, aResponseType, aPurpose);
            if (aPurpose == "keyword" && aData && submission && /www\.google\./.test(submission.uri.host)) {
              try {
                var googlefeatures = Services.prefs.getCharPref("extensions.keywordsearch.google");
                var submissionURL = submission.uri.spec;
                switch (googlefeatures) {
                  case "lucky":
                    submissionURL += "&btnI=1";
                    break;
                  case "browsebyname":
                    submissionURL += "&sourceid=navclient&gfns=1";
                    break;
                }
                return new Submission(makeURI(submissionURL), submission.postData);
              } catch (ex) {
                return submission;
              }
            } else if (aData && submission && submission.uri.host == "duckduckgo.com") {
              var submissionURL = submission.uri.spec;
              try {
                if (aPurpose == "keyword") {
                  var ddgfeatures = Services.prefs.getCharPref("extensions.keywordsearch.duckduckgo");
                  switch (ddgfeatures) {
                    case "ducky":
                      submissionURL = submissionURL.replace("q=", "q=\\");;
                      break;
                  }
                }
              } catch (e) {}
              // Per our agreement with DuckDuckGo, if a DuckDuckGo search doesn't have an affiliate,
              // we can add ours.
              var noAffiliate = true;
              submission.uri.QueryInterface(Ci.nsIURL)
              var queries = submission.uri.query.split("&");
              for (var i=0; i < queries.length;i++) {
                var query = queries[i].split("=");
                if (query[0] == "t"){
                  noAffiliate = false;
                }
              }
              if (noAffiliate) {
                submissionURL += "&t=keywordsearch";
              } else {
                // Also, if the default search engine is NOT DuckDuckGo, we take the search since it routed
                // through our extension.
                if (Services.search.currentEngine.name != "DuckDuckGo") {
                  submissionURL = submissionURL.replace("t=ffab", "t=keywordsearch")
                                               .replace("t=ffcm", "t=keywordsearch")
                                               .replace("t=ffhp", "t=keywordsearch")
                                               .replace("t=ffnt", "t=keywordsearch")
                }
              }
              return new Submission(makeURI(submissionURL), submission.postData);
            }
            return submission;
          } else {
            // Somehow DuckDuckGo is not installed, but they still have it selected. Use it.
            return new Submission(makeURI("https://duckduckgo.com/?t=keywordsearch&q=" + aData), null);
          }
          break;
      }
      return this._getSubmission(aData, aResponseType, aPurpose);
    }
  }
}

function releaseSearchEngines() {
  var engines = Services.search.getEngines();
  for (var i=0; i < engines.length; i++) {
    if (engines[i].wrappedJSObject._getSubmission) {
      engines[i].wrappedJSObject.getSubmission = engines[i].wrappedJSObject._getSubmission;
      delete(engines[i].wrappedJSObject._getSubmission);
    }
  }
}

function shutdown(aData, aReason) {
  // When the application is shutting down we normally don't have to clean
  // up any UI changes made
  if (aReason == APP_SHUTDOWN)
    return;
 
  Services.obs.removeObserver(KeywordSearch, "addon-options-displayed", false);
  // Stop listening for new windows
  Services.wm.removeListener(windowListener);

  // Unload from any existing windows
  let windows = Services.wm.getEnumerator("navigator:browser");
  while (windows.hasMoreElements()) {
    let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
    unloadFromWindow(domWindow);
  }
  Services.prefs.removeObserver("extensions.keywordsearch", KeywordSearch, false);
  if (newAboutHome && AboutHome.origReceiveMessage) {
    AboutHome.receiveMessage = AboutHome.origReceiveMessage;
    delete(AboutHome.origReceiveMessage);
  }
  releaseSearchEngines();
}
 
function install(data, reason) {
  if (reason == 5) { // ADDON_INSTALL
    if (Services.search.init && !Services.search.isInitialized) {
      Services.search.init(function() {
        try {
          Services.search.addEngineWithDetails("DuckDuckGo", ddgIcon, "", "Search DuckDuckGo (SSL) - Keyword Search", "get", "https://duckduckgo.com/?t=keywordsearch&q={searchTerms}");
        } catch (ex) {
          // If they already had DuckDuckGo installed, just ignore the error
        }
      });
    } else {
      try {
        Services.search.addEngineWithDetails("DuckDuckGo", ddgIcon, "", "Search DuckDuckGo (SSL) - Keyword Search", "get", "https://duckduckgo.com/?t=keywordsearch&q={searchTerms}");
      } catch (ex) {
        // If they already had DuckDuckGo installed, just ignore the error
      }
    }
  } else if (reason == 7) { //ADDON_UPGRADE
    // Migrate previous lucky preference
    if (Services.prefs.prefHasUserValue("extensions.keywordsearch.lucky")) {
      var lucky = Services.prefs.getBoolPref("extensions.keywordsearch.lucky");
      if (lucky) {
        Services.prefs.setCharPref("extensions.keywordsearch.google", "lucky");
      }
      Services.prefs.clearUserPref("extensions.keywordsearch.lucky");
    }
  }
}

function uninstall(data, reason) {
  if (reason == 6) { // ADDON_UNINSTALL
    try {
      var engine = Services.search.getEngineByName("DuckDuckGo");
      // If we added the engine, remove it
      if (engine && engine.description == "Search DuckDuckGo (SSL) - Keyword Search") {
        Services.search.removeEngine(engine);
      }
    } catch (ex) {}
  }
}
