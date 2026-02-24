# ⚠️ DEPRECATED/HISTORICAL
**Superseded by v7.0 Architecture (Decoupled Storage). See `docs/ARCHITECTURE.md` for current specs.**

---

**AIA Video Builder** es una herramienta de pre-producción y escaleta técnica diseñada para creadores de contenido que necesitan puente entre la escritura de guion y la edición no lineal (NLE).

A diferencia de un editor de texto o una hoja de cálculo, esta herramienta es **"Time-Aware"** (consciente del tiempo) y **"Asset-Aware"** (consciente de los archivos). Su función principal es estructurar la narrativa visual, calcular tiempos precisos de locución y generar archivos de intercambio (XML, EDL, SRT) para software profesional como DaVinci Resolve.

### **Motor de Exportación XML (DaVinci Resolve)**

Este es el módulo más delicado. Utiliza la estrategia **V14.0 (Wrapped Nesting Strategy)**.

* **Problema Histórico:** DaVinci Resolve fallaba al sincronizar audio en clips consecutivos o desvinculaba (unlink) el audio del vídeo.  
* **Solución V14:**  
  * Se usa un contenedor \<clip\> padre que define la posición en la línea de tiempo global.  
  * Dentro, el \<video\> y el \<audio\> tienen un offset local reiniciado a 0s.  
  * El audio se anida *dentro* del vídeo para forzar el "Link" visual.  
  * **Regla de Oro:** Nunca usar coordenadas relativas complejas. Siempre encapsular en \<clip\>.

Para cualquier futura IA o desarrollador que modifique este código, estas son las directrices obligatorias:

1. **Inmutabilidad del XML V14:** No modificar la estructura de generación del XML de DaVinci (\<clip\>\<video\>...\</video\>\</clip\>) a menos que DaVinci cambie su especificación. Es frágil y está calibrada al milímetro.

### **Logs de Migración**

#### **v7.0 (Enero 2026): External Media Root**
*   **Problema Crítico:** El Language Server (Python/JS) colapsaba por "Stack Overflow" al intentar indexar carpetas `input/` y `proxies/` con terabytes de vídeo.
*   **Solución:** Desacoplamiento total.
    *   `src/utils.py` centraliza la lógica de rutas.
    *   Uso de `.env` con variable `AIA_MEDIA_ROOT`.
    *   Si no existe la variable, fallback a modo local (legacy). 
    *   **Resultado:** El IDE vuelve a ser fluido y la gestión de memoria del backend es independiente del volumen de datos almacenados.