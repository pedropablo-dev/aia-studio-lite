// src/js/projectState.js
// Centraliza el estado del proyecto activo (Regla 4 y Regla 2)

let currentProjectId = "default_project";

export const ProjectState = {
    getId: () => currentProjectId,
    setId: (id) => {
        if (!id) throw new Error("Invalid Project ID");
        currentProjectId = id;
    }
};

// Fallback preventivo por si otros scripts legacy no-módulos necesitan leerlo alguna vez
window.ProjectState = ProjectState;
