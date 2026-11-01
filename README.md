# Consultora UX · Maryoris Martínez

Landing page responsive para consultorías UX individuales de 60 minutos, con formulario de contacto y notificación al correo **maryorism6@gmail.com**.

## ¿Qué incluye?

- HTML5 semántico, Bootstrap **5.3.6** incluido localmente (CSS y JS), CSS personalizado y JavaScript sin frameworks adicionales.
- Navegación móvil, progreso de lectura, entradas suaves, selección automática de servicio, acordeón FAQ, estados de envío y soporte de `prefers-reduced-motion`.
- Ilustraciones originales en `assets/img/`: `ux-studio.webp`, `discovery.svg`, `research.svg`, `handoff.svg`, `logo.svg`, `favicon.svg` y `social-cover.png`.
- Backend **Node.js 22+**, sin dependencias npm, que sirve la web y recibe `POST /api/contact`.
- Envío mediante **Resend HTTP API** al correo receptor configurado; el mensaje utiliza el email de la persona como `Reply-To`.
- Validación tanto en frontend como backend, honeypot antispam, límite de 5 solicitudes por 15 minutos/IP, límite de tamaño y lista permitida de orígenes para instalaciones frontend/backend separadas.
- Pruebas automatizadas con el test runner de Node.

**Importante:** el código está completo, pero el envío real requiere una **clave privada de Resend** válida. La clave nunca se incluye en el ZIP ni en `assets/js/config.js`. No se envió ningún email real durante las pruebas.

## Organización del proyecto

```text
consultora-ux/
├── index.html
├── privacidad.html
├── robots.txt
├── README.md
├── .gitignore
├── render.yaml
├── iniciar-local.ps1
├── assets/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── config.js
│   │   └── main.js
│   ├── img/
│   │   ├── favicon.svg
│   │   ├── logo.svg
│   │   ├── discovery.svg
│   │   ├── research.svg
│   │   ├── handoff.svg
│   │   ├── ux-studio.webp
│   │   └── social-cover.png
│   └── vendor/
│       └── bootstrap/
│           ├── bootstrap.min.css
│           ├── bootstrap.bundle.min.js
│           └── LICENSE.txt
└── backend/
    ├── .env.example
    ├── package.json
    ├── server.js
    └── tests/
        └── contact.test.js
```

## 1. Ejecutar en Windows 11 (PowerShell)

Instalá **Node.js 22 o superior**. Extraé el ZIP completo (sin mover archivos individualmente).

```powershell
cd "C:\Users\mayo_\Desktop\consultora-ux"
Copy-Item .\backend\.env.example .\backend\.env
notepad .\backend\.env
node --version
.\iniciar-local.ps1
```

Si PowerShell bloquea el `.ps1`, ejecutá sin cambiar políticas del sistema:

```powershell
cd .\backend
node server.js
```

Abrí **http://localhost:3000**. No hace falta ejecutar `npm install` porque el backend no tiene dependencias de terceros.

> **Aun sin configurar Resend** se puede navegar todo el sitio, pero el formulario mostrará que el correo no está configurado. Esto es intencional; nunca se simula un envío exitoso.

## 2. Hacer funcionar el correo (Resend)

1. Creá o ingresá a tu cuenta en **https://resend.com/**, idealmente usando `maryorism6@gmail.com` para hacer la primera prueba.
2. En **API Keys**, creá una clave y copiala.
3. Editá **`backend/.env`** y completá:

```dotenv
PORT=3000
CONTACT_TO=maryorism6@gmail.com
RESEND_API_KEY=TU_CLAVE_RESEND_AQUI
RESEND_FROM=Consultora UX <onboarding@resend.dev>
ALLOWED_ORIGINS=
TRUST_PROXY=false
```

4. Reiniciá el servidor (`Ctrl+C`, luego `node server.js`).
5. Enviá una solicitud real desde el formulario. Revisá la bandeja de entrada y Spam de `maryorism6@gmail.com`.

**Limitación de Resend en modo prueba:** el remitente `onboarding@resend.dev` está destinado a pruebas y se restringe al correo autorizado/propietario de la cuenta. Si `maryorism6@gmail.com` no es el correo autorizado de la cuenta, la API puede rechazar el mensaje. Para un uso público estable, **verificá un dominio de envío propio** en Resend y cambiá `RESEND_FROM` a algo como `Consultora UX <hola@tudominio.com>`. Es seguro seguir recibiendo las consultas en Gmail. No usar la contraseña personal de Gmail.

El backend envía un mensaje por solicitud, sin guardar consultas en base de datos. El proveedor de email y Gmail procesan los datos para efectuar la entrega; evaluá y adaptá tu aviso de privacidad antes de publicar ampliamente.

## 3. Tests automáticos

```powershell
cd "C:\Users\mayo_\Desktop\consultora-ux\backend"
npm test
```

Estos tests utilizan un proveedor de correo simulado **solo dentro de las pruebas** y cubren validación, escape HTML, rutas de imágenes, restricciones de acceso, formulario, spam, CORS, limitación de tráfico y errores. No envían correos reales.

Para verificar el servicio encendido:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

El atributo `emailConfigured` indica únicamente si existe una clave en el entorno, **no** si Resend aceptó un envío; la validación final consiste en enviar una solicitud de prueba real.

## 4. Publicar frontend + backend juntos en Render

**La forma más simple:** usar **una única URL** para la web y su API, de modo que `assets/js/config.js` mantenga `apiBaseUrl: ""`.

1. Subí el proyecto a un repositorio GitHub **sin** `backend/.env` (está excluido por `.gitignore`).
2. Creá un Web Service en Render, conectando ese repo, o usá el `render.yaml` provisto.
3. Configuración si lo hacés manualmente:
   - Runtime: Node.
   - Build command: `cd backend && npm install --omit=dev`.
   - Start command: `cd backend && node server.js`.
   - Health check: `/api/health`.
   - Variable `NODE_VERSION`: `22.16.0` o superior.
   - Variable `TRUST_PROXY`: `true`.
   - Variable `CONTACT_TO`: `maryorism6@gmail.com`.
   - Variables secretas `RESEND_API_KEY` y `RESEND_FROM`: valores de tu cuenta Resend.
4. Abrí la URL HTTPS que te entrega Render y probá el formulario.

**Render gratuito bloquea SMTP saliente en puertos 25, 465 y 587**, por eso esta entrega utiliza la API HTTPS de Resend, no SMTP directo a Gmail. Los planes gratuitos pueden entrar en reposo tras un periodo de inactividad; el primer acceso podría tardar más.

## 5. Opción: frontend en GitHub Pages + backend en Render

Si preferís mantener el sitio estático en GitHub Pages y usar Render solo para enviar correo:

1. Subí la web a GitHub Pages con `index.html` en la raíz del sitio publicado.
2. Publicá **también** el backend completo en Render, como se indica arriba.
3. Cambiá `assets/js/config.js` en el frontend estático:

```js
window.CONSULTORA_UX_CONFIG = Object.freeze({
  apiBaseUrl: "https://TU-BACKEND.onrender.com"
});
```

4. En las variables de entorno de Render, configurá `ALLOWED_ORIGINS` con el origen exacto (sin ruta) de tu GitHub Pages, por ejemplo `https://uxuimar.github.io`.
5. Probá una solicitud en el sitio publicado. No pongas `RESEND_API_KEY` en HTML, CSS, JS, GitHub Pages ni GitHub Actions públicas.

## 6. ¿Y Google Sites?

Google Sites no ejecuta servidores Node.js ni permite alojar esta aplicación como una web completa con backend dentro de Sites. Podés **mantener tu Google Sites actual y agregar un botón hacia la nueva landing publicada**, o redirigir a las personas a la nueva web. Esta instalación envía los formularios desde la nueva web y conserva el backend fuera de Sites.

## 7. Personalización

| Necesidad | Archivo |
|---|---|
| Textos, servicios, preguntas y campos | `index.html` |
| Colores, fuentes, tamaños y animaciones | `assets/css/styles.css` |
| Comportamiento del formulario y transiciones | `assets/js/main.js` |
| URL de la API en despliegues separados | `assets/js/config.js` |
| Imágenes del sitio | `assets/img/` |
| Información sobre uso de datos | `privacidad.html` |
| Formato del correo y reglas de validación | `backend/server.js` |
| Correo receptor, proveedor, CORS | `backend/.env` local / Variables en hosting |

El archivo `assets/img/social-cover.png` está listo para compartir en redes. Al definir una dirección pública y estable para el sitio, agregá en `index.html` los tags `og:image` y `og:url` con URLs **absolutas HTTPS** para que las plataformas puedan mostrar el preview.

**Fuentes:** la web usa Google Fonts si hay conexión; con el equipo sin conexión utiliza las fuentes de sistema. No se incluyen archivos de fuentes. El Bootstrap incluido localmente funciona sin conexión.

## 8. Seguridad y límites del MVP

- El formulario no incluye un sistema de cuentas, agenda, cobros, panel de mensajes, base de datos ni respuestas automáticas. Las consultas **llegan por email** para que Maryoris responda desde Gmail.
- Limitar solicitudes por IP y usar honeypot reduce spam básico, pero si el sitio crece conviene añadir CAPTCHA/Turnstile, rate limiting persistente (Redis) y un mecanismo de seguimiento de consultas.
- Revisá los textos de consentimiento, privacidad y política de tratamiento de datos antes de una campaña pública.
- Nunca publiques el archivo `.env` ni claves secretas. Si exponés una clave, revocala y creá otra.
- Las ilustraciones y gráficos originales del proyecto se entregan editables (SVG) u optimizados (WebP/PNG); **no incluyen una fotografía personal** ni testimonios inventados.
