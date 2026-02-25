# Commercial Roadmap — AIA Studio Lite

## Auditoría Técnica Hostil

> **Autor**: Auditor Técnico Automatizado
> **Fecha**: 2026-02-25
> **Objetivo**: Identificar todas las deficiencias que separan este código de un producto de grado empresarial (10/10).

---

## 1. Estado Actual — Análisis de Deficiencias

### 1.1 Arquitectura Monolítica Frontales

| Métrica | Valor |
|---------|-------|
| Líneas en `app.js` | **~5.400+** |
| Funciones globales | **~295** |
| Variables globales mutables | **~25+** (scenes, imageBank, selectedId, presetColors...) |
| Módulos JS (import/export) | **0** |
| Frameworks frontend | **0** |
| Tests unitarios frontend | **0** |
| Tests de integración | **0** |

**Diagnóstico**: Todo el frontend reside en un único archivo JavaScript de ~5.400 líneas sin modularización, sin bundler, sin tree-shaking, sin minificación. El estado global se muta directamente desde cualquier función. No existe ningún patrón de gestión de estado (Redux, signals, stores tipados). La función `render()` reconstruye la mayoría del DOM en actualizaciones de contenido — sin virtual DOM, sin diffing, sin keys. La selección de tarjetas usa **Zero-Flicker** (manipulación directa de clases), pero el resto de operaciones CRUD siguen dependiendo de `render()`.

**Impacto comercial**: Imposible asignar a múltiples desarrolladores. Imposible realizar revisiones de código productivas. Un cambio en cualquier zona puede romper otra zona sin detección automática.

### 1.2 Backend Síncrono y Bloqueante

| Métrica | Valor |
|---------|-------|
| Endpoints `async def` que ejecutan I/O bloqueante | **8+** |
| `subprocess.run()` sin `run_in_threadpool` | **3** (thumbnail, trim, sanitize) |
| `shutil.rmtree / shutil.move` sin threadpool | **6+** |
| Rate limiting | **0** |
| Autenticación/autorización | **0** |

**Diagnóstico**: FastAPI declara endpoints con `async def` pero ejecuta operaciones bloqueantes (FFmpeg subprocess, file I/O via shutil/os) directamente en el event loop. Bajo carga concurrente, **un solo trim o thumbnail pesado bloquea todas las requests pendientes**.

### 1.3 Seguridad

| Vector | Estado |
|--------|--------|
| CORS | Restringido a `localhost:9999`, `127.0.0.1:9999`, `null` |
| Path Traversal | `sanitize_filename` bloquea `..` y paths absolutos |
| Lite Write Guard | `_validate_lite_path()` confina escrituras al Media Root |
| `shutil.rmtree` sin confirmación de segundo factor | ⚠️ Un POST puede borrar árboles completos |
| Input validation | Pydantic models — correcto |
| DoS via rglob | ⚠️ `/lite/files?search=*` y `/raw-files` hacen rglob sin límite |
| FFmpeg command injection | ✅ No hay interpolación de strings en comandos |
| HTTPS | ❌ No soportado |
| CSRF | ❌ No protegido |

**Diagnóstico**: Para un producto local, la seguridad es aceptable. Para distribución comercial (especialmente en redes compartidas), la ausencia de HTTPS, CSRF, y autenticación es una vulnerabilidad crítica. El `rglob` sin límite en directorios con miles de archivos puede causar DoS.

### 1.4 Persistencia y Datos

| Aspecto | Estado |
|---------|--------|
| Base de datos | ❌ Ninguna |
| Persistencia de estado | LocalStorage (A/B slots, max ~5MB por navegador) |
| Imágenes | IndexedDB (no respaldable sin código custom) |
| Backup | JSON manual (`Ctrl+S`) |
| Migración de datos | ❌ No existe esquema versionado |
| Multi-usuario | ❌ Imposible (estado en localStorage del navegador) |

**Diagnóstico**: El estado del proyecto vive exclusivamente en el navegador del usuario. No hay servidor de datos, no hay sincronización, no hay colaboración. Si el usuario limpia datos del navegador, pierde todo excepto el último JSON guardado manualmente. Para un producto comercial, esto es inaceptable.

### 1.5 Rendimiento Frontend

| Factor | Estado |
|--------|--------|
| Re-renderizado completo (`innerHTML`) | Cada llamada a `render()` → ~800 líneas de template string |
| Virtual scrolling | ❌ No implementado en timeline principal |
| Lazy loading de thumbnails | ⚠️ Parcial (`loading="lazy"` en outline sidebar) |
| Debouncing de autosave | ✅ 2s debounce |
| Minificación | ❌ CSS y JS sin minificar |

**Diagnóstico**: Con 50+ escenas, cada `render()` genera ~50KB de HTML string, destruye el DOM y lo reconstruye (excepto selección, que usa Zero-Flicker). Los event listeners se re-crean en cada ciclo. El esquema lateral usa `blobCache` para evitar inyección de Base64, y miniaturas con `loading="lazy"`, pero el timeline principal sigue sin optimización.

### 1.6 Calidad de Código

| Aspecto | Estado |
|---------|--------|
| TypeScript | ❌ JavaScript puro sin tipos |
| Linting | ❌ Sin ESLint/Prettier |
| CI/CD | ❌ Sin pipeline |
| Documentación inline | ⚠️ Irregular — algunas funciones documentadas, otras no |
| Dead code | ⚠️ Funciones legacy coexisten con nuevas |
| Dual dialog system | ⚠️ `sysDialog()` y `Modal.*` coexisten sin justificación clara |

---

## 2. Brecha Comercial — Distance to 10/10

### Lo que falta para paquetizar como producto:

1. **Infraestructura de tests**: 0 tests es equivalente a 0 confianza en deploys. Cualquier refactor tiene riesgo de regresión total.
2. **Modularización del frontend**: ~5.400 líneas en un archivo es mantenimiento imposible a escala.
3. **Persistencia real**: LocalStorage no es una base de datos. Los usuarios perderán trabajo.
4. **Multi-plataforma**: Depende de Chrome App Mode con `shell=True` en Windows. No hay soporte nativo para macOS/Linux.
5. **Distribución**: No hay instalador, no hay contenedorización, no hay binario empaquetado.
6. **Marca y UX**: Sin onboarding, sin tooltips, sin documentación integrada in-app.
7. **Licenciamiento**: Sin modelo de licencia definido.

---

## 3. Roadmap Técnico — Priorizado por Criticidad

### 🔴 P0 — Crítico (Bloquea comercialización)

| # | Tarea | Impacto | Esfuerzo |
|---|-------|---------|----------|
| 1 | **Envolver I/O bloqueante en `run_in_threadpool`** | Elimina bloqueo del event loop bajo carga | Bajo (2h) |
| 2 | **Limitar `rglob`** con max_results + timeout | Previene DoS en directorios enormes | Bajo (1h) |
| 3 | **Modularizar `app.js`** en módulos ES6+ con bundler (Vite) | Habilita desarrollo paralelo y tree-shaking | Alto (3-5d) |
| 4 | **Implementar test suite mínimo** (Playwright e2e + pytest API) | Confianza en refactors, CI/CD posible | Medio (2-3d) |
| 5 | **Migrar persistencia a SQLite** (backend) + API de proyectos | Multi-usuario, backup automático, migraciones | Alto (5d) |

### 🟡 P1 — Importante (Mejora significativa de calidad)

| # | Tarea | Impacto | Esfuerzo |
|---|-------|---------|----------|
| 6 | **Virtual scrolling en timeline** | Soporte para 500+ escenas sin lag | Medio (2d) |
| 7 | **Unificar sistema de diálogos** (eliminar uno de los dos) | Reduce complejidad, un solo punto de mantenimiento | Bajo (3h) |
| 8 | **TypeScript migration** (gradual) | Detección de bugs en compile-time | Alto (progresivo) |
| 9 | **Lazy loading de thumbnails** (IntersectionObserver) | Reduce carga inicial de red | Bajo (2h) |
| 10 | **HTTPS + autenticación básica** (para redes compartidas) | Seguridad mínima de grado producción | Medio (1d) |

### 🟢 P2 — Mejora de producto (Diferenciación comercial)

| # | Tarea | Impacto | Esfuerzo |
|---|-------|---------|----------|
| 11 | **Empaquetado con Electron/Tauri** | Distribución como app nativa + auto-update | Alto (5d) |
| 12 | **CI/CD pipeline** (GitHub Actions: lint, test, build) | Calidad automatizada en cada commit | Medio (1d) |
| 13 | **Schema versionado** con migraciones automáticas | Compatibilidad entre versiones de proyecto | Medio (2d) |
| 14 | **Onboarding in-app** (tour guiado) | Reducir barrera de entrada para nuevos usuarios | Medio (2d) |
| 15 | **Internacionalización (i18n)** | Expansión a mercados non-Spanish | Medio (3d) |
| 16 | **Plugin system** para exportadores custom | Extensibilidad para integraciones de terceros | Alto (5d) |

---

## 4. Conclusión

AIA Studio Lite es un **prototipo funcional sólido** para uso personal. Resuelve un problema real (pre-producción de vídeo) con una UI coherente y un backend operativo.

Sin embargo, como **producto comercializable**, tiene una brecha significativa: 0 tests, 0 modularización, persistencia frágil, y un frontend monolítico de ~5.400 líneas que es un cuello de botella para cualquier equipo de desarrollo.

El roadmap propuesto ataca **primero la estabilidad** (P0: threadpool, tests, modularización), luego **la calidad de experiencia** (P1: virtual scroll, TypeScript, lazy load), y finalmente **la distribución** (P2: empaquetado, CI/CD, i18n).

Puntuación actual estimada: **5/10**.
Puntuación proyectada tras P0 completo: **7/10**.
Puntuación proyectada tras P0+P1: **8.5/10**.
