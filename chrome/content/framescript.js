function googleListener(event) {
  var doc = event.target;
  var uri = doc.documentURIObject;
  if (!(uri instanceof Components.interfaces.nsIStandardURL)) {
    return;
  }
  if (!/.*\.google\..*/.test(uri.host)) {
    return;
  }
  if (!uri.spec.match("btnI=1")) {
    return;
  }
  var firstresult = doc.querySelector(".g .r a");
  var url;
  if (firstresult.hasAttribute("data-href")) {
    url = firstresult.getAttribute("data-href");
  } else {
    url = firstresult.getAttribute("href");
  }
  doc.location = url;
}

addEventListener("DOMContentLoaded", googleListener, false);
addEventListener("unload", function() {
  removeEventListener("DOMContentLoaded", googleListener, false);
})