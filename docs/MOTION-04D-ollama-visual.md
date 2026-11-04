# MOTION-04D1 — ORBI Visual Texture AI con Qwen3.5 local (Ollama)

**Estado:** conector beta listo para pruebas de usuario en Windows; pendiente validación con FBX + texturas reales.

## Función

ORBI permite seleccionar una pieza/material existente, aislarla en dos vistas mediante renderizado local a WebGLRenderTarget y preparar una lámina con hasta 8 imágenes candidatas (PNG/JPG/WebP y DDS convertidas previamente). Estas dos imágenes se envían directamente del **navegador del usuario a su propia instancia Ollama** en \`http://127.0.0.1:11434/api/chat\`, usando el modelo visual \`qwen3.5:0.8b\`.

**No hay proxy ORBI/Vercel, ni base de datos, ni servidor remoto:** las imágenes no se envían a Gemini u otra API de pago. La conexión a Ollama es local y solo inicia al pulsar el botón; se puede cancelar. El modelo no recibe los archivos FBX/VRM originales ni sus animaciones; solo imágenes reducidas de las mallas y texturas. Ollama debe estar instalado y ejecutándose en el mismo equipo donde se abre ORBI.

**Límites y seguridad:** el modelo pequeño puede interpretar mal las piezas. Su respuesta es JSON restringido (índice 1–8 o ninguno), validada antes de mostrarla. Nunca se aplica ni reemplaza automáticamente una textura por recomendación de IA. El usuario revisa y confirma explícitamente; si hay un mapa previo debe autorizar su reemplazo. Los cambios pueden deshacerse mediante el sistema MOTION-04C. El modelo no puede verificar el ajuste UV, aunque la aplicación impide aplicar una textura a materiales sin UV.

## Puesta en marcha, Windows + PowerShell

1. Verifica que Ollama está abierto y el modelo está instalado:
   \`\`\`powershell
   ollama list
   ollama run qwen3.5:0.8b
   \`\`\`
   Si ya está descargado, NO hace falta volver a descargarlo. Comprueba que el nombre del tag corresponda al que figura en \`ollama list\`. Sal del chat interactivo con \`/bye\`.
2. Comprueba el servicio local desde PowerShell:
   \`\`\`powershell
   Invoke-RestMethod http://localhost:11434/api/tags | Select-Object -ExpandProperty models
   \`\`\`
3. Al abrir ORBI desde Vercel, el navegador tiene un **origen web distinto** de Ollama. Por seguridad, Ollama bloquea ese origen salvo que esté autorizado mediante \`OLLAMA_ORIGINS\`. En la propia interfaz abre «Ayuda de conexión en Windows» y copia el comando que contiene **exactamente el origen de la página que tienes abierta**. No utilices \`OLLAMA_ORIGINS=*\`, no publiques el puerto local y no ejecutes Ollama en \`0.0.0.0\` para esta integración.
4. En Windows, cierra Ollama desde el ícono de la bandeja (Salir/Quit), configura \`OLLAMA_ORIGINS\` como variable de entorno de usuario, y abre de nuevo Ollama. No basta cerrar PowerShell si Ollama continúa abierto.
5. Desde «Texturas inteligentes» carga tu FBX y su carpeta/ZIP de texturas. En «Qwen Visual · Ollama local» pulsa **Conectar Ollama**. La interfaz consulta \`GET /api/tags\` y solo muestra modelos instalados.
6. Selecciona el material/pieza y de 1 a 8 posibles texturas de color; pulsa **Analizar con Qwen**. Si la imagen es DDS, ORBI la descomprime y prepara una imagen liviana para la IA.
7. Comprueba la sugerencia, confirma o descártala. La asignación continúa siendo **revisada**, nunca automática. Utiliza «Deshacer lote» si deseas volver al aspecto anterior.

**Atención:** los navegadores actuales pueden requerir permiso para red local o impedir ciertas conexiones de una web HTTPS con servicios en HTTP local. Si aparece el mensaje de red/CORS pese a configurar el origen, prueba ORBI localmente en \`http://localhost:5173\` con \`npm install && npm run dev\`, manteniendo Ollama en \`http://127.0.0.1:11434\`. No se debe intentar resolver un bloqueo desprotegiendo el servidor Ollama.

## Alcance del piloto

- Validación automática de los modelos disponibles, sin inventar el tag.
- Captura temporal de material aislado, frontal y lateral, sin modificar la escena persistente.
- Imágenes reducidas y etiquetadas de las texturas candidatas; DDS compatible.
- Un material por consulta; sin concurrencia, para evitar cargar simultáneamente la laptop con GPU/CPU y WebGL.
- Selección de candidato o «ninguno», explicación y nivel de confianza *autodeclarado* por Qwen.
- Aplicación únicamente con confirmación humana y guardas de material existente, UV y rollback.

**Fuera del alcance:** generación de nuevos atlas UV, texture painting, autorigging, asignación correcta garantizada por visión, clasificación visual automática de cientos de piezas en un solo lote, servicios en nube, exposición de Ollama a la red pública.

Fuentes:
- https://ollama.com/library/qwen3.5
- https://docs.ollama.com/faq (OLLAMA_ORIGINS y Windows)
- https://docs.ollama.com/api/tags
- https://github.com/ollama/ollama/blob/main/docs/api.md (images en /api/chat)
