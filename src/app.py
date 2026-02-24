import os

# SILENCE TENSORFLOW & KERAS WARNINGS
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'  # 0=All, 1=Filter INFO, 2=Filter WARNING, 3=Filter ERROR

import streamlit as st
import chromadb
import chromadb.utils.embedding_functions as embedding_functions
import sys

# Configuración de página
st.set_page_config(page_title="AI Media Manager", layout="wide")

# Rutas
DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'db_storage'))

@st.cache_resource
def get_db_collection():
    """
    Conecta a la DB y cachea la conexión para no recargarla en cada interacción.
    """
    if not os.path.exists(DB_PATH):
        st.error(f"Base de datos no encontrada en: {DB_PATH}")
        return None
        
    try:
        client = chromadb.PersistentClient(path=DB_PATH)
        embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
        collection = client.get_collection(name="video_metadata", embedding_function=embedding_fn)
        return collection
    except Exception as e:
        st.error(f"Error conectando a ChromaDB: {e}")
        return None

def main():
    st.title("AI Media Search 🔍")
    st.markdown("Busca en tu librería de videos usando *lenguaje natural*.")
    
    collection = get_db_collection()
    if not collection:
        return

    # Buscador
    query = st.text_input("¿Qué quieres encontrar hoy?", placeholder="Ej: mujer cocinando, tutorial de python...")

    if query:
        st.markdown("---")
        st.subheader(f"Resultados para: '{query}'")
        
        try:
            results = collection.query(
                query_texts=[query],
                n_results=5
            )
            
            ids = results['ids'][0]
            metadatas = results['metadatas'][0]
            distances = results['distances'][0]
            
            if not ids:
                st.warning("No se encontraron videos relevantes.")
            
            for i in range(len(ids)):
                video_id = ids[i]
                meta = metadatas[i]
                dist = distances[i]
                path = meta.get('path')
                vision = meta.get('vision', 'N/A')
                audio = meta.get('audio', 'N/A')
                
                # Similitud (convertir distancia a score aproximado)
                score = max(0, 1 - dist)
                
                # Layout de resultados
                col1, col2 = st.columns([1, 1.5])
                
                with col1:
                    if os.path.exists(path):
                        st.video(path)
                    else:
                        st.error(f"Archivo no encontrado: {path}")
                        
                with col2:
                    st.markdown(f"### {video_id}")
                    st.caption(f"Similitud: {score:.2f}")
                    st.markdown(f"**Ruta:** `{path}`")
                    
                    with st.expander("Ver detalles de IA"):
                        st.markdown("**Contexto Visual:**")
                        st.info(vision)
                        st.markdown("**Transcripción de Audio:**")
                        st.text(audio)
                
                st.markdown("---")
                
        except Exception as e:
            st.error(f"Error durante la búsqueda: {e}")

if __name__ == "__main__":
    main()
