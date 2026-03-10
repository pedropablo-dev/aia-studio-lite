# AIA Studio Lite 🎬⚙️

**AIA Studio Lite** es un conjunto de herramientas de preproducción de vídeo ligero y de ejecución local. Diseñado para la máxima eficiencia, esta versión conserva el constructor central, un gestor de archivos jerárquico con soporte CRUD completo y un explorador de medios impulsado por FFmpeg, eliminando dependencias pesadas para garantizar agilidad en entornos de producción.

## ✨ Características Principales
- 🎬 **Constructor de Vídeo**: Escritura de guiones basada en línea de tiempo con tipos de plano, hablantes y exportación a DaVinci Resolve (XML, EDL, SRT).
- 📂 **Explorador Jerárquico**: Navegación y gestión de archivos avanzada respaldada por una API de archivos lite.
- 🖼️ **Miniaturas Automáticas**: Generación asíncrona mediante FFmpeg con caché local en `.lite_cache/`.
- 🎨 **Interfaz Dinámica**: Sistema de colores neón por tipo de medio y panel lateral de escenas (Outline) alternable.
- 💾 **Persistencia SQLite**: Almacenamiento robusto con sistema de autoguardado *debounced* y copias de seguridad manuales.
- 📤 **Exportación V3**: Modales unificados para formatos TXT, MD, FCPXML y subtítulos SRT.

## 🚀 Inicio Rápido

1. **Clonar repositorio**:
   git clone https://github.com/aplica-la-ia/aia-studio-lite.git
   cd aia-studio-lite

2. **Instalar Dependencias**:
   pip install -r requirements.txt

3. **Ejecutar Studio**:
   python src/start_studio.py

## ⚙️ Requisitos
- **Python**: 3.8 o superior.
- **FFmpeg**: Debe estar instalado y disponible en el PATH del sistema para la generación de medios y proxies.

## 📚 Documentación Interna
- [Resumen de Arquitectura](docs/ARCHITECTURE.md)
- [Guía de Configuración](docs/SETUP.md)
- [Sistema de Exportación V3](docs/EXPORT_SYSTEM.md)

---

### 🤖 AI-Native Development & Methodology
Aunque **AIA Studio Lite** está diseñado para funcionar sin dependencias de IA en tiempo de ejecución, su código ha sido desarrollado íntegramente mediante **Vibecoding** y **Natural Language Programming**.

* **Arquitectura:** Pedro Pablo Miras para [@aplica-la-ia](https://github.com/aplica-la-ia).
* **Implementación:** La complejidad del motor de pre-producción y la integración con FFmpeg han sido resueltas mediante ingeniería de prompts técnicos.
* **Validación:** Supervisión humana para garantizar la escalabilidad del motor de renderizado O(1) y la prevención de fugas de memoria.

---
*Herramientas de pre-producción por @aplica-la-ia*