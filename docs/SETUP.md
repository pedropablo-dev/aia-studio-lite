# Setup & Usage Guide

## Prerequisites
- Python 3.8+
- Recommended: High-performance GPU for local AI models (if using local inference).
- **Internet Access**: Optional (only for external model downloads if needed). All libs are local or native.

## Installation

1. **Clone/Download** the repository.
2. **Create a Virtual Environment**:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   pip install python-dotenv
   ```


## Configuration (v7.0 External Media Root)

The system now requires an external storage location for massive media assets.

1. **Create .env File**:
   Copy the example or create a new file named `.env` in the project root:
   ```ini
   AIA_MEDIA_ROOT="E:/Your/External/Drive"
   ```

2. **Directory Structure**:
   The system will automatically create these folders inside your `AIA_MEDIA_ROOT` if they don't exist:
   - `brutos/`: **Staging Area**. Drop your raw files here.
   - `input/`: **Processing**. System moves files here for analysis.
   - `proxies/`: **Cache**. Generated low-res/compatible media.
   - `output/`: **Metadata**. Generated .txt files.
   - `db_storage/`: **Database**. Vector DB persistence.

## Running the Application

### Method 1: All-in-One Launcher (Recommended)
This script starts both the FastAPI backend and opens the Frontend in your browser.
```bash
python src/start_studio.py
```
> **Note**: The background process (`monitor.py`) is now controlled directly from the Ingest Studio UI (Footer Toggle). You do NOT need to run it separately.

### Method 2: Manual Start
1. **Start Backend (API)**:
   ```bash
   python -m uvicorn src.api:app --port 9999
   ```
2. **Open Frontend**:
   Open `src/builder.html` in your web browser.

### Method 3: Media Manager (Streamlit)
To access the AI Media Search interface:
```bash
streamlit run src/app.py
```
