document.addEventListener("DOMContentLoaded", () => {
  const navItems = document.querySelectorAll(".wz-nav__item");
  navItems.forEach((item) => {
    item.addEventListener("click", (event) => {
      navItems.forEach((nav) => nav.classList.remove("is-active"));
      event.currentTarget.classList.add("is-active");
    });
  });
});
