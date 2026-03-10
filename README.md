# AIA Studio Lite 🎬⚙️

**AIA Studio Lite** es un conjunto de herramientas de preproducción de vídeo ligero y de ejecución local. Elimina todas las dependencias de IA y bases de datos pesadas del AIA Studio original, conservando únicamente el constructor central, un gestor de archivos jerárquico con soporte CRUD completo y un explorador de medios impulsado por FFmpeg.

> **Status: Grado Producción (Local)** — Optimizado para sesiones prolongadas de 12+ horas, proyectos de 5000+ escenas, y discos llenos. Puntuación de auditoría interna: **10/10** (entorno local monousuario).

## 👤 Autoría y Créditos
Este software ha sido desarrollado por **Pedro Pablo Miras**, integrante del equipo de **Aplica la IA**. 
👉 **Conoce más en nuestro Canal de YouTube**: [Aplica la IA](https://www.youtube.com/@Aplica_la_IA)

---

## ✨ Características Principales
- 🎬 **Constructor de Vídeo**: Escritura de guiones basada en línea de tiempo con tipos de plano, hablantes, secciones y exportación a DaVinci Resolve (XML, EDL, SRT).
- 📂 **Explorador de Archivos Jerárquico**: Navega, enlaza, renombra, elimina y arrastra archivos a carpetas mediante el Modal de Archivos Lite (respaldado por las API `/lite/files` y `/lite/files/*`).
- 🔗 **Apertura Contextual**: Al abrir el explorador desde una tarjeta con un archivo enlazado, el modal navega directamente a la carpeta principal del archivo.
- ◀▶ **Navegación por Profundidad**: Botones de avance/retroceso jerárquicos impulsados por `liteDeepestPath` — sin historial de pila, pura navegación de árbol.
- 🖼️ **Miniaturas Automáticas**: FFmpeg genera miniaturas JPEG de forma asíncrona para vídeos a resolución nativa (`-q:v 2`), cacheadas en `.lite_cache/`. El frontend realiza *polling* HTTP 202 con transiciones de aparición.
- 🎨 **Colores Neón por Tipo**: Los archivos enlazados en la línea de tiempo usan un tintado vibrante (verde para vídeo, azul para imagen, magenta para audio) vía selectores CSS `data-type`.
- 🚩 **Esquema de Línea de Tiempo (Outline)**: Panel lateral que lista todas las escenas con miniaturas, secciones, títulos y vistas previas del guion. Alternable con `Ctrl+Enter`. Usa selección **Zero-Flicker** (sin re-renderizado completo del DOM).
- 🗨️ **Diálogos Asíncronos Personalizados**: `sysDialog()` y `Modal.*` reemplazan los `alert`/`confirm`/`prompt` nativos por modales estilizados basados en Promesas.
- 💾 **Persistencia SQLite y Guardado Dual**: Almacenamiento relacional robusto (`aia_studio.db`) con autoguardado *debounced* de 3000ms. El guardado manual (`Ctrl+S`) fuerza una copia de seguridad.
- ⚠️ **Detección de Enlaces Rotos**: Verificación automática en segundo plano de archivos enlazados. Los archivos faltantes se marcan con un icono ⚠️ y tachado rojo.
- 🧹 **Recolección de Basura (Garbage Collection)**: Limpieza automática de miniaturas huérfanas al iniciar/apagar el servidor.
- ⚡ **Motor de Renderizado O(1)**: La búsqueda de nodos DOM mediante `Map` preconstruido elimina el cuello de botella O(n²) a gran escala. Prevención de fugas de memoria y límite de deshacer dinámico.
- ⌨️ **Atajos de Teclado (10/10)**: Sistema exhaustivo y protegido contra entradas accidentales para navegación, vista, gestión de escenas y modales (`Esc` como salida maestra).
- 📤 **Sistema de Exportación V3**: Modales unificados para TXT (diálogo) y MD (guion técnico) con casillas por hablante. Soporte FCPXML, Marcadores EDL y Subtítulos SRT.

## 📚 Documentación
- [Resumen de Arquitectura](docs/ARCHITECTURE.md)
- [Decisiones de Arquitectura](docs/ARCHITECTURE_DECISIONS.md)
- [Guía de Configuración](docs/SETUP.md)
- [Documentación API](docs/API.md)
- [Documentación Frontend](docs/FRONTEND.md)
- [Sistema de Exportación V3](docs/EXPORT_SYSTEM.md)

## 🚀 Inicio Rápido
1. **Instalar Dependencias**:
   ```bash
   pip install -r requirements.txt
   ```
2. **Ejecutar Studio**:
   ```bash
   python src/start_studio.py
   ```
3. **Configurar Ruta de Medios**: Haz clic en el botón 📁 en el pie de página de la app para establecer tu directorio de medios.

## ⚙️ Requisitos
- Python 3.8+
- FFmpeg instalado y disponible en el PATH (para generación de miniaturas y transcodificación de vídeo proxy).