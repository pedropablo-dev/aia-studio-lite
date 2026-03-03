# Setup & Usage Guide — AIA Studio Lite

## Prerequisites
- Python 3.8+
- **FFmpeg** installed and available on PATH (required for video thumbnail generation).

## Installation

1. **Clone/Download** the repository.
2. **Create a Virtual Environment**:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate   # Windows
   source venv/bin/activate   # macOS/Linux
   ```
3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Configuration

### Media Root (Optional)
You can configure where your media files live in two ways:

1. **Via UI** (recommended): Click the 📁 button in the footer. Set the path in the "Media Root" input. This value is sent as `?folder=` to the API.
2. **Via `.env` file**: Create a `.env` file in the project root:
   ```ini
   AIA_MEDIA_ROOT="E:/Your/External/Drive"
   ```

If neither is set, the system falls back to the default paths in `src/utils.py`.

### Directory Structure
- `input/`: Your media library (scanned by `/lite/files`).

## Running the Application

### Method 1: All-in-One Launcher (Recommended)
```bash
python src/start_studio.py
```
Opens the FastAPI backend on port 9999 and launches `builder.html` in your browser.

### Method 2: Manual Start
1. Start the backend:
   ```bash
   python -m uvicorn src.api:app --port 9999
   ```
2. Open `src/builder.html` in your browser.

## Verifying FFmpeg
Run `ffmpeg -version` in your terminal. If not found, install it from [ffmpeg.org](https://ffmpeg.org/download.html) and add it to your system `PATH`.
