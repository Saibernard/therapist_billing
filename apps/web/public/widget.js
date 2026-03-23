(function () {
  "use strict";

  var BOOKAI_HOST = "https://bookai.com";

  function init() {
    var containers = document.querySelectorAll("[data-bookai-slug]");
    containers.forEach(function (el) {
      var slug = el.getAttribute("data-bookai-slug");
      if (!slug) return;

      var iframe = document.createElement("iframe");
      iframe.src = BOOKAI_HOST + "/b/" + slug + "?embed=true";
      iframe.style.width = "100%";
      iframe.style.minHeight = "600px";
      iframe.style.border = "none";
      iframe.style.borderRadius = "12px";
      iframe.style.overflow = "hidden";
      iframe.setAttribute("loading", "lazy");
      iframe.setAttribute("title", "Book an appointment");

      el.innerHTML = "";
      el.appendChild(iframe);
    });

    var buttons = document.querySelectorAll("[data-bookai-button]");
    buttons.forEach(function (btn) {
      var slug = btn.getAttribute("data-bookai-button");
      if (!slug) return;

      btn.addEventListener("click", function () {
        var overlay = document.createElement("div");
        overlay.style.cssText =
          "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;";

        var modal = document.createElement("div");
        modal.style.cssText =
          "background:white;border-radius:16px;width:90%;max-width:500px;height:80vh;overflow:hidden;position:relative;";

        var close = document.createElement("button");
        close.textContent = "\u00D7";
        close.style.cssText =
          "position:absolute;top:12px;right:16px;font-size:24px;background:none;border:none;cursor:pointer;z-index:1;color:#666;";
        close.onclick = function () {
          document.body.removeChild(overlay);
        };

        var iframe = document.createElement("iframe");
        iframe.src = BOOKAI_HOST + "/b/" + slug + "?embed=true";
        iframe.style.cssText = "width:100%;height:100%;border:none;";

        modal.appendChild(close);
        modal.appendChild(iframe);
        overlay.appendChild(modal);
        overlay.onclick = function (e) {
          if (e.target === overlay) document.body.removeChild(overlay);
        };

        document.body.appendChild(overlay);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
