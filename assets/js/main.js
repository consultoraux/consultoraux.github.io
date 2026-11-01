(() => {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const motionAllowed = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const header = $("#site-header");
  const progress = $("#scroll-progress");
  const navCollapse = $("#navbarMain");
  const year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  // Navegación: indicador de lectura y cabecera discreta.
  let framePending = false;
  const paintScroll = () => {
    framePending = false;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = `${scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0}%`;
    header?.classList.toggle("is-scrolled", window.scrollY > 18);
  };
  window.addEventListener("scroll", () => {
    if (!framePending) {
      framePending = true;
      window.requestAnimationFrame(paintScroll);
    }
  }, { passive: true });
  paintScroll();

  // Animaciones progresivas: sin JS, el contenido queda completamente visible.
  if (motionAllowed && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-motion");
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px 50px 0px" });
    document.querySelectorAll("[data-reveal]").forEach((element) => revealObserver.observe(element));
  }

  // Navegación móvil: al seleccionar sección, cerramos el menú.
  document.querySelectorAll(".navbar-nav .nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (navCollapse?.classList.contains("show") && window.bootstrap?.Collapse) {
        window.bootstrap.Collapse.getOrCreateInstance(navCollapse).hide();
      }
    });
  });

  // Resaltamos la sección visible sin bloquear navegación por anclas.
  if ("IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        document.querySelectorAll(".navbar-nav .nav-link").forEach((link) => {
          const selected = link.getAttribute("href") === `#${entry.target.id}`;
          link.classList.toggle("active", selected);
          if (selected) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-28% 0px -60% 0px" });
    ["servicios", "como-funciona", "sobre-mi", "faq"].forEach((id) => {
      const section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });
  }

  // Botón de cada servicio: la opción aparece seleccionada en el formulario.
  const serviceInput = $("#servicio");
  document.querySelectorAll("[data-service]").forEach((link) => {
    link.addEventListener("click", () => {
      if (serviceInput) {
        serviceInput.value = link.dataset.service;
        serviceInput.classList.remove("is-invalid");
      }
    });
  });

  const form = $("#contact-form");
  if (!form) return;
  const submitButton = $("#submit-button");
  const spinner = $("#submit-spinner");
  const submitLabel = submitButton?.querySelector(".button-label");
  const submitIcon = submitButton?.querySelector(".icon");
  const status = $("#form-status");

  const showStatus = (message, type) => {
    if (!status) return;
    status.textContent = message;
    status.className = `form-status ${type ? `is-${type}` : ""}`;
  };
  const setLoading = (loading) => {
    submitButton.disabled = loading;
    submitButton.setAttribute("aria-busy", String(loading));
    spinner?.classList.toggle("d-none", !loading);
    submitIcon?.classList.toggle("d-none", loading);
    if (submitLabel) submitLabel.textContent = loading ? "Enviando solicitud…" : "Enviar mi solicitud";
  };

  form.querySelectorAll("input, select, textarea").forEach((field) => {
    field.addEventListener("input", () => {
      field.classList.remove("is-invalid");
      if (status?.classList.contains("is-error")) showStatus("", "");
    });
    field.addEventListener("change", () => field.classList.remove("is-invalid"));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showStatus("", "");
    let firstInvalid = null;
    form.querySelectorAll("[required], input[type='url']").forEach((field) => {
      const valid = field.checkValidity();
      field.classList.toggle("is-invalid", !valid);
      if (!valid && !firstInvalid) firstInvalid = field;
    });
    if (firstInvalid) {
      showStatus("Revisá los campos marcados antes de enviar.", "error");
      firstInvalid.focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    data.consent = data.consent === "yes";
    const configuredBase = (window.CONSULTORA_UX_CONFIG?.apiBaseUrl || "").trim().replace(/\/$/, "");
    const endpoint = `${configuredBase}/api/contact`;
    setLoading(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 429) throw new Error("Se alcanzó el límite de solicitudes. Probá nuevamente más tarde.");
        if (response.status === 503) throw new Error("El correo aún no está configurado. Intentá nuevamente más tarde.");
        if (response.status === 400) throw new Error("Hay un dato inválido. Revisá el formulario e intentá nuevamente.");
        throw new Error("No pudimos enviar tu solicitud. Intentá nuevamente en unos minutos.");
      }
      showStatus("¡Solicitud enviada! Gracias por escribirme. Te responderé a tu correo para coordinar los próximos pasos.", "success");
      form.reset();
      form.querySelectorAll(".is-invalid").forEach((field) => field.classList.remove("is-invalid"));
    } catch (error) {
      const isNetworkError = error instanceof TypeError;
      const networkMessage = "No fue posible conectar con el servidor. Si estás viendo la web como archivo local o en GitHub Pages, primero configurá el backend y su URL.";
      showStatus(isNetworkError ? networkMessage : error.message, "error");
    } finally {
      setLoading(false);
    }
  });
})();
