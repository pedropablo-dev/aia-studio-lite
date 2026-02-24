import chromadb
import chromadb.utils.embedding_functions as embedding_functions
import os
import sys
from colorama import init, Fore, Style

# Inicializar colorama
init(autoreset=True)

def main():
    print(f"{Fore.CYAN}--- AI MEDIA MANAGER: BÚSQUEDA SEMÁNTICA ---")
    
    # Directorio persistente para la DB (mismo que en db_engine.py)
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'db_storage'))
    
    if not os.path.exists(db_path):
        print(f"{Fore.RED}[ERROR] No se encontró la base de datos en: {db_path}")
        print("Asegúrate de haber procesado videos con monitor.py primero.")
        return

    try:
        client = chromadb.PersistentClient(path=db_path)
        embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
        
        collection = client.get_collection(
            name="video_metadata",
            embedding_function=embedding_fn
        )
        print(f"{Fore.GREEN}[SISTEMA] Conectado a la base de datos de videos.")
        print(f"{Fore.GREEN}[SISTEMA] Total de videos indexados: {collection.count()}")
        
    except Exception as e:
        print(f"{Fore.RED}[ERROR] Fallo al conectar con ChromaDB: {e}")
        return

    print("-" * 50)
    
    while True:
        try:
            query = input(f"{Style.BRIGHT}¿Qué buscas? (o 'salir'): {Style.RESET_ALL}").strip()
            
            if query.lower() in ['salir', 'exit', 'quit']:
                print("Saliendo...")
                break
                
            if not query:
                continue
                
            print(f"{Fore.CYAN}Buscando videos relevantes...")
            
            results = collection.query(
                query_texts=[query],
                n_results=3
            )
            
            ids = results['ids'][0]
            metadatas = results['metadatas'][0]
            distances = results['distances'][0]
            
            if not ids:
                print(f"{Fore.YELLOW}No se encontraron resultados relevantes.")
                continue
                
            print(f"\n{Fore.GREEN}Top 3 Resultados:{Style.RESET_ALL}\n")
            
            for i in range(len(ids)):
                video_id = ids[i]
                meta = metadatas[i]
                dist = distances[i]
                
                print(f"{Fore.YELLOW}Encontrado en: {video_id} {Style.DIM}(Similitud: {1-dist:.2f}){Style.RESET_ALL}")
                
                vision_text = meta.get('vision', 'N/A')
                audio_text = meta.get('audio', 'N/A')
                
                # Truncar textos largos para visualización
                if len(vision_text) > 200: vision_text = vision_text[:200] + "..."
                if len(audio_text) > 200: audio_text = audio_text[:200] + "..."
                
                print(f"{Fore.WHITE}Contexto Visual: {vision_text}")
                print(f"{Fore.LIGHTBLACK_EX}Audio: {audio_text}")
                print(f"{Fore.BLUE}Ruta: {meta.get('path', 'Unknown')}")
                print("-" * 30)
                
        except KeyboardInterrupt:
            print("\nSaliendo...")
            break
        except Exception as e:
            print(f"{Fore.RED}Error en la consulta: {e}")

if __name__ == "__main__":
    main()
