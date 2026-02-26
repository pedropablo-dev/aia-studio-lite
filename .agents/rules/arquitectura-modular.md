---
trigger: always_on
---

# REGLAS ARQUITECTÓNICAS CRÍTICAS (MODULARIDAD OBLIGATORIA)

1. PROHIBICIÓN DE MONOLITOS: Tienes estrictamente prohibido crear o expandir archivos JavaScript que superen las 500 líneas de código.
2. PRINCIPIO DE RESPONSABILIDAD ÚNICA: Cada archivo debe hacer exactamente una cosa. Un archivo para manipulación del DOM, un archivo para llamadas a la API, un archivo para gestión de estado.
3. EXPORTACIÓN ESTRICTA: Usa módulos ES nativos (`import` / `export`). Se prohíbe inyectar lógica de negocio en el archivo `index.html` o `builder.html`.
4. ESTADO GLOBAL: Queda prohibida la creación de nuevas variables globales mutables (del tipo `let data = []` sueltas en el archivo). Todo estado debe estar encapsulado en un patrón de gestión o clase contenedora.
5. PROTOCOLO DE REFACTORIZACIÓN: Si el usuario te pide añadir una función a un archivo que ya es demasiado grande, tu primera acción obligatoria será detenerte y proponer extraer funciones existentes a un nuevo módulo antes de añadir la nueva funcionalidad.