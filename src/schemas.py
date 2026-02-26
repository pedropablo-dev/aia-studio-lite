from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class ProjectSchema(BaseModel):
    id: str
    title: str
    metadata_config: Dict[str, Any]
    scenes: List[Dict[str, Any]]

class ProjectListSchema(BaseModel):
    id: str
    title: str
    updated_at: str
