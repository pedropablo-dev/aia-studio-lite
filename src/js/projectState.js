// src/js/projectState.js
let currentProjectId = localStorage.getItem("aia_active_project") || "default_project";

export const ProjectState = {
    getId: () => currentProjectId,
    setId: (id) => {
        if (!id) throw new Error("Invalid Project ID");
        currentProjectId = id;
        localStorage.setItem("aia_active_project", id);
    }
};

window.ProjectState = ProjectState;
