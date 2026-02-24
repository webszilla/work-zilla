(function () {
  const toggle = document.querySelector("[data-menu-toggle]");
  const body = document.body;
  if (toggle) {
    toggle.addEventListener("click", () => {
      body.classList.toggle("menu-open");
    });
  }
  const year = document.querySelector("[data-year]");
  if (year) {
    year.textContent = new Date().getFullYear();
  }
  const navLinks = document.querySelectorAll(".site-nav .nav-link");
  if (navLinks.length) {
    const path = window.location.pathname || "/";
    const productsDropdown = document.querySelector("[data-nav-dropdown]");
    const productsTrigger = productsDropdown ? productsDropdown.querySelector(".nav-dropdown-trigger") : null;
    navLinks.forEach((link) => {
      let hrefPath = "";
      try {
        hrefPath = new URL(link.getAttribute("href"), window.location.origin).pathname;
      } catch (error) {
        hrefPath = link.getAttribute("href") || "";
      }
      if (!hrefPath) return;
      if (hrefPath === "/" && path === "/") {
        link.classList.add("active");
        return;
      }
      if (hrefPath !== "/" && path.startsWith(hrefPath)) {
        link.classList.add("active");
        return;
      }
      if (hrefPath === "/ai-chatbot/" && path.startsWith("/products/ai-chatbot")) {
        link.classList.add("active");
      }
    });
    if (productsDropdown && productsTrigger && path.startsWith("/products/")) {
      productsTrigger.classList.add("active");
      if (window.innerWidth <= 980) {
        productsDropdown.classList.add("open");
        productsTrigger.setAttribute("aria-expanded", "true");
      }
    }
    if (productsDropdown && productsTrigger) {
      productsTrigger.addEventListener("click", (event) => {
        if (window.innerWidth > 980) return;
        event.preventDefault();
        const isOpen = productsDropdown.classList.toggle("open");
        productsTrigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
    }
  }
})();
