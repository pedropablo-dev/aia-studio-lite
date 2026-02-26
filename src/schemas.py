from pydantic import BaseModel
from typing import List, Dict, Any, Optional

class SceneSchema(BaseModel):
    id: str
    order_index: int
    scene_data: Dict[str, Any]

class ProjectSchema(BaseModel):
    id: str
    title: str
    metadata_config: Dict[str, Any]
    scenes: List[SceneSchema]

class ProjectListSchema(BaseModel):
    id: str
    title: str
    updated_at: str
