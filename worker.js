export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return Response.json({ error: "Método no permitido" }, { status: 405 });
    }

    // Solo acepta peticiones que traigan tu clave (la enviará Spring Boot)
    if (!env.WORKER_TOKEN || request.headers.get("X-Api-Token") !== env.WORKER_TOKEN) {
      return Response.json({ error: "No autorizado" }, { status: 401 });
    }

    let datos;
    try {
      datos = await request.json();
    } catch {
      return Response.json({ error: "JSON inválido" }, { status: 400 });
    }

    const { nombre, email, mensaje } = datos;
    if (!nombre || !email || !mensaje) {
      return Response.json({ error: "Faltan datos" }, { status: 400 });
    }

    // MODO PRUEBA: si todavía no hay API key, no envía nada
    if (!env.MAILGUN_API_KEY) {
      console.info(`Modo prueba. Mensaje de ${nombre} <${email}>`);
      return Response.json({
        mensaje: "Modo prueba: el Worker recibió el mensaje pero no se envió ningún correo",
      });
    }

    if (!env.MAILGUN_DOMAIN || !env.MAILGUN_FROM || !env.MAILGUN_TO) {
      console.error("Faltan variables en el Worker:", {
        MAILGUN_DOMAIN: !!env.MAILGUN_DOMAIN,
        MAILGUN_FROM: !!env.MAILGUN_FROM,
        MAILGUN_TO: !!env.MAILGUN_TO,
      });
      return Response.json({ error: "Configuración del Worker incompleta" }, { status: 500 });
    }

    try {
      // Mailgun usa autenticación Basic: usuario "api" y la API Key como contraseña
      const credenciales = btoa(`api:${env.MAILGUN_API_KEY}`);

      // Mailgun recibe formulario (no JSON)
      const formulario = new URLSearchParams({
        from: env.MAILGUN_FROM,
        to: env.MAILGUN_TO,
        subject: `Nuevo mensaje de ${nombre}`,
        text: `Nombre: ${nombre}\nCorreo: ${email}\n\nMensaje:\n${mensaje}`,
        "h:Reply-To": email,
      });

      const respuesta = await fetch(
        `https://api.mailgun.net/v3/${env.MAILGUN_DOMAIN}/messages`,
        {
          method: "POST",
          headers: { Authorization: `Basic ${credenciales}` },
          body: formulario,
        }
      );

      if (!respuesta.ok) {
        const detalle = await respuesta.text();
        console.error("Mailgun respondió:", respuesta.status, detalle);
        return Response.json({ error: "No se pudo enviar el correo" }, { status: 502 });
      }

      return Response.json({ mensaje: "Correo enviado correctamente" });
    } catch (err) {
      console.error("Error llamando a Mailgun:", err);
      return Response.json({ error: "No se pudo enviar el correo" }, { status: 502 });
    }
  },
};
